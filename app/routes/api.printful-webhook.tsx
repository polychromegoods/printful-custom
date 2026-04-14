import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";

/**
 * POST /api/printful-webhook
 *
 * Receives webhook events from Printful:
 * - package_shipped: When an order ships, sync tracking info back to Shopify
 * - order_updated: Track status changes on Printful orders
 * - order_failed: Log failures for debugging
 *
 * Printful webhook payload format:
 * {
 *   "type": "package_shipped",
 *   "created": 1622456737,
 *   "retries": 0,
 *   "store": 12,
 *   "data": {
 *     "shipment": {
 *       "id": 123,
 *       "carrier": "USPS",
 *       "service": "First Class",
 *       "tracking_number": "9400...",
 *       "tracking_url": "https://...",
 *       "ship_date": "2024-01-15",
 *       "items": [...]
 *     },
 *     "order": {
 *       "id": 456,
 *       "external_id": "shopify-123456",
 *       "status": "fulfilled",
 *       ...
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
    console.error("[printful-webhook] Failed to parse request body");
    return new Response("Bad request", { status: 400 });
  }

  const eventType = body.type;
  const data = body.data || {};

  console.log(`[printful-webhook] ═══════════════════════════════════════`);
  console.log(`[printful-webhook] Received event: ${eventType}`);
  console.log(`[printful-webhook] Retries: ${body.retries || 0}`);

  try {
    switch (eventType) {
      case "package_shipped":
        await handlePackageShipped(data);
        break;

      case "order_updated":
        await handleOrderUpdated(data);
        break;

      case "order_failed":
        await handleOrderFailed(data);
        break;

      default:
        console.log(`[printful-webhook] Unhandled event type: ${eventType}`);
    }
  } catch (error: any) {
    console.error(
      `[printful-webhook] Error handling ${eventType}:`,
      error.message
    );
    console.error(`[printful-webhook] Stack:`, error.stack);
    // Still return 200 so Printful doesn't retry
  }

  console.log(`[printful-webhook] ═══════════════════════════════════════`);
  return new Response("OK", { status: 200 });
};

/**
 * Handle package_shipped event:
 * 1. Find the PersonalizationOrder by Printful order ID
 * 2. Get the Shopify order ID from our record
 * 3. Use Shopify Admin API to create a fulfillment with tracking info
 */
async function handlePackageShipped(data: any) {
  const shipment = data.shipment || {};
  const order = data.order || {};
  const printfulOrderId = String(order.id || "");
  const externalId = order.external_id || "";

  const trackingNumber = shipment.tracking_number || "";
  const trackingUrl = shipment.tracking_url || "";
  const carrier = shipment.carrier || "";
  const service = shipment.service || "";

  console.log(`[printful-webhook] Package shipped!`);
  console.log(`[printful-webhook]   Printful order: ${printfulOrderId}`);
  console.log(`[printful-webhook]   External ID: ${externalId}`);
  console.log(`[printful-webhook]   Carrier: ${carrier} (${service})`);
  console.log(`[printful-webhook]   Tracking: ${trackingNumber}`);
  console.log(`[printful-webhook]   Tracking URL: ${trackingUrl}`);

  // Find our PersonalizationOrder record
  let record = await db.personalizationOrder.findFirst({
    where: { printfulOrderId },
  });

  // Fallback: try matching by external_id (format: "shopify-{orderId}")
  if (!record && externalId) {
    const shopifyOrderId = externalId.replace("shopify-", "");
    record = await db.personalizationOrder.findFirst({
      where: { shopifyOrderId },
    });
  }

  if (!record) {
    console.log(
      `[printful-webhook] No PersonalizationOrder found for Printful order ${printfulOrderId}`
    );
    return;
  }

  console.log(
    `[printful-webhook] Found order record: ${record.id} (Shopify: ${record.shopifyOrderName})`
  );

  // Update our record with shipping info
  await db.personalizationOrder.update({
    where: { id: record.id },
    data: {
      printfulStatus: "shipped",
    },
  });

  // Now sync tracking to Shopify
  await syncTrackingToShopify(record, {
    trackingNumber,
    trackingUrl,
    carrier,
  });
}

/**
 * Handle order_updated event:
 * Update the Printful status on our record for dashboard visibility.
 */
