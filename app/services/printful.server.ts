import fs from "fs";
import path from "path";
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

// The public URL of this Railway app — used to serve generated print files
const APP_URL =
  process.env.SHOPIFY_APP_URL ||
  process.env.APP_URL ||
  "https://printful-custom-production.up.railway.app";

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

  console.log(`[printful] ${method} ${endpoint}`);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(
      `[printful] API error ${response.status}:`,
      JSON.stringify(data)
    );
    throw new Error(`Printful ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Save the generated print file to the database (as base64)
 * and return the public URL that Printful can download from.
 *
 * Files are stored in PostgreSQL so they persist across deployments.
 */
async function savePrintFileAndGetUrl(
  localPath: string,
  orderId?: string
): Promise<string> {
  const ext = path.extname(localPath) || ".png";
  const uniqueFilename = `pf-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  // Read the file and convert to base64
  const fileBuffer = fs.readFileSync(localPath);
  const base64Data = fileBuffer.toString("base64");

  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".pdf": "application/pdf",
  };
  const mimeType = mimeTypes[ext.toLowerCase()] || "image/png";

  // Store in database
  await db.printFile.create({
    data: {
      filename: uniqueFilename,
      mimeType,
      data: base64Data,
      orderId: orderId || null,
    },
  });

  const publicUrl = `${APP_URL}/api/print-files/${uniqueFilename}`;
  console.log(`[printful] Print file saved to DB: ${uniqueFilename}`);
  console.log(`[printful] File size: ${fileBuffer.length} bytes`);
  console.log(`[printful] Public URL: ${publicUrl}`);

  return publicUrl;
}

/**
 * Upload a print file to Printful's File Library using a URL.
 * Returns the Printful file ID which can be used in orders.
 *
 * This is a two-step process:
 * 1. POST to /files with the URL → Printful downloads and stores the file
 * 2. Get back the file ID to use in order creation
 *
 * If this fails, we fall back to using the URL directly in the order.
 */
