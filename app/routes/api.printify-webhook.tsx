import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";

/**
 * POST /api/printify-webhook
 *
 * Receives webhook events from Printify:
 * - order:shipment:created: When an order ships, sync tracking info back to Shopify
 * - order:shipment:delivered: Track delivery
 *
 * Printify webhook payload format:
 * {
 *   "id": "evt-123",
 *   "type": "order:shipment:created",
 *   "resource": {
 *     "id": "order-id",
 *     "data": {
 *       "carrier": "usps",
 *       "tracking_number": "9400...",
 *       "tracking_url": "https://..."
 *     }
 *   }
 * }
 */

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    console.error("[printify-webhook] Failed to parse request body");
    return new Response("Bad request", { status: 400 });
  }

  const eventType = body.type;
  const resource = body.resource || {};

  console.log(`[printify-webhook] ═══════════════════════════════════════`);
  console.log(`[printify-webhook] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case "order:shipment:created":
        await handleShipmentCreated(resource);
        break;

      case "order:shipment:delivered":
        await handleShipmentDelivered(resource);
        break;

      default:
        console.log(`[printify-webhook] Unhandled event type: ${eventType}`);
    }
  } catch (error: any) {
    console.error(
      `[printify-webhook] Error handling ${eventType}:`,
      error.message
    );
    console.error(`[printify-webhook] Stack:`, error.stack);
    // Still return 200 so Printify doesn't retry
  }

  console.log(`[printify-webhook] ═══════════════════════════════════════`);
  return new Response("OK", { status: 200 });
};

/**
 * Handle order:shipment:created event:
 * 1. Find the PersonalizationOrder by Printify order ID
 * 2. Get the Shopify order ID from our record
 * 3. Use Shopify Admin API to create a fulfillment with tracking info
 */
async function handleShipmentCreated(resource: any) {
  const printifyOrderId = String(resource.id || "");
  const shipmentData = resource.data || {};

  const trackingNumber = shipmentData.tracking_number || "";
  const trackingUrl = shipmentData.tracking_url || "";
  const carrier = shipmentData.carrier || "";

  console.log(`[printify-webhook] Shipment created!`);
  console.log(`[printify-webhook]   Printify order: ${printifyOrderId}`);
  console.log(`[printify-webhook]   Carrier: ${carrier}`);
  console.log(`[printify-webhook]   Tracking: ${trackingNumber}`);
  console.log(`[printify-webhook]   Tracking URL: ${trackingUrl}`);

  // Find our PersonalizationOrder record
  let record = await db.personalizationOrder.findFirst({
    where: { printifyOrderId },
  });

  // Fallback: try matching by external_id
  if (!record) {
    // Printify may store the external_id differently
    const allRecords = await db.personalizationOrder.findMany({
      where: { fulfillmentProvider: "printify" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    record = allRecords.find(
      (r) => r.printifyOrderId === printifyOrderId
    ) || null;
  }

  if (!record) {
    console.log(
      `[printify-webhook] No PersonalizationOrder found for Printify order ${printifyOrderId}`
    );
    return;
  }

  console.log(
    `[printify-webhook] Found order record: ${record.id} (Shopify: ${record.shopifyOrderName})`
  );

  // Update our record with shipping info
  await db.personalizationOrder.update({
    where: { id: record.id },
    data: {
      printifyStatus: "shipped",
    },
  });

  // Sync tracking to Shopify
  await syncTrackingToShopify(record, {
    trackingNumber,
    trackingUrl,
    carrier,
  });
}

/**
 * Handle order:shipment:delivered event:
 * Update the status on our record.
 */
async function handleShipmentDelivered(resource: any) {
  const printifyOrderId = String(resource.id || "");

  console.log(`[printify-webhook] Shipment delivered: ${printifyOrderId}`);

  if (!printifyOrderId) return;

  const record = await db.personalizationOrder.findFirst({
    where: { printifyOrderId },
  });

  if (record) {
    await db.personalizationOrder.update({
      where: { id: record.id },
      data: { printifyStatus: "delivered" },
    });
    console.log(
      `[printify-webhook] Updated record ${record.id} status to "delivered"`
    );
  }
}

/**
 * Sync tracking information from Printify to Shopify.
 * Same pattern as the Printful webhook handler.
 */
async function syncTrackingToShopify(
  record: {
    id: string;
    shop: string;
    shopifyOrderId: string;
    shopifyOrderName: string;
  },
  tracking: {
    trackingNumber: string;
    trackingUrl: string;
    carrier: string;
  }
) {
  console.log(
    `[printify-webhook] Syncing tracking to Shopify for ${record.shopifyOrderName}...`
  );

  try {
    const session = await db.session.findFirst({
      where: {
        shop: record.shop,
        isOnline: false,
      },
    });

    if (!session) {
      console.error(
        `[printify-webhook] No offline session found for shop ${record.shop}`
      );
      return;
    }

    const shopDomain = record.shop;
    const accessToken = session.accessToken;
    const apiVersion = "2025-01";

    // Map carrier names to Shopify tracking company names
    const carrierMap: Record<string, string> = {
      usps: "USPS",
      fedex: "FedEx",
      ups: "UPS",
      dhl: "DHL Express",
      dhl_express: "DHL Express",
      canada_post: "Canada Post",
      royal_mail: "Royal Mail",
    };

    const shopifyCarrier =
      carrierMap[tracking.carrier.toLowerCase()] || tracking.carrier;

    // Step 1: Get fulfillment orders
    const fulfillmentOrdersUrl = `https://${shopDomain}/admin/api/${apiVersion}/orders/${record.shopifyOrderId}/fulfillment_orders.json`;

    console.log(
      `[printify-webhook] Fetching fulfillment orders: ${fulfillmentOrdersUrl}`
    );

    const foResponse = await fetch(fulfillmentOrdersUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!foResponse.ok) {
      const errText = await foResponse.text();
      console.error(
        `[printify-webhook] Failed to get fulfillment orders (${foResponse.status}): ${errText}`
      );
      return;
    }

    const foData = await foResponse.json();
    const fulfillmentOrders = foData.fulfillment_orders || [];

    const openFOs = fulfillmentOrders.filter(
      (fo: any) => fo.status === "open" || fo.status === "in_progress"
    );

    if (openFOs.length === 0) {
      console.log(
        `[printify-webhook] No open fulfillment orders found — order may already be fulfilled`
      );
      return;
    }

    // Step 2: Create fulfillment with tracking info
    const fulfillmentUrl = `https://${shopDomain}/admin/api/${apiVersion}/fulfillments.json`;

    const fulfillmentBody = {
      fulfillment: {
        line_items_by_fulfillment_order: openFOs.map((fo: any) => ({
          fulfillment_order_id: fo.id,
        })),
        tracking_info: {
          number: tracking.trackingNumber,
          url: tracking.trackingUrl,
          company: shopifyCarrier,
        },
        notify_customer: true,
      },
    };

    console.log(
      `[printify-webhook] Creating fulfillment with tracking: ${tracking.trackingNumber} (${shopifyCarrier})`
    );

    const fulfillResponse = await fetch(fulfillmentUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fulfillmentBody),
    });

    if (!fulfillResponse.ok) {
      const errText = await fulfillResponse.text();
      console.error(
        `[printify-webhook] Failed to create fulfillment (${fulfillResponse.status}): ${errText}`
      );
      return;
    }

    const fulfillData = await fulfillResponse.json();
    const fulfillmentId = fulfillData.fulfillment?.id;

    console.log(
      `[printify-webhook] ✓ Fulfillment created: ${fulfillmentId}`
    );
    console.log(
      `[printify-webhook] ✓ Tracking synced to Shopify for ${record.shopifyOrderName}`
    );
  } catch (error: any) {
    console.error(
      `[printify-webhook] Error syncing tracking to Shopify:`,
      error.message
    );
  }
}