async function handleOrderUpdated(data: any) {
  const order = data.order || {};
  const printfulOrderId = String(order.id || "");
  const status = order.status || "";

  console.log(
    `[printful-webhook] Order updated: ${printfulOrderId} → ${status}`
  );

  if (!printfulOrderId) return;

  const record = await db.personalizationOrder.findFirst({
    where: { printfulOrderId },
  });

  if (record) {
    await db.personalizationOrder.update({
      where: { id: record.id },
      data: { printfulStatus: status },
    });
    console.log(
      `[printful-webhook] Updated record ${record.id} status to "${status}"`
    );
  }
}

/**
 * Handle order_failed event:
 * Log the failure and update our record.
 */
async function handleOrderFailed(data: any) {
  const order = data.order || {};
  const printfulOrderId = String(order.id || "");
  const reason = data.reason || "Unknown reason";

  console.error(
    `[printful-webhook] Order FAILED: ${printfulOrderId} — ${reason}`
  );

  if (!printfulOrderId) return;

  const record = await db.personalizationOrder.findFirst({
    where: { printfulOrderId },
  });

  if (record) {
    await db.personalizationOrder.update({
      where: { id: record.id },
      data: {
        printfulStatus: "failed",
        errorMessage: `Printful order failed: ${reason}`.substring(0, 500),
      },
    });
  }
}

/**
 * Sync tracking information from Printful to Shopify.
 *
 * Uses the Shopify Admin REST API to:
 * 1. Get the order's fulfillment orders
 * 2. Create a fulfillment with tracking info
 *
 * This marks the Shopify order as fulfilled and sends the customer
 * a shipping confirmation email with tracking.
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
    `[printful-webhook] Syncing tracking to Shopify for ${record.shopifyOrderName}...`
  );

  try {
    // Get the offline session for this shop to access the Admin API
    const session = await db.session.findFirst({
      where: {
        shop: record.shop,
        isOnline: false,
      },
    });

    if (!session) {
      console.error(
        `[printful-webhook] No offline session found for shop ${record.shop}`
      );
      return;
    }

    const shopDomain = record.shop;
    const accessToken = session.accessToken;
    const apiVersion = "2025-01"; // Match the app's API version

    // Map Printful carrier names to Shopify tracking company names
    const carrierMap: Record<string, string> = {
      USPS: "USPS",
      "FEDEX": "FedEx",
      "UPS": "UPS",
      "DHL": "DHL Express",
      "DHL_EXPRESS": "DHL Express",
      "CANADA_POST": "Canada Post",
      "ROYAL_MAIL": "Royal Mail",
    };

    const shopifyCarrier =
      carrierMap[tracking.carrier.toUpperCase()] || tracking.carrier;

    // Step 1: Get fulfillment orders for this Shopify order
    const fulfillmentOrdersUrl = `https://${shopDomain}/admin/api/${apiVersion}/orders/${record.shopifyOrderId}/fulfillment_orders.json`;

    console.log(
      `[printful-webhook] Fetching fulfillment orders: ${fulfillmentOrdersUrl}`
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
        `[printful-webhook] Failed to get fulfillment orders (${foResponse.status}): ${errText}`
      );
      return;
    }

    const foData = await foResponse.json();
    const fulfillmentOrders = foData.fulfillment_orders || [];

    // Find open fulfillment orders
    const openFOs = fulfillmentOrders.filter(
      (fo: any) => fo.status === "open" || fo.status === "in_progress"
    );

    if (openFOs.length === 0) {
      console.log(
        `[printful-webhook] No open fulfillment orders found — order may already be fulfilled`
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
      `[printful-webhook] Creating fulfillment with tracking: ${tracking.trackingNumber} (${shopifyCarrier})`
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
        `[printful-webhook] Failed to create fulfillment (${fulfillResponse.status}): ${errText}`
      );
      return;
    }

    const fulfillData = await fulfillResponse.json();
    const fulfillmentId = fulfillData.fulfillment?.id;

    console.log(
      `[printful-webhook] ✓ Fulfillment created: ${fulfillmentId}`
    );
    console.log(
      `[printful-webhook] ✓ Tracking synced to Shopify for ${record.shopifyOrderName}`
    );
    console.log(
      `[printful-webhook]   Customer will receive shipping notification email`
    );
  } catch (error: any) {
    console.error(
      `[printful-webhook] Error syncing tracking to Shopify:`,
      error.message
    );
  }
}
