/**
 * Printful catalog proxy — called from the admin Import page.
 * GET /api/printful-catalog?action=products
 * GET /api/printful-catalog?action=variants&productId=19
 * GET /api/printful-catalog?action=printfiles&productId=19
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_API = "https://api.printful.com";

/** Authenticated fetch — for store-specific endpoints (variants, printfiles) */
async function pfFetch(path: string) {
  const res = await fetch(`${PRINTFUL_API}${path}`, {
    headers: { Authorization: `Bearer ${PRINTFUL_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printful API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/** Public fetch — no auth token. The /products catalog endpoint returns the
 *  FULL 480+ product catalog when called without auth. With a store-scoped
 *  token it only returns products available for that store's techniques. */
async function pfPublicFetch(path: string) {
  const res = await fetch(`${PRINTFUL_API}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printful API error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Require authenticated admin session
  await authenticate.admin(request);

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "products") {
      // Fetch the FULL public catalog (no auth = no store filtering)
      // The Printful /products endpoint returns all ~480 products in one call
      // when no limit/offset params are used.
      const data = await pfPublicFetch("/products");
      const allProducts: any[] = data.result || [];

      const products = allProducts.map((p) => ({
        id: p.id,
        title: p.title || p.type_name,
        typeName: p.type_name || "",
        type: p.type || "",
        brand: p.brand || null,
        model: p.model || p.type_name,
        image: p.image || null,
        variantCount: p.variant_count || 0,
        techniques: (p.techniques || []).map((t: any) => t.display_name),
      }));

      return json({ products });
    }

    if (action === "variants") {
      const productId = url.searchParams.get("productId");
      if (!productId) return json({ error: "productId required" }, { status: 400 });

      // Use authenticated fetch for product details (variants need store context)
      const data = await pfFetch(`/products/${productId}`);
      const rawVariants: any[] = data.result?.variants || [];

      // Deduplicate by color — keep one variant per color
      const colorMap = new Map<string, any>();
      for (const v of rawVariants) {
        const color = v.color || v.name?.split(" / ")?.[0] || v.name;
        if (!colorMap.has(color)) {
          colorMap.set(color, {
            id: v.id,
            name: v.name,
            color,
            colorCode: v.color_code || "#ffffff",
            size: v.size || null,
            image: v.image || null,
          });
        }
      }

      return json({ variants: Array.from(colorMap.values()) });
    }

    // Fetch print file specs for a product (real dimensions from Printful)
    if (action === "printfiles") {
      const productId = url.searchParams.get("productId");
      if (!productId) return json({ error: "productId required" }, { status: 400 });

      const data = await pfFetch(`/mockup-generator/printfiles/${productId}`);
      const printfiles = data.result?.printfiles || {};
      const variantPrintfiles = data.result?.variant_printfiles || {};

      // Extract the first available printfile spec to get dimensions
      const specs: Array<{ placement: string; width: number; height: number; dpi: number }> = [];
      for (const [placementKey, pf] of Object.entries(printfiles) as any) {
        if (pf?.width && pf?.height) {
          specs.push({
            placement: placementKey,
            width: pf.width,
            height: pf.height,
            dpi: pf.dpi || 300,
          });
        }
      }

      return json({ printfiles: specs, raw: data.result });
    }

    return json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("[printful-catalog]", error.message);
    return json({ error: error.message }, { status: 500 });
  }
};
