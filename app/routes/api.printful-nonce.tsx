/**
 * api.printful-nonce.tsx
 *
 * Server-side endpoint that generates a Printful Embedded Designer nonce token.
 * Called from the storefront EDM block before opening the designer iframe.
 *
 * POST /api/printful-nonce
 * Body: { externalProductId: string, customerId?: string, ipAddress?: string, userAgent?: string }
 * Returns: { nonce: string, templateId: number|null, expiresAt: number }
 *
 * The PRINTFUL_TOKEN env var must have the "Embedded Designer" extension enabled.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const PRINTFUL_API = "https://api.printful.com";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Only allow POST
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
  if (!PRINTFUL_TOKEN) {
    console.error("[edm-nonce] PRINTFUL_TOKEN is not set");
    return json({ error: "Printful token not configured" }, { status: 500 });
  }

  let body: {
    externalProductId?: string;
    customerId?: string;
    ipAddress?: string;
    userAgent?: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { externalProductId, customerId, ipAddress, userAgent } = body;

  if (!externalProductId) {
    return json({ error: "externalProductId is required" }, { status: 400 });
  }

  console.log(`[edm-nonce] Generating nonce for externalProductId=${externalProductId}`);

  try {
    const noncePayload: Record<string, any> = {
      external_product_id: externalProductId,
    };

    if (customerId) noncePayload.external_customer_id = customerId;
    if (ipAddress) noncePayload.ip_address = ipAddress;
    if (userAgent) noncePayload.user_agent = userAgent;

    const response = await fetch(`${PRINTFUL_API}/embedded-designer/nonces`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(noncePayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[edm-nonce] Printful API error ${response.status}:`, JSON.stringify(data));
      return json(
        { error: `Printful API error: ${data?.error?.message || response.status}` },
        { status: response.status }
      );
    }

    const nonceObj = data?.result?.nonce;
    if (!nonceObj) {
      console.error("[edm-nonce] Unexpected response structure:", JSON.stringify(data));
      return json({ error: "Unexpected Printful response" }, { status: 500 });
    }

    console.log(
      `[edm-nonce] ✓ Nonce generated. templateId=${nonceObj.template_id ?? "null"}, expires=${nonceObj.expires_at}`
    );

    // Return CORS-friendly response so the storefront JS can call this
    return json(
      {
        nonce: nonceObj.nonce,
        templateId: nonceObj.template_id ?? null,
        expiresAt: nonceObj.expires_at,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (err: any) {
    console.error("[edm-nonce] Unexpected error:", err.message);
    return json({ error: err.message || "Internal server error" }, { status: 500 });
  }
};

// Handle CORS preflight
export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  return json({ error: "Use POST" }, { status: 405 });
};