async function uploadToPrintfulFileLibrary(
  publicUrl: string,
  filename: string
): Promise<number | null> {
  try {
    console.log(`[printful] Uploading to Printful File Library: ${publicUrl}`);

    const result = await printfulRequest("/files", "POST", {
      url: publicUrl,
      filename: filename,
      visible: false, // Don't clutter the library
    });

    const fileId = result.result?.id;
    if (fileId) {
      console.log(`[printful] ✓ File uploaded to Printful library: ID ${fileId}`);
      console.log(`[printful]   Status: ${result.result?.status}`);
      return fileId;
    }

    console.log(`[printful] File upload response had no ID:`, JSON.stringify(result));
    return null;
  } catch (error: any) {
    console.error(`[printful] File library upload failed: ${error.message}`);
    return null;
  }
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
 * via the Printful catalog API.
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
      const parts = (lineItem.variant_title || "")
        .split("/")
        .map((s: string) => s.trim());
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
  if (base.category === "shirt") {
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
      threadColorsOptionId: "thread_colors",
    },
    embroidery_front_large: {
      fileType: "embroidery_front_large",
      threadColorsOptionId: "thread_colors",
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
 *
 * Flow:
 * 1. Generate the custom print file (PNG) based on personalization data
 * 2. Store it in the database and get a public URL
 * 3. Upload to Printful's File Library for reliable access
 * 4. Resolve the correct Printful variant ID
 * 5. Create a draft order in Printful with the custom print file
 */
export async function processPersonalizedOrder(
  recordId: string,
  shopifyOrder: any
) {
  console.log(`[printful] ═══════════════════════════════════════════════`);
  console.log(`[printful] Processing personalization order ${recordId}...`);

  try {
    // 1. Load the record
    const record = await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "generating" },
    });

    console.log(`[printful] Order: ${record.shopifyOrderName}`);
    console.log(`[printful] Product base: ${record.productBaseSlug || "legacy"}`);
    console.log(`[printful] Technique: ${record.technique || "embroidery"}`);
    console.log(`[printful] Monogram: "${record.monogramText}" (${record.monogramStyle})`);

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

      console.log(`[printful] Generating print file with ${layers.length} layers`);

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

      console.log(`[printful] Legacy monogram: "${record.monogramText}" style=${record.monogramStyle} color=${threadColor}`);

      printFilePath = generateMonogram({
        text: record.monogramText || "ABC",
        style: (record.monogramStyle as "script" | "block") || "script",
        color: threadColor,
      });
    }

    console.log(`[printful] Print file generated: ${printFilePath}`);

    // 3. Save print file to database and get public URL
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "uploading" },
    });

    const printFileUrl = await savePrintFileAndGetUrl(printFilePath, recordId);

    // 4. Upload to Printful's File Library for reliable access
    const printfulFileId = await uploadToPrintfulFileLibrary(
      printFileUrl,
      `monogram-${record.shopifyOrderName}.png`
    );

    // 5. Resolve the Printful variant ID
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

    console.log(`[printful] Resolved variant ID: ${printfulVariantId}`);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printFileUrl,
        printfulFileId: printfulFileId ? String(printfulFileId) : null,
        printfulVariantId,
        status: "submitting",
      },
    });

    // 6. Build the Printful order
    const shipping = shopifyOrder.shipping_address || {};
    const { fileType, threadColorsOptionId } =
      getPlacementConfig(placementKey);

    const normalizedColor = normalizeThreadColor(threadColor);

    console.log(`[printful] File type: ${fileType}`);
    console.log(`[printful] Thread color: ${normalizedColor}`);
    console.log(`[printful] Print file URL: ${printFileUrl}`);
    if (printfulFileId) {
      console.log(`[printful] Printful file ID: ${printfulFileId}`);
    }

    // Build the file reference — prefer Printful file ID if available
    const fileRef: any = { type: fileType };
    if (printfulFileId) {
      fileRef.id = printfulFileId;
    } else {
      fileRef.url = printFileUrl;
    }

    const itemPayload: any = {
      external_id: record.shopifyVariantId,
      variant_id: printfulVariantId,
      quantity: 1,
      files: [fileRef],
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

    const recipientName =
      `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() ||
      "Customer";

    const printfulOrderBody = {
      external_id: `shopify-${record.shopifyOrderId}`,
      shipping: "STANDARD",
      recipient: {
        name: recipientName,
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
      `[printful] Submitting order to Printful: variant=${printfulVariantId}, file=${fileType}, technique=${technique}`
    );
    console.log(
      `[printful] Recipient: ${recipientName}, ${shipping.city || "?"}, ${shipping.province_code || "?"} ${shipping.zip || "?"}`
    );

    // Submit as draft so the store owner can review before charges
    const orderResult = await printfulRequest(
      "/orders",
      "POST",
      printfulOrderBody
    );

    const printfulOrderId = String(orderResult.result.id);
    const printfulStatus = orderResult.result.status;

    // 7. Update record as completed
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printfulOrderId,
        printfulStatus,
        status: "completed",
      },
    });

    console.log(
      `[printful] ✓ Order ${recordId} completed → Printful #${printfulOrderId} (${printfulStatus})`
    );
    console.log(
      `[printful] Dashboard: https://www.printful.com/dashboard?order_id=${printfulOrderId}`
    );
    console.log(`[printful] ═══════════════════════════════════════════════`);

    // Clean up the original temp file (data is now in DB)
    try {
      fs.unlinkSync(printFilePath);
    } catch {
      // Ignore cleanup errors
    }
  } catch (error: any) {
    console.error(
      `[printful] ✗ Error processing order ${recordId}:`,
      error.message
    );
    console.error(`[printful] Stack:`, error.stack);
    console.log(`[printful] ═══════════════════════════════════════════════`);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        status: "failed",
        errorMessage: error.message?.substring(0, 500) || "Unknown error",
      },
    });
  }
}
