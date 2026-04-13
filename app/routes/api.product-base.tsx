import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import {
  getProductBase,
  EMBROIDERY_THREAD_COLORS,
  AVAILABLE_FONTS,
} from "../config/product-bases";

/**
 * GET /api/product-base?product_id=<shopify_product_id>&variant_id=<shopify_variant_id>
 *
 * Returns the full product template configuration for the storefront extension:
 * - Product base info (name, category, technique)
 * - Placement / print area position
 * - Template layers (text, image, fixed_image) with their config
 * - Enabled fonts, thread colors, variant colors
 * - Mockup images per variant
 *
 * Called via Shopify App Proxy at:
 *   /apps/api/product-base?product_id=123&variant_id=456
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id") || "";
  const variantId = url.searchParams.get("variant_id") || "";
  const shop = url.searchParams.get("shop") || "";

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60",
  };

  if (!productId) {
    return new Response(
      JSON.stringify({ error: "Missing product_id" }),
      { status: 400, headers }
    );
  }

  // Build GID format if a plain numeric ID was passed
  const gidProductId = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const gidVariantId = variantId
    ? variantId.startsWith("gid://")
      ? variantId
      : `gid://shopify/ProductVariant/${variantId}`
    : null;

  try {
    // Find the product template
    let template = null;

    if (shop) {
      template = await db.productTemplate.findFirst({
        where: {
          shopifyProductId: gidProductId,
          shop,
          isActive: true,
        },
        include: {
          layers: { orderBy: { sortOrder: "asc" } },
          mockupImages: { orderBy: { sortOrder: "asc" } },
        },
      });
    }

    // Fallback: find without shop filter (useful in dev)
    if (!template) {
      template = await db.productTemplate.findFirst({
        where: {
          shopifyProductId: gidProductId,
          isActive: true,
        },
        include: {
          layers: { orderBy: { sortOrder: "asc" } },
          mockupImages: { orderBy: { sortOrder: "asc" } },
        },
      });
    }

    if (!template) {
      return new Response(
        JSON.stringify({ found: false }),
        { status: 200, headers }
      );
    }

    // Get the product base from the registry
    const productBase = getProductBase(template.productBaseSlug);
    if (!productBase) {
      return new Response(
        JSON.stringify({ found: false, error: "Product base not found in registry" }),
        { status: 200, headers }
      );
    }

    // Find the placement spec from the registry
    const placementSpec = productBase.placements.find(
      (p) => p.placementKey === template.placementKey
    );

    // Parse enabled fonts
    let enabledFontKeys: string[] = [];
    try {
      enabledFontKeys = JSON.parse(template.enabledFonts);
    } catch {
      enabledFontKeys = ["script", "block"];
    }
    const enabledFonts = AVAILABLE_FONTS.filter((f) =>
      enabledFontKeys.includes(f.key)
    );

    // Parse enabled thread colors
    let enabledColorHexes: string[] = [];
    try {
      enabledColorHexes = JSON.parse(template.enabledThreadColors);
    } catch {
      enabledColorHexes = [];
    }
    // If empty array, return all thread colors
    const threadColors =
      enabledColorHexes.length > 0
        ? EMBROIDERY_THREAD_COLORS.filter((c) =>
            enabledColorHexes.includes(c.hex)
          )
        : [...EMBROIDERY_THREAD_COLORS];

    // Parse enabled variant colors
    let enabledVariantColors: string[] = [];
    try {
      enabledVariantColors = JSON.parse(template.enabledVariantColors);
    } catch {
      enabledVariantColors = [];
    }

    // Build variant info from registry
    const variants =
      enabledVariantColors.length > 0
        ? productBase.variants.filter((v) =>
            enabledVariantColors.includes(v.color)
          )
        : productBase.variants;

    // Find the best matching mockup image
    let currentMockupUrl: string | null = null;
    const variantImageMap: Record<string, string> = {};

    for (const mockup of template.mockupImages) {
      // Build lookup map
      if (mockup.shopifyVariantId) {
        variantImageMap[mockup.shopifyVariantId] = mockup.imageUrl;
        const numericId = mockup.shopifyVariantId.replace(
          "gid://shopify/ProductVariant/",
          ""
        );
        variantImageMap[numericId] = mockup.imageUrl;
      }
      variantImageMap[mockup.variantColor] = mockup.imageUrl;
      variantImageMap[mockup.variantColor.toLowerCase()] = mockup.imageUrl;
    }

    // Find current variant's mockup
    if (gidVariantId) {
      currentMockupUrl =
        variantImageMap[gidVariantId] ||
        variantImageMap[variantId] ||
        null;
    }

    // Fallback to default mockup
    if (!currentMockupUrl) {
      const defaultMockup = template.mockupImages.find((m) => m.isDefault);
      currentMockupUrl =
        defaultMockup?.imageUrl ||
        template.mockupImages[0]?.imageUrl ||
        null;
    }

    // Build layers config for the storefront
    const layers = template.layers.map((layer) => {
      let layerFonts = enabledFonts;
      if (layer.enabledFonts) {
        try {
          const layerFontKeys = JSON.parse(layer.enabledFonts);
          if (layerFontKeys.length > 0) {
            layerFonts = AVAILABLE_FONTS.filter((f) =>
              layerFontKeys.includes(f.key)
            );
          }
        } catch {}
      }

      return {
        id: layer.id,
        type: layer.layerType,
        label: layer.label,
        customerEditable: layer.customerEditable,
        position: {
          x: layer.positionX,
          y: layer.positionY,
          width: layer.positionWidth,
          height: layer.positionHeight,
        },
        sortOrder: layer.sortOrder,
        // Text layer options
        maxChars: layer.maxChars,
        placeholder: layer.placeholder,
        fonts: layer.layerType === "text" ? layerFonts : undefined,
        defaultFont: layer.defaultFont,
        defaultColor: layer.defaultColor,
        // Image layer options
        acceptedFileTypes: layer.acceptedFileTypes
          ? JSON.parse(layer.acceptedFileTypes)
          : undefined,
        maxFileSizeMb: layer.maxFileSizeMb,
        // Fixed image layer options
        fixedImageUrl: layer.fixedImageUrl,
      };
    });

    return new Response(
      JSON.stringify({
        found: true,
        template: {
          id: template.id,
          productBaseSlug: template.productBaseSlug,
          productBaseName: productBase.name,
          brand: productBase.brand,
          category: productBase.category,
          technique: template.technique,
          placementKey: template.placementKey,
          placementName: placementSpec?.displayName || template.placementKey,
          printArea: {
            x: template.printAreaX,
            y: template.printAreaY,
            width: template.printAreaWidth,
            height: template.printAreaHeight,
          },
          printFileSize: placementSpec
            ? {
                width: placementSpec.fileSizePx.width,
                height: placementSpec.fileSizePx.height,
                dpi: placementSpec.dpi,
              }
            : null,
          layers,
          fonts: enabledFonts,
          threadColors: template.technique === "embroidery" ? threadColors : [],
          variants,
          currentMockupUrl,
          variantImages: variantImageMap,
          defaultMockupUrl:
            template.mockupImages.find((m) => m.isDefault)?.imageUrl ||
            template.mockupImages[0]?.imageUrl ||
            null,
        },
      }),
      { status: 200, headers }
    );
  } catch (error: any) {
    console.error("Product template API error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: error.message }),
      { status: 500, headers }
    );
  }
};
