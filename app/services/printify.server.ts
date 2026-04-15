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
 * Upload a print file to Printify using base64 encoding (from local file).
 * Returns the Printify image object with id, file_name, preview_url, etc.
 */
async function uploadImageToPrintify(
  localPath: string,
  filename: string
): Promise<{ id: string; preview_url: string }> {
  console.log(`[printify] Uploading image from file: ${filename}`);

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

/**
 * Upload a print file to Printify using base64 encoding (from base64 string).
 * Used for customer-uploaded images stored in the database.
 */
async function uploadBase64ToPrintify(
  base64Data: string,
  filename: string,
  mimeType: string = "image/png"
): Promise<{ id: string; preview_url: string }> {
  console.log(`[printify] Uploading base64 image: ${filename} (${Math.round(base64Data.length / 1024)}KB)`);

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

/**
 * Download an image from a URL and return its base64 data.
 * Used to fetch customer-uploaded images from our server or Shopify CDN.
 */
async function downloadImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  console.log(`[printify] Downloading image from: ${imageUrl}`);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") || "image/png";
  const base64 = buffer.toString("base64");

  console.log(`[printify] Downloaded: ${buffer.length} bytes, ${mimeType}`);

  return { base64, mimeType };
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

// ─── Detect if order has customer-uploaded image ──────────────────────────

function hasCustomerUploadedImage(record: any): boolean {
  // Check 1: printFileUrl is set and looks like a customer upload
  if (record.printFileUrl && record.printFileUrl.includes("/api/print-files/cust-")) {
    return true;
  }

  // Check 2: personalizationData contains image layers with uploadedUrl
  try {
    const persData = JSON.parse(record.personalizationData || "{}");
    for (const key of Object.keys(persData)) {
      const layer = persData[key];
      if (layer.type === "image" && (layer.uploadedUrl || layer.hasImage)) {
        return true;
      }
    }
  } catch {
    // ignore parse errors
  }

  return false;
}

/**
 * Get the customer-uploaded image URL from the record.
 * Checks printFileUrl first, then personalizationData layers.
 */
function getCustomerImageUrl(record: any): string | null {
  // Check printFileUrl first (set by webhook from _uploaded_image_url)
  if (record.printFileUrl && record.printFileUrl.includes("/api/print-files/")) {
    return record.printFileUrl;
  }

  // Check personalizationData layers
  try {
    const persData = JSON.parse(record.personalizationData || "{}");
    for (const key of Object.keys(persData)) {
      const layer = persData[key];
      if (layer.type === "image" && layer.uploadedUrl) {
        return layer.uploadedUrl;
      }
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

// ─── Main Processing Pipeline ──────────────────────────────────────────────

/**
 * Process a personalized order for Printify fulfillment.
 *
 * Supports two flows:
 * A) Customer-uploaded image (e.g., tote bag): Download the image, upload to Printify
 * B) Text/monogram personalization: Generate print file, upload to Printify
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
    console.log(`[printify] PrintFileUrl: ${record.printFileUrl || "none"}`);

    const base = getProductBase(record.productBaseSlug!);
    if (!base) {
      throw new Error(`Product base not found: ${record.productBaseSlug}`);
    }

    let printifyImage: { id: string; preview_url: string };

    // ─── Determine flow: customer image upload vs text/monogram ───
    const customerImageUrl = getCustomerImageUrl(record);

    if (customerImageUrl) {
      // ═══ FLOW A: Customer-uploaded image (tote bag, DTG) ═══
      console.log(`[printify] Flow A: Customer-uploaded image`);
      console.log(`[printify] Image URL: ${customerImageUrl}`);

      await db.personalizationOrder.update({
        where: { id: recordId },
        data: { status: "uploading" },
      });

      // Download the image from our server (or wherever it's stored)
      const { base64, mimeType } = await downloadImageAsBase64(customerImageUrl);

      // Upload to Printify
      const orderFilename = `custom-${record.shopifyOrderName.replace("#", "")}-${Date.now()}.png`;
      printifyImage = await uploadBase64ToPrintify(base64, orderFilename, mimeType);

      console.log(`[printify] ✓ Customer image uploaded to Printify: ${printifyImage.id}`);

    } else {
      // ═══ FLOW B: Text/monogram personalization ═══
      console.log(`[printify] Flow B: Text/monogram personalization`);

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
        value: l.text || l.value || "",
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

      // Generate the print file
      const printFilePath = await generatePrintFileAsync({
        productBaseSlug: record.productBaseSlug!,
        technique,
        placementKey,
        layers,
      });

      console.log(`[printify] Print file generated: ${printFilePath}`);

      // Upload to Printify (base64)
      await db.personalizationOrder.update({
        where: { id: recordId },
        data: { status: "uploading" },
      });

      const orderFilename = `monogram-${record.shopifyOrderName.replace("#", "")}-${Date.now()}.png`;
      printifyImage = await uploadImageToPrintify(printFilePath, orderFilename);

      console.log(`[printify] ✓ Print file uploaded to Printify: ${printifyImage.id}`);

      // Clean up temp file
      try {
        fs.unlinkSync(printFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }

    // ─── Common: Create the Printify order ───

    // Resolve the Printify variant ID
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

    // Build the Printify order
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

    // Update record as completed
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
