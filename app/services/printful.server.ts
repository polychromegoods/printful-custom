import fs from "fs";
import { execSync } from "child_process";
import db from "../db.server";
import {
  generateMonogram,
  generatePrintFileAsync,
  type LayerInput,
} from "./monogram.server";
import {
  getProductBase,
  EMBROIDERY_THREAD_COLORS,
  type ProductBase,
} from "../config/product-bases";

const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_API = "https://api.printful.com";

// ─── Printful API Helpers ───────────────────────────────────────────────────

async function printfulRequest(
  endpoint: string,
  method: string = "GET",
  body?: any
) {
  const url = `${PRINTFUL_API}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${PRINTFUL_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Printful ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Upload a local file to a public URL, then add it to Printful's file library.
 */
async function uploadPrintFile(
  localPath: string
): Promise<{ url: string; fileId: number }> {
  let publicUrl = "";

  // Try manus-upload-file first (available in sandbox)
  try {
    const output = execSync(`manus-upload-file ${localPath}`, {
      encoding: "utf-8",
      timeout: 120000,
    }).trim();

    const lines = output.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
        publicUrl = trimmed;
      }
      const cdnMatch = trimmed.match(/CDN URL:\s*(https?:\/\/\S+)/);
      if (cdnMatch) {
        publicUrl = cdnMatch[1];
      }
    }
  } catch (err) {
    console.log("[printful] manus-upload-file not available, trying base64...");
  }

  // Fallback: upload as base64 directly to Printful
  if (!publicUrl) {
    const fileBuffer = fs.readFileSync(localPath);
    const base64 = fileBuffer.toString("base64");
    const mimeType = "image/png";

    const fileResult = await printfulRequest("/files", "POST", {
      file_data: `data:${mimeType};base64,${base64}`,
    });

    const fileId = fileResult.result.id;
    const fileUrl = fileResult.result.preview_url || fileResult.result.url || "";
    console.log(`[printful] File uploaded via base64: ID ${fileId}`);

    return { url: fileUrl, fileId };
  }

  console.log(`[printful] Public URL: ${publicUrl}`);

  // Add to Printful file library via URL
  const fileResult = await printfulRequest("/files", "POST", {
    url: publicUrl,
  });

  const fileId = fileResult.result.id;
  console.log(`[printful] File added to library: ID ${fileId}`);

  return { url: publicUrl, fileId };
}

// ─── Thread Color Helpers ───────────────────────────────────────────────────

const ALLOWED_THREAD_COLORS = EMBROIDERY_THREAD_COLORS.map((tc) => tc.hex);

function normalizeThreadColor(color: string): string {
  const upper = color.toUpperCase();
  if (ALLOWED_THREAD_COLORS.includes(upper)) {
    return upper;
  }
  console.log(
    `[printful] Thread color ${color} not in allowed list, defaulting to #000000`
  );
  return "#000000";
}

// ─── Variant Resolution ─────────────────────────────────────────────────────

/**
 * Resolve the correct Printful catalog variant ID from the Shopify variant
 * and the product base registry.
 *
 * For hats (one size), we match by color.
 * For shirts (sized), we need to look up the specific size+color combo
 * via the Printful sync API or catalog API.
 */
