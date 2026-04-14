import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { processPersonalizedOrder } from "../services/printful.server";
import { processPersonalizedOrderPrintify } from "../services/printify.server";
import { getProductBase } from "../config/product-bases";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[webhook] Received ${topic} for ${shop}`);

  const order = payload as any;
  const orderId = String(order.id);
  const orderName = order.name || `#${order.order_number}`;

  // Scan line items for personalization properties
  for (const lineItem of order.line_items || []) {
    const properties: Record<string, string> = {};
    for (const prop of lineItem.properties || []) {
      if (prop.name && prop.value) {
        properties[prop.name] = prop.value;
      }
    }

    // ─── New template-based personalization ───
    const personalizationData = properties["_personalization_data"];
    const templateId = properties["_template_id"];
    const productBaseSlug = properties["_product_base"];
    const technique = properties["_technique"];
    const placementKey = properties["_placement"];

    // ─── Legacy monogram fields ───
    const monogramText = properties["_monogram_text"];
    const monogramStyle = properties["_monogram_style"] || "script";
    const threadColor = properties["_thread_color"] || "#000000";

    // Skip if neither new nor legacy personalization data exists
    if (!personalizationData && !monogramText) {
      continue; // Not a personalized item
    }

    const variantId = String(lineItem.variant_id);

    console.log(`[webhook] Found personalized item in order ${orderName}:`);
    if (templateId) {
      console.log(`  Template: ${templateId}, Base: ${productBaseSlug}, Technique: ${technique}, Placement: ${placementKey}`);
    }
    if (monogramText) {
      console.log(`  Monogram: "${monogramText}" (${monogramStyle}, ${threadColor})`);
    }

    // Determine fulfillment provider based on product base
    let fulfillmentProvider = "printful"; // default
    if (productBaseSlug) {
      const base = getProductBase(productBaseSlug);
      if (base) {
        fulfillmentProvider = base.fulfillmentProvider;
        console.log(`[webhook] Product base "${productBaseSlug}" → provider: ${fulfillmentProvider}`);
      }
    }

    // Check for duplicate (idempotency)
    const existing = await db.personalizationOrder.findFirst({
      where: {
        shopifyOrderId: orderId,
        shopifyVariantId: variantId,
        ...(monogramText ? { monogramText } : {}),
        ...(templateId ? { templateId } : {}),
      },
    });

    if (existing) {
      console.log(`[webhook] Duplicate detected for order ${orderId}, skipping`);
      continue;
    }

    // Create the personalization record
    const record = await db.personalizationOrder.create({
      data: {
        shop,
        shopifyOrderId: orderId,
        shopifyOrderName: orderName,
        shopifyVariantId: variantId,
        customerEmail: order.email || null,
        customerName: order.shipping_address
          ? `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim()
          : null,

        // Fulfillment provider
        fulfillmentProvider,

        // New template fields
        templateId: templateId || null,
        productBaseSlug: productBaseSlug || null,
        technique: technique || null,
        placementKey: placementKey || null,
        personalizationData: personalizationData || "{}",

        // Legacy fields (always populated for backward compat)
        monogramText: monogramText || null,
        monogramStyle: monogramStyle,
        threadColor: threadColor,

        status: "pending",
      },
    });

    console.log(`[webhook] Created PersonalizationOrder ${record.id} for order ${orderName} (provider: ${fulfillmentProvider})`);

    // Route to the correct fulfillment provider
    if (fulfillmentProvider === "printify") {
      processPersonalizedOrderPrintify(record.id, order).catch((err) => {
        console.error(`[webhook] Error processing Printify order ${record.id}:`, err);
      });
    } else {
      processPersonalizedOrder(record.id, order).catch((err) => {
        console.error(`[webhook] Error processing Printful order ${record.id}:`, err);
      });
    }
  }

  return new Response();
};
