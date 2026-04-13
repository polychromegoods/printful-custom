import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

/**
 * GET /api/debug-templates
 *
 * Debug endpoint that lists all product templates with their stored product IDs.
 * Useful for diagnosing product ID mismatch issues.
 *
 * Access via: /apps/api/debug-templates
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const templates = await db.productTemplate.findMany({
      include: {
        layers: { select: { id: true, layerType: true, label: true } },
        mockupImages: { select: { id: true, variantColor: true, imageUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return new Response(
      JSON.stringify({
        count: templates.length,
        templates: templates.map((t) => ({
          id: t.id,
          shop: t.shop,
          shopifyProductId: t.shopifyProductId,
          numericProductId: t.shopifyProductId.includes("/")
            ? t.shopifyProductId.split("/").pop()
            : t.shopifyProductId,
          productTitle: t.productTitle,
          productHandle: t.productHandle,
          productBaseSlug: t.productBaseSlug,
          technique: t.technique,
          placementKey: t.placementKey,
          isActive: t.isActive,
          layerCount: t.layers.length,
          mockupCount: t.mockupImages.length,
          mockups: t.mockupImages,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      }, null, 2),
      { status: 200, headers }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: "Internal error", details: error.message }),
      { status: 500, headers }
    );
  }
};
