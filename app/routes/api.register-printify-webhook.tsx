import type { ActionFunctionArgs } from "@remix-run/node";

const PRINTIFY_TOKEN = process.env.PRINTIFY_TOKEN || "";
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID || "12491740";
const PRINTIFY_API = "https://api.printify.me/v1";

/**
 * POST /api/register-printify-webhook
 *
 * Registers our webhook URL with Printify to receive shipping notifications.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const APP_URL =
    process.env.SHOPIFY_APP_URL ||
    process.env.APP_URL ||
    "https://printful-custom-production.up.railway.app";

  const webhookUrl = `${APP_URL}/api/printify-webhook`;

  console.log(`[printify-register] Registering webhook: ${webhookUrl}`);

  try {
    // First, list existing webhooks
    const listRes = await fetch(
      `${PRINTIFY_API}/shops/${PRINTIFY_SHOP_ID}/webhooks.json`,
      {
        headers: {
          Authorization: `Bearer ${PRINTIFY_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (listRes.ok) {
      const existing = await listRes.json();
      console.log(
        `[printify-register] Existing webhooks: ${JSON.stringify(existing)}`
      );
    }

    // Register for shipment events
    const topics = [
      "order:shipment:created",
      "order:shipment:delivered",
    ];

    const results: any[] = [];

    for (const topic of topics) {
      const res = await fetch(
        `${PRINTIFY_API}/shops/${PRINTIFY_SHOP_ID}/webhooks.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PRINTIFY_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topic,
            url: webhookUrl,
          }),
        }
      );

      const data = await res.json();
      console.log(
        `[printify-register] ${topic}: ${res.status} ${JSON.stringify(data)}`
      );
      results.push({ topic, status: res.status, data });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(`[printify-register] Error: ${error.message}`);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

/**
 * GET /api/register-printify-webhook
 * Returns status of registered webhooks.
 */
export const loader = async () => {
  try {
    const res = await fetch(
      `${PRINTIFY_API}/shops/${PRINTIFY_SHOP_ID}/webhooks.json`,
      {
        headers: {
          Authorization: `Bearer ${PRINTIFY_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await res.json();
    return new Response(JSON.stringify({ webhooks: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
