import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

/**
 * GET /api/product-base?product_id=<shopify_product_id>&variant_id=<shopify_variant_id>
 *
 * Returns the product base configuration for the storefront extension:
 * - Base image URL for the current variant (or default fallback)
 * - Print area position (as % of image)
 *
 * Called via Shopify App Proxy at:
 *   /apps/api/product-base?product_id=123&variant_id=456
 *
 * The product_id from the storefront is numeric (e.g., "8012345678"),
 * but we store it as a GID (e.g., "gid://shopify/Product/8012345678").
 * We handle both formats.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id") || "";
  const variantId = url.searchParams.get("variant_id") || "";
  // shop param is passed by Shopify app proxy
  const shop = url.searchParams.get("shop") || "";

  if (!productId) {
    return new Response(
      JSON.stringify({ error: "Missing product_id" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Build the GID format if a plain numeric ID was passed
  const gidProductId = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const gidVariantId = variantId
    ? variantId.startsWith("gid://")
      ? variantId
      : `gid://shopify/ProductVariant/${variantId}`
    : null;

  try {
    // Find the product base — try with shop first, then without (for dev)
    let productBase = null;

    if (shop) {
      productBase = await db.productBase.findFirst({
        where: {
          shopifyProductId: gidProductId,
          shop: shop,
          isActive: true,
        },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
        },
      });
    }

    // Fallback: find without shop filter (useful in dev)
    if (!productBase) {
      productBase = await db.productBase.findFirst({
        where: {
          shopifyProductId: gidProductId,
          isActive: true,
        },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
        },
      });
    }

    if (!productBase) {
      return new Response(
        JSON.stringify({ found: false }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=300",
          },
        }
      );
    }

    // Find the best matching image:
    // 1. Exact variant match
    // 2. Default image (no variant ID)
    // 3. First image
    let matchedImage = null;

    if (gidVariantId) {
      matchedImage = productBase.images.find(
        (img) => img.shopifyVariantId === gidVariantId
      );
    }

    if (!matchedImage) {
      matchedImage = productBase.images.find(
        (img) => !img.shopifyVariantId || img.shopifyVariantId === ""
      );
    }

    if (!matchedImage && productBase.images.length > 0) {
      matchedImage = productBase.images[0];
    }

    // Build a map of all variant images for client-side variant switching
    const variantImageMap: Record<string, string> = {};
    for (const img of productBase.images) {
      if (img.shopifyVariantId) {
        // Store both GID and numeric ID for easy lookup
        variantImageMap[img.shopifyVariantId] = img.imageUrl;
        const numericId = img.shopifyVariantId.replace(
          "gid://shopify/ProductVariant/",
          ""
        );
        variantImageMap[numericId] = img.imageUrl;
      }
    }

    return new Response(
      JSON.stringify({
        found: true,
        productBase: {
          id: productBase.id,
          printArea: {
            x: productBase.printAreaX,
            y: productBase.printAreaY,
            width: productBase.printAreaWidth,
            height: productBase.printAreaHeight,
          },
          currentImage: matchedImage?.imageUrl || null,
          variantImages: variantImageMap,
          defaultImage:
            productBase.images.find(
              (img) => !img.shopifyVariantId || img.shopifyVariantId === ""
            )?.imageUrl ||
            productBase.images[0]?.imageUrl ||
            null,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  } catch (error: any) {
    console.error("Product base API error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};