async function resolvePrintfulVariantId(
  base: ProductBase,
  shopifyVariantId: string,
  shopifyOrder: any
): Promise<number> {
  // First, try to find the variant color from the Shopify line item
  let variantColor = "";
  let variantSize = "";

  for (const lineItem of shopifyOrder.line_items || []) {
    if (String(lineItem.variant_id) === shopifyVariantId) {
      // Extract color and size from variant title (e.g., "White / S")
      const parts = (lineItem.variant_title || "").split("/").map((s: string) => s.trim());
      if (parts.length >= 1) variantColor = parts[0];
      if (parts.length >= 2) variantSize = parts[1];

      // Also check variant options
      if (!variantColor && lineItem.variant_options) {
        variantColor = lineItem.variant_options[0] || "";
      }
      break;
    }
  }

  console.log(
    `[printful] Resolving variant: color="${variantColor}", size="${variantSize}"`
  );

  // For hats (one size), just match by color
  if (base.category === "hat") {
    const match = base.variants.find(
      (v) => v.color.toLowerCase() === variantColor.toLowerCase()
    );
    if (match) {
      console.log(
        `[printful] Matched hat variant: ${match.color} → ${match.printfulVariantId}`
      );
      return match.printfulVariantId;
    }
    // Default to first variant
    console.log(
      `[printful] No color match for hat, using default variant ${base.variants[0].printfulVariantId}`
    );
    return base.variants[0].printfulVariantId;
  }

  // For sized products (shirts), we need to find the exact color+size combo
  // The registry only stores size S references, so we need to calculate the offset
  // or use the Printful API to look up the exact variant
  if (base.category === "shirt") {
    // Try to find via Printful catalog API
    try {
      const catalogResult = await printfulRequest(
        `/products/${base.printfulProductId}`
      );
      const variants = catalogResult.result.variants || [];

      // Find matching color + size
      const match = variants.find(
        (v: any) =>
          v.color?.toLowerCase() === variantColor.toLowerCase() &&
          v.size?.toLowerCase() === variantSize.toLowerCase()
      );

      if (match) {
        console.log(
          `[printful] Matched shirt variant: ${match.color} ${match.size} → ${match.id}`
        );
        return match.id;
      }

      // Try color-only match (default to size S)
      const colorMatch = variants.find(
        (v: any) => v.color?.toLowerCase() === variantColor.toLowerCase()
      );
      if (colorMatch) {
        console.log(
          `[printful] Color-only match for shirt: ${colorMatch.color} ${colorMatch.size} → ${colorMatch.id}`
        );
        return colorMatch.id;
      }
    } catch (err) {
      console.error("[printful] Error looking up catalog variants:", err);
    }

    // Fallback to registry
    const registryMatch = base.variants.find(
      (v) => v.color.toLowerCase() === variantColor.toLowerCase()
    );
    if (registryMatch) {
      return registryMatch.printfulVariantId;
    }
  }

  // Ultimate fallback
  console.log(
    `[printful] No variant match found, using first variant: ${base.variants[0].printfulVariantId}`
  );
  return base.variants[0].printfulVariantId;
}

// ─── Placement Key Mapping ──────────────────────────────────────────────────

/**
 * Map our placement key to the Printful file type and options key.
 */
function getPlacementConfig(placementKey: string): {
  fileType: string;
  threadColorsOptionId: string | null;
} {
  const mapping: Record<
    string,
    { fileType: string; threadColorsOptionId: string | null }
  > = {
    // Hat embroidery
    embroidery_front: {
      fileType: "embroidery_front",
      threadColorsOptionId: "thread_colors_front",
    },
    embroidery_front_large: {
      fileType: "embroidery_front_large",
      threadColorsOptionId: "thread_colors_front_large",
    },
    // Shirt embroidery
    embroidery_chest_left: {
      fileType: "embroidery_chest_left",
      threadColorsOptionId: "thread_colors_chest_left",
    },
    embroidery_chest_center: {
      fileType: "embroidery_chest_center",
      threadColorsOptionId: "thread_colors_chest_center",
    },
    embroidery_large_front: {
      fileType: "embroidery_large_front",
      threadColorsOptionId: "thread_colors_large_front",
    },
    // DTG / DTF printing
    front: { fileType: "front", threadColorsOptionId: null },
    front_dtf: { fileType: "front", threadColorsOptionId: null },
  };

  return (
    mapping[placementKey] || {
      fileType: placementKey,
      threadColorsOptionId: null,
    }
  );
}

// ─── Main Processing Pipeline ───────────────────────────────────────────────

/**
 * Process a personalized order end-to-end.
 * Handles both new template-based orders and legacy monogram orders.
 */
