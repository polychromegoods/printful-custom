/**
 * Printful catalog proxy — called from the admin Import page.
 * GET /api/printful-catalog?action=products
 * GET /api/printful-catalog?action=variants&productId=19
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_API = "https://api.printful.com";

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "products") {
      // Fetch all products (paginated — Printful returns up to 100 per page)
      const allProducts: any[] = [];
      let offset = 0;
      const limit = 100;
      while (true) {
        const data = await pfFetch(`/products?limit=${limit}&offset=${offset}`);
        const items: any[] = data.result || [];
        allProducts.push(...items);
        if (items.length < limit) break;
        offset += limit;
        if (offset > 5000) break; // safety cap
      }

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

    return json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("[printful-catalog]", error.message);
    return json({ error: error.message }, { status: 500 });
  }
};
