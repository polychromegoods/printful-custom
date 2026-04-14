import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_API = "https://api.printful.com";
const APP_URL =
  process.env.SHOPIFY_APP_URL ||
  process.env.APP_URL ||
  "https://printful-custom-production.up.railway.app";

/**
 * GET /api/register-printful-webhook
 *
 * Check current Printful webhook configuration.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const response = await fetch(`${PRINTFUL_API}/webhooks`, {
      headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return json({
      status: "ok",
      currentWebhook: data.result || null,
      appUrl: APP_URL,
    });
  } catch (error: any) {
    return json({ status: "error", message: error.message }, { status: 500 });
  }
};

/**
 * POST /api/register-printful-webhook
 *
 * Register our webhook URL with Printful for shipping and order events.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const webhookUrl = `${APP_URL}/api/printful-webhook`;

  console.log(`[printful-webhook-setup] Registering webhook: ${webhookUrl}`);

  try {
    const response = await fetch(`${PRINTFUL_API}/webhooks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: webhookUrl,
        types: [
          "package_shipped",
          "package_returned",
          "order_created",
          "order_updated",
          "order_failed",
          "order_canceled",
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        `[printful-webhook-setup] Failed to register: ${JSON.stringify(data)}`
      );
      return json(
        {
          status: "error",
          message: data.error?.message || "Failed to register webhook",
          details: data,
        },
        { status: response.status }
      );
    }

    console.log(
      `[printful-webhook-setup] ✓ Webhook registered successfully!`
    );
    console.log(
      `[printful-webhook-setup]   URL: ${data.result?.url}`
    );
    console.log(
      `[printful-webhook-setup]   Types: ${JSON.stringify(data.result?.types)}`
    );

    return json({
      status: "ok",
      message: "Webhook registered successfully",
      webhook: data.result,
    });
  } catch (error: any) {
    console.error(
      `[printful-webhook-setup] Error:`,
      error.message
    );
    return json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }
};
