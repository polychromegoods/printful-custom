import fs from "fs";
import db from "../db.server";
import {
  generatePrintFileAsync,
  type LayerInput,
} from "./monogram.server";
import {
  getProductBase,
  type ProductBase,
} from "../config/product-bases";

const PRINTIFY_TOKEN = process.env.PRINTIFY_TOKEN || "";
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID || "12491740";
const PRINTIFY_API = "https://api.printify.com/v1";

// ─── Printify API Helpers ──────────────────────────────────────────────────

async function printifyRequest(
  endpoint: string,
  method: string = "GET",
  body?: any
) {
  const url = `${PRINTIFY_API}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${PRINTIFY_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`[printify] ${method} ${endpoint}`);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(
      `[printify] API error ${response.status}:`,
      JSON.stringify(data)
    );
    throw new Error(`Printify ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

// ─── Image Upload ──────────────────────────────────────────────────────────

/**
 * Upload a print file to Printify using base64 encoding.
 * Returns the Printify image object with id, file_name, preview_url, etc.
 */
async function uploadImageToPrintify(
  localPath: string,
  filename: string
): Promise<{ id: string; preview_url: string }> {
  console.log(`[printify] Uploading image: ${filename}`);

  const fileBuffer = fs.readFileSync(localPath);
  const base64Data = fileBuffer.toString("base64");

  console.log(`[printify] File size: ${fileBuffer.length} bytes`);

  const result = await printifyRequest("/uploads/images.json", "POST", {
    file_name: filename,
    contents: base64Data,
  });

  console.log(`[printify] ✓ Image uploaded: ID=${result.id}`);
  console.log(`[printify]   Preview: ${result.preview_url}`);

  return {
    id: result.id,
    preview_url: result.preview_url,
  };
}

// ─── Variant Resolution ────────────────────────────────────────────────────

function resolvePrintifyVariantId(
  base: ProductBase,
  shopifyVariantId: string,
  shopifyOrder: any
): number {
  let variantColor = "";

  for (const lineItem of shopifyOrder.line_items || []) {
    if (String(lineItem.variant_id) === shopifyVariantId) {
      const parts = (lineItem.variant_title || "")
        .split("/")
        .map((s: string) => s.trim());
      if (parts.length >= 1) variantColor = parts[0];

      if (!variantColor && lineItem.variant_options) {
        variantColor = lineItem.variant_options[0] || "";
      }
      break;
    }
  }

  console.log(`[printify] Resolving variant: color="${variantColor}"`);

  const match = base.variants.find(
    (v) => v.color.toLowerCase() === variantColor.toLowerCase()
  );

  if (match?.printifyVariantId) {
    console.log(
      `[printify] Matched variant: ${match.color} → ${match.printifyVariantId}`
    );
    return match.printifyVariantId;
  }

  // Default to first variant
  const defaultVariant = base.variants[0].printifyVariantId || 101409;
  console.log(
    `[printify] No color match, using default variant: ${defaultVariant}`
  );
  return defaultVariant;
}

// ─── Main Processing Pipeline ──────────────────────────────────────────────

/**
 * Process a personalized order for Printify fulfillment.
 *
 * Flow:
 * 1. Generate the custom print file (PNG) based on personalization data
 * 2. Upload to Printify via base64 (no CDN workaround needed!)
 * 3. Resolve the correct Printify variant ID
 * 4. Create an order in Printify with the custom print file
 */
export async function processPersonalizedOrderPrintify(
  recordId: string,
  shopifyOrder: any
) {
  console.log(`[printify] ═══════════════════════════════════════════════`);
  console.log(`[printify] Processing personalization order ${recordId}...`);

  try {
    // 1. Load the record
    const record = await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "generating", fulfillmentProvider: "printify" },
    });

    console.log(`[printify] Order: ${record.shopifyOrderName}`);
    console.log(`[printify] Shop: ${record.shop}`);
    console.log(`[printify] Product base: ${record.productBaseSlug || "unknown"}`);
    console.log(`[printify] Technique: ${record.technique || "dtg"}`);

    const base = getProductBase(record.productBaseSlug!);
    if (!base) {
      throw new Error(`Product base not found: ${record.productBaseSlug}`);
    }

    const technique = record.technique || "dtg";
    const placementKey = record.placementKey || "front";

    // Parse personalization data
    let persData: { layers?: any[] } = {};
    try {
      persData = JSON.parse(record.personalizationData || "{}");
    } catch {
      console.error("[printify] Failed to parse personalizationData");
    }

    const layers: LayerInput[] = (persData.layers || []).map((l: any) => ({
      key: l.key || "text",
      type: l.type || "text",
      value: (l.text || l.value || "").toUpperCase().replace(/[^A-Z0-9 ]/g, ""),
      font: l.font || "block",
      color: l.color || "#000000",
      position: l.position || { x: 10, y: 10, width: 80, height: 80 },
    }));

    // Fallback: use legacy monogram fields
    if (layers.length === 0 && record.monogramText) {
      layers.push({
        key: "main_text",
        type: "text",
        value: record.monogramText,
        font: record.monogramStyle || "block",
        color: record.threadColor || "#000000",
        position: { x: 10, y: 10, width: 80, height: 80 },
      });
    }

    console.log(`[printify] Generating print file with ${layers.length} layers`);

    // 2. Generate the print file
    const printFilePath = await generatePrintFileAsync({
      productBaseSlug: record.productBaseSlug!,
      technique,
      placementKey,
      layers,
    });

    console.log(`[printify] Print file generated: ${printFilePath}`);

    // 3. Upload to Printify (base64 — much simpler than Printful!)
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "uploading" },
    });

    const orderFilename = `monogram-${record.shopifyOrderName.replace("#", "")}-${Date.now()}.png`;

    const printifyImage = await uploadImageToPrintify(
      printFilePath,
      orderFilename
    );

    console.log(`[printify] ✓ Image uploaded to Printify: ${printifyImage.id}`);

    // 4. Resolve the Printify variant ID
    const printifyVariantId = resolvePrintifyVariantId(
      base,
      record.shopifyVariantId,
      shopifyOrder
    );

    console.log(`[printify] Resolved variant ID: ${printifyVariantId}`);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printFileUrl: printifyImage.preview_url,
        printifyImageId: printifyImage.id,
        printifyVariantId: printifyVariantId,
        status: "submitting",
      },
    });

    // 5. Build the Printify order
    const shipping = shopifyOrder.shipping_address || {};
    const recipientName =
      `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() ||
      "Customer";

    // Printify order with inline product creation
    const printifyOrderBody = {
      external_id: `shopify-${record.shopifyOrderId}`,
      label: `${record.shopifyOrderName} - Personalized ${base.name}`,
      line_items: [
        {
          print_provider_id: base.printifyProviderId,
          blueprint_id: base.printifyBlueprintId,
          variant_id: printifyVariantId,
          print_areas: {
            front: {
              src: printifyImage.id,
              scale: 1,
              x: 0.5,
              y: 0.5,
              angle: 0,
            },
          },
          quantity: 1,
        },
      ],
      shipping_method: 1, // Standard shipping
      is_printify_express: false,
      send_shipping_notification: false, // We handle this ourselves
      address_to: {
        first_name: shipping.first_name || "",
        last_name: shipping.last_name || "",
        email: shopifyOrder.email || "",
        phone: shipping.phone || "",
        country: shipping.country_code || "US",
        region: shipping.province || "",
        address1: shipping.address1 || "",
        address2: shipping.address2 || "",
        city: shipping.city || "",
        zip: shipping.zip || "",
      },
    };

    console.log(
      `[printify] Submitting order to Printify: variant=${printifyVariantId}, blueprint=${base.printifyBlueprintId}`
    );
    console.log(
      `[printify] Recipient: ${recipientName}, ${shipping.city || "?"}, ${shipping.province_code || "?"} ${shipping.zip || "?"}`
    );

    const orderResult = await printifyRequest(
      `/shops/${PRINTIFY_SHOP_ID}/orders.json`,
      "POST",
      printifyOrderBody
    );

    const printifyOrderId = String(orderResult.id);
    const printifyStatus = orderResult.status || "pending";

    // 6. Update record as completed
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printifyOrderId,
        printifyStatus,
        status: "completed",
      },
    });

    console.log(
      `[printify] ✓ Order ${recordId} completed → Printify #${printifyOrderId} (${printifyStatus})`
    );
    console.log(`[printify] ═══════════════════════════════════════════════`);

    // Clean up temp file
    try {
      fs.unlinkSync(printFilePath);
    } catch {
      // Ignore cleanup errors
    }
  } catch (error: any) {
    console.error(
      `[printify] ✗ Error processing order ${recordId}:`,
      error.message
    );
    console.error(`[printify] Stack:`, error.stack);
    console.log(`[printify] ═══════════════════════════════════════════════`);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        status: "failed",
        errorMessage: error.message?.substring(0, 500) || "Unknown error",
      },
    });
  }
}
