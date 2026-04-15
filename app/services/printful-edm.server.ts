/**
 * printful-edm.server.ts
 *
 * Handles order creation for products designed via the Printful Embedded Designer.
 * Instead of generating a print file, we pass the saved product_template_id (or
 * external_product_id) directly to Printful when creating the order.
 *
 * Flow:
 * 1. Customer uses EDM widget on product page → saves design → gets templateId
 * 2. templateId stored as line item property _printful_template_id
 * 3. On order webhook, this function is called instead of processPersonalizedOrder
 * 4. We create a Printful order referencing the template_id + variant_id
 */

import db from "../db.server";

const PRINTFUL_API = "https://api.printful.com";

async function printfulRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
  token?: string
) {
  const PRINTFUL_TOKEN = token || process.env.PRINTFUL_TOKEN || "";
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

  console.log(`[printful-edm] ${method} ${endpoint}`);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(
      `[printful-edm] API error ${response.status}:`,
      JSON.stringify(data)
    );
    throw new Error(
      `Printful ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

/**
 * Resolve the Printful variant ID from the Shopify variant title.
 * For EDM products (shirts), we look up the catalog to match color + size.
 */
async function resolveVariantId(
  printfulProductId: string | number,
  variantTitle: string
): Promise<number | null> {
  try {
    const parts = variantTitle.split("/").map((s) => s.trim());
    const color = parts[0] || "";
    const size = parts[1] || "";

    const catalogResult = await printfulRequest(
      `/products/${printfulProductId}`
    );
    const variants = catalogResult.result?.variants || [];

    // Exact match first
    const exact = variants.find(
      (v: any) =>
        v.color?.toLowerCase() === color.toLowerCase() &&
        v.size?.toLowerCase() === size.toLowerCase()
    );
    if (exact) return exact.id;

    // Color-only match
    const colorOnly = variants.find(
      (v: any) => v.color?.toLowerCase() === color.toLowerCase()
    );
    if (colorOnly) return colorOnly.id;

    // Fallback to first
    return variants[0]?.id || null;
  } catch (err) {
    console.error("[printful-edm] Error resolving variant:", err);
    return null;
  }
}

/**
 * Process a Printful EDM order.
 * Called when a Shopify order contains _printful_template_id line item property.
 */
export async function processEDMOrder(
  recordId: string,
  shopifyOrder: any
) {
  console.log(`[printful-edm] ═══════════════════════════════════════════════`);
  console.log(`[printful-edm] Processing EDM order ${recordId}...`);

  try {
    // 1. Load the record
    const record = await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "submitting" },
    });

    console.log(`[printful-edm] Order: ${record.shopifyOrderName}`);
    console.log(`[printful-edm] Shop: ${record.shop}`);

    // Parse personalization data to get the EDM template info
    let persData: {
      printfulTemplateId?: number | string;
      printfulExternalProductId?: string;
      printfulProductId?: number | string;
      variantTitle?: string;
    } = {};

    try {
      persData = JSON.parse(record.personalizationData || "{}");
    } catch {
      console.error("[printful-edm] Failed to parse personalizationData");
    }

    const templateId = persData.printfulTemplateId;
    const externalProductId = persData.printfulExternalProductId;
    const printfulProductId = persData.printfulProductId;
    const variantTitle = persData.variantTitle || "";

    if (!templateId && !externalProductId) {
      throw new Error(
        "No printfulTemplateId or printfulExternalProductId in personalizationData"
      );
    }

    console.log(`[printful-edm] Template ID: ${templateId}`);
    console.log(`[printful-edm] External Product ID: ${externalProductId}`);
    console.log(`[printful-edm] Printful Product ID: ${printfulProductId}`);
    console.log(`[printful-edm] Variant title: ${variantTitle}`);

    // 2. Resolve Printful variant ID
    let printfulVariantId: number | null = null;

    if (printfulProductId && variantTitle) {
      printfulVariantId = await resolveVariantId(printfulProductId, variantTitle);
    }

    if (!printfulVariantId) {
      // Try to get it from the DB record
      printfulVariantId = record.printfulVariantId || null;
    }

    if (!printfulVariantId) {
      throw new Error(
        `Could not resolve Printful variant ID for product ${printfulProductId}, variant "${variantTitle}"`
      );
    }

    console.log(`[printful-edm] Resolved variant ID: ${printfulVariantId}`);

    // 3. Build the Printful order
    const shipping = shopifyOrder.shipping_address || {};
    const recipientName =
      `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() ||
      "Customer";

    // Build the item — use template_id or external_product_id for the design
    const itemPayload: any = {
      external_id: record.shopifyVariantId,
      variant_id: printfulVariantId,
      quantity: 1,
    };

    if (templateId) {
      itemPayload.product_template_id = Number(templateId);
    } else if (externalProductId) {
      itemPayload.external_product_id = externalProductId;
    }

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
      `[printful-edm] Submitting order: variant=${printfulVariantId}, templateId=${templateId ?? "none"}`
    );

    // 4. Submit as draft
    const orderResult = await printfulRequest(
      "/orders",
      "POST",
      printfulOrderBody
    );

    const printfulOrderId = String(orderResult.result.id);
    const printfulStatus = orderResult.result.status;

    // 5. Update record as completed
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printfulOrderId,
        printfulStatus,
        printfulVariantId,
        status: "completed",
      },
    });

    console.log(
      `[printful-edm] ✓ Order ${recordId} completed → Printful #${printfulOrderId} (${printfulStatus})`
    );
    console.log(`[printful-edm] ═══════════════════════════════════════════════`);
  } catch (error: any) {
    console.error(
      `[printful-edm] ✗ Error processing EDM order ${recordId}:`,
      error.message
    );
    console.log(`[printful-edm] ═══════════════════════════════════════════════`);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        status: "failed",
        errorMessage: error.message?.substring(0, 500) || "Unknown error",
      },
    });
  }
}
