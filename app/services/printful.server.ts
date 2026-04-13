import fs from "fs";
import { execSync } from "child_process";
import db from "../db.server";
import { generateMonogram } from "./monogram.server";

const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_API = "https://api.printful.com";

// Printful catalog variant ID for Yupoong 6245CM (White, One size)
const PRINTFUL_CATALOG_VARIANT_ID = 7853;

// Allowed Printful thread colors
const ALLOWED_THREAD_COLORS = [
  "#FFFFFF", "#000000", "#96A1A8", "#A67843", "#FFCC00",
  "#E25C27", "#CC3366", "#CC3333", "#660000", "#333366",
  "#005397", "#3399FF", "#6B5294", "#01784E", "#7BA35A",
];

async function printfulRequest(endpoint: string, method: string = "GET", body?: any) {
  const url = `${PRINTFUL_API}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${PRINTFUL_TOKEN}`,
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
 * Upload a local file to a public URL using manus-upload-file,
 * then add it to Printful's file library.
 */
async function uploadPrintFile(localPath: string): Promise<{ url: string; fileId: number }> {
  // Upload to public CDN
  const output = execSync(`manus-upload-file ${localPath}`, { encoding: "utf-8", timeout: 120000 }).trim();
  
  // Extract the CDN URL from the output (may contain multiple lines of progress info)
  const lines = output.split("\n");
  let publicUrl = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
      publicUrl = trimmed;
    }
    // Also check for "CDN URL: https://..." pattern
    const cdnMatch = trimmed.match(/CDN URL:\s*(https?:\/\/\S+)/);
    if (cdnMatch) {
      publicUrl = cdnMatch[1];
    }
  }

  if (!publicUrl) {
    throw new Error(`Failed to get public URL from upload: ${output}`);
  }

  console.log(`[printful] Public URL: ${publicUrl}`);

  // Add to Printful file library
  const fileResult = await printfulRequest("/files", "POST", {
    url: publicUrl,
  });

  const fileId = fileResult.result.id;
  console.log(`[printful] File added to library: ID ${fileId}`);

  return { url: publicUrl, fileId };
}

/**
 * Find the closest allowed thread color.
 */
function normalizeThreadColor(color: string): string {
  const upper = color.toUpperCase();
  if (ALLOWED_THREAD_COLORS.includes(upper)) {
    return upper;
  }
  // Default to black if not in allowed list
  console.log(`[printful] Thread color ${color} not in allowed list, defaulting to #000000`);
  return "#000000";
}

/**
 * Main pipeline: process a personalized order end-to-end.
 * Called fire-and-forget from the webhook handler.
 */
export async function processPersonalizedOrder(recordId: string, shopifyOrder: any) {
  console.log(`[printful] Processing personalization order ${recordId}...`);

  try {
    // 1. Update status to generating
    const record = await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "generating" },
    });

    // 2. Generate the monogram print file
    const printFilePath = generateMonogram({
      text: record.monogramText,
      style: record.monogramStyle as "script" | "block",
      color: record.threadColor,
    });

    // 3. Upload to Printful
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "uploading" },
    });

    const { url: printFileUrl, fileId } = await uploadPrintFile(printFilePath);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printFileUrl,
        printfulFileId: String(fileId),
        status: "submitting",
      },
    });

    // 4. Resolve the Printful external variant ID from the Shopify variant
    const externalVariantId = record.shopifyVariantId;
    const threadColor = normalizeThreadColor(record.threadColor);

    // 5. Create the Printful order
    const shipping = shopifyOrder.shipping_address || {};
    const printfulOrderBody = {
      external_id: `shopify-${record.shopifyOrderId}`,
      shipping: "STANDARD",
      recipient: {
        name: `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() || "Customer",
        address1: shipping.address1 || "",
        address2: shipping.address2 || "",
        city: shipping.city || "",
        state_code: shipping.province_code || "",
        country_code: shipping.country_code || "US",
        zip: shipping.zip || "",
        phone: shipping.phone || "",
        email: shopifyOrder.email || "",
      },
      items: [
        {
          external_id: externalVariantId,
          variant_id: PRINTFUL_CATALOG_VARIANT_ID,
          quantity: 1,
          files: [
            {
              type: "embroidery_front_large",
              id: fileId,
            },
          ],
          options: [
            {
              id: "thread_colors_front_large",
              value: [threadColor],
            },
          ],
        },
      ],
    };

    console.log(`[printful] Submitting order for "${record.monogramText}" to Printful...`);
    // Submit as draft (no confirm) so the store owner can review before charges
    const orderResult = await printfulRequest("/orders", "POST", printfulOrderBody);

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

    console.log(`[printful] ✅ Order ${recordId} completed → Printful #${printfulOrderId} (${printfulStatus})`);

    // Clean up temp file
    try {
      fs.unlinkSync(printFilePath);
    } catch {
      // Ignore cleanup errors
    }
  } catch (error: any) {
    console.error(`[printful] ❌ Error processing order ${recordId}:`, error.message);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        status: "failed",
        errorMessage: error.message?.substring(0, 500) || "Unknown error",
      },
    });
  }
}
