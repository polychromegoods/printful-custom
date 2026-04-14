import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const PRINTIFY_TOKEN = process.env.PRINTIFY_TOKEN || "";
const PRINTIFY_API = "https://api.printify.com/v1";

/**
 * Proxy route for Printify catalog API.
 * Keeps the token server-side and provides search/filter for the admin UI.
 *
 * Query params:
 *   ?action=blueprints          — List all blueprints (with optional ?q=search)
 *   ?action=blueprint&id=123    — Get specific blueprint
 *   ?action=providers&id=123    — Get print providers for blueprint
 *   ?action=variants&blueprint_id=123&provider_id=29 — Get variants
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "blueprints";
  const searchQuery = url.searchParams.get("q") || "";
  const id = url.searchParams.get("id") || "";
  const blueprintId = url.searchParams.get("blueprint_id") || "";
  const providerId = url.searchParams.get("provider_id") || "";

  if (!PRINTIFY_TOKEN) {
    return json({ error: "PRINTIFY_TOKEN not configured" }, { status: 500 });
  }

  try {
    let endpoint = "";

    switch (action) {
      case "blueprints":
        endpoint = "/catalog/blueprints.json";
        break;
      case "blueprint":
        if (!id) return json({ error: "Missing id parameter" }, { status: 400 });
        endpoint = `/catalog/blueprints/${id}.json`;
        break;
      case "providers":
        if (!id) return json({ error: "Missing id parameter" }, { status: 400 });
        endpoint = `/catalog/blueprints/${id}/print_providers.json`;
        break;
      case "variants":
        if (!blueprintId || !providerId) {
          return json({ error: "Missing blueprint_id or provider_id" }, { status: 400 });
        }
        endpoint = `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`;
        break;
      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }

    const response = await fetch(`${PRINTIFY_API}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${PRINTIFY_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[printify-catalog] API error ${response.status}: ${errorText}`);
      return json(
        { error: `Printify API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    let data = await response.json();

    // For blueprints list, apply client-side search filter
    if (action === "blueprints" && searchQuery && Array.isArray(data)) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (bp: any) =>
          bp.title?.toLowerCase().includes(q) ||
          bp.brand?.toLowerCase().includes(q) ||
          bp.model?.toLowerCase().includes(q) ||
          String(bp.id).includes(q)
      );
    }

    return json(data);
  } catch (error: any) {
    console.error("[printify-catalog] Error:", error.message);
    return json({ error: error.message }, { status: 500 });
  }
};