export async function processPersonalizedOrder(
  recordId: string,
  shopifyOrder: any
) {
  console.log(`[printful] Processing personalization order ${recordId}...`);

  try {
    // 1. Load the record
    const record = await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "generating" },
    });

    // 2. Determine if this is a template-based or legacy order
    const isTemplateBased = !!record.productBaseSlug && !!record.technique;

    let printFilePath: string;
    let base: ProductBase | undefined;
    let technique: string;
    let placementKey: string;
    let threadColor: string;

    if (isTemplateBased) {
      // ─── Template-based order ───
      base = getProductBase(record.productBaseSlug!);
      technique = record.technique!;
      placementKey = record.placementKey || "embroidery_front";

      // Parse personalization data
      let persData: { layers?: any[] } = {};
      try {
        persData = JSON.parse(record.personalizationData || "{}");
      } catch {
        console.error("[printful] Failed to parse personalizationData");
      }

      // Build layer inputs from personalization data
      const layers: LayerInput[] = (persData.layers || []).map((l: any) => ({
        key: l.key || "text",
        type: l.type || "text",
        value: (l.text || l.value || "").toUpperCase().replace(/[^A-Z0-9 ]/g, ""),
        font: l.font || "block",
        color: l.color || "#000000",
        position: l.position || { x: 10, y: 10, width: 80, height: 80 },
      }));

      // If no layers from persData, fall back to legacy monogram fields
      if (layers.length === 0 && record.monogramText) {
        layers.push({
          key: "monogram_text",
          type: "text",
          value: record.monogramText,
          font: record.monogramStyle || "block",
          color: record.threadColor || "#000000",
          position: { x: 10, y: 10, width: 80, height: 80 },
        });
      }

      // Get the primary thread color from the first text layer
      threadColor = layers.find((l) => l.type === "text")?.color || "#000000";

      // Generate the print file
      printFilePath = await generatePrintFileAsync({
        productBaseSlug: record.productBaseSlug!,
        technique,
        placementKey,
        layers,
      });
    } else {
      // ─── Legacy monogram order ───
      base = getProductBase("yupoong-6245cm"); // Default to dad hat
      technique = "embroidery";
      placementKey = "embroidery_front";
      threadColor = record.threadColor || "#000000";

      printFilePath = generateMonogram({
        text: record.monogramText || "ABC",
        style: (record.monogramStyle as "script" | "block") || "script",
        color: threadColor,
      });
    }

    // 3. Upload to Printful
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "uploading" },
    });

    const { url: printFileUrl, fileId } = await uploadPrintFile(printFilePath);

    // 4. Resolve the Printful variant ID
    let printfulVariantId: number;

    if (base) {
      printfulVariantId = await resolvePrintfulVariantId(
        base,
        record.shopifyVariantId,
        shopifyOrder
      );
    } else {
      // Fallback: use the Shopify variant ID as external ID
      printfulVariantId = 7853; // Default white Yupoong
    }

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printFileUrl,
        printfulFileId: String(fileId),
        printfulVariantId,
        status: "submitting",
      },
    });

    // 5. Build the Printful order
    const shipping = shopifyOrder.shipping_address || {};
    const { fileType, threadColorsOptionId } =
      getPlacementConfig(placementKey);

    const normalizedColor = normalizeThreadColor(threadColor);

    const itemPayload: any = {
      external_id: record.shopifyVariantId,
      variant_id: printfulVariantId,
      quantity: 1,
      files: [
        {
          type: fileType,
          id: fileId,
        },
      ],
    };

    // Add thread colors option for embroidery orders
    if (technique === "embroidery" && threadColorsOptionId) {
      itemPayload.options = [
        {
          id: threadColorsOptionId,
          value: [normalizedColor],
        },
      ];
    }

    const printfulOrderBody = {
      external_id: `shopify-${record.shopifyOrderId}`,
      shipping: "STANDARD",
      recipient: {
        name:
          `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() ||
          "Customer",
        address1: shipping.address1 || "",
        address2: shipping.address2 || "",
        city: shipping.city || "",
        state_code: shipping.province_code || "",
        country_code: shipping.country_code || "US",
        zip: shipping.zip || "",
        phone: shipping.phone || "",
        email: shopifyOrder.email || "",
      },
      items: [itemPayload],
    };

    console.log(
      `[printful] Submitting order: variant=${printfulVariantId}, file=${fileType}, technique=${technique}`
    );

    // Submit as draft so the store owner can review before charges
    const orderResult = await printfulRequest(
      "/orders",
      "POST",
      printfulOrderBody
    );

    const printfulOrderId = String(orderResult.result.id);
    const printfulStatus = orderResult.result.status;

    // 6. Update record as completed
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printfulOrderId,
        printfulStatus,
        status: "completed",
      },
    });

    console.log(
      `[printful] Order ${recordId} completed → Printful #${printfulOrderId} (${printfulStatus})`
    );

    // Clean up temp file
    try {
      fs.unlinkSync(printFilePath);
    } catch {
      // Ignore cleanup errors
    }
  } catch (error: any) {
    console.error(
      `[printful] Error processing order ${recordId}:`,
      error.message
    );

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        status: "failed",
        errorMessage: error.message?.substring(0, 500) || "Unknown error",
      },
    });
  }
}
