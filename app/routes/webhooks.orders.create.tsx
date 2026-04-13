import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { processPersonalizedOrder } from "../services/printful.server";

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

    // Check if this line item has monogram personalization
    const monogramText = properties["_monogram_text"];
    if (!monogramText) {
      continue; // Not a personalized item, skip
    }

    const monogramStyle = properties["_monogram_style"] || "script";
    const threadColor = properties["_thread_color"] || "#000000";
    const variantId = String(lineItem.variant_id);

    console.log(`[webhook] Found personalized item in order ${orderName}: "${monogramText}" (${monogramStyle}, ${threadColor})`);

    // Check for duplicate (idempotency)
    const existing = await db.personalizationOrder.findFirst({
      where: {
        shopifyOrderId: orderId,
        shopifyVariantId: variantId,
        monogramText: monogramText,
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
        monogramText,
        monogramStyle,
        threadColor,
        status: "pending",
      },
    });

    console.log(`[webhook] Created PersonalizationOrder ${record.id} for order ${orderName}`);

    // Process asynchronously (fire-and-forget so webhook returns quickly)
    processPersonalizedOrder(record.id, order).catch((err) => {
      console.error(`[webhook] Error processing order ${record.id}:`, err);
    });
  }

  return new Response();
};
