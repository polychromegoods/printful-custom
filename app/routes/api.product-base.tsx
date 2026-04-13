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

/**
 * Extract the numeric portion from a Shopify GID or return as-is if already numeric.
 * e.g. "gid://shopify/Product/15082822238572" → "15082822238572"
 *      "15082822238572" → "15082822238572"
 */
function extractNumericId(id: string): string {
  if (id.startsWith("gid://")) {
    const parts = id.split("/");
    return parts[parts.length - 1];
  }
  return id;
}
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

  // Build both formats for flexible matching
  const numericId = extractNumericId(productId);
  const gidProductId = `gid://shopify/Product/${numericId}`;

  const gidVariantId = variantId
    ? `gid://shopify/ProductVariant/${extractNumericId(variantId)}`
    : null;

  try {
    // Find the product template — try multiple ID formats for robust matching
    let template = null;
    const includeRelations = {
      layers: { orderBy: { sortOrder: "asc" } as const },
      mockupImages: { orderBy: { sortOrder: "asc" } as const },
    };

    // 1. Try GID match with shop filter
    if (shop) {
      template = await db.productTemplate.findFirst({
        where: { shopifyProductId: gidProductId, shop, isActive: true },
        include: includeRelations,
      });
    }

    // 2. GID match without shop filter
    if (!template) {
      template = await db.productTemplate.findFirst({
        where: { shopifyProductId: gidProductId, isActive: true },
        include: includeRelations,
      });
    }

    // 3. Plain numeric ID match (in case stored without GID prefix)
    if (!template) {
      template = await db.productTemplate.findFirst({
        where: { shopifyProductId: numericId, isActive: true },
        include: includeRelations,
      });
    }

    // 4. Contains match on the numeric portion
    if (!template) {
      template = await db.productTemplate.findFirst({
        where: { shopifyProductId: { contains: numericId }, isActive: true },
        include: includeRelations,
      });
    }

    if (!template) {
      // Debug: list all templates so we can see what's actually stored
      const allTemplates = await db.productTemplate.findMany({
        select: { id: true, shopifyProductId: true, productTitle: true, shop: true, isActive: true },
        take: 20,
      });
      return new Response(
        JSON.stringify({
          found: false,
          debug: {
            searchedGid: gidProductId,
            searchedNumeric: numericId,
            shop: shop || "(none)",
            allTemplatesInDb: allTemplates.map(t => ({
              id: t.id,
              shopifyProductId: t.shopifyProductId,
              numericId: t.shopifyProductId.includes("/") ? t.shopifyProductId.split("/").pop() : t.shopifyProductId,
              productTitle: t.productTitle,
              shop: t.shop,
              isActive: t.isActive,
            })),
          },
        }),
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

    // Parse enabled fonts — if empty or invalid, default to ALL fonts
    let enabledFontKeys: string[] = [];
    try {
      const parsed = JSON.parse(template.enabledFonts);
      if (Array.isArray(parsed) && parsed.length > 0) {
        enabledFontKeys = parsed;
      }
    } catch {
      // JSON parse failed — use all fonts
    }
    const enabledFonts = enabledFontKeys.length > 0
      ? AVAILABLE_FONTS.filter((f) => enabledFontKeys.includes(f.key))
      : [...AVAILABLE_FONTS];

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

    // First, populate from registry's variantMockups (default images per color)
    // Also map variant Shopify IDs to mockup URLs so the storefront can swap on variant change
    if (productBase.variantMockups) {
      for (const [colorName, url] of Object.entries(productBase.variantMockups)) {
        variantImageMap[colorName] = url;
        variantImageMap[colorName.toLowerCase()] = url;
      }
      // Map each Shopify variant to its color's mockup
      // The storefront sends Shopify variant IDs, not color names
      for (const variant of variants) {
        const mockupUrl = productBase.variantMockups[variant.color];
        if (mockupUrl) {
          // Store by printful variant ID (which may be the Shopify variant ID)
          variantImageMap[String(variant.printfulVariantId)] = mockupUrl;
        }
      }
    }

    // Then overlay with DB mockup images (merchant-uploaded take priority)
    for (const mockup of template.mockupImages) {
      if (mockup.shopifyVariantId) {
        variantImageMap[mockup.shopifyVariantId] = mockup.imageUrl;
        const numId = extractNumericId(mockup.shopifyVariantId);
        variantImageMap[numId] = mockup.imageUrl;
      }
      variantImageMap[mockup.variantColor] = mockup.imageUrl;
      variantImageMap[mockup.variantColor.toLowerCase()] = mockup.imageUrl;
    }

    // Find current variant's mockup
    if (gidVariantId) {
      currentMockupUrl =
        variantImageMap[gidVariantId] ||
        variantImageMap[variantId] ||
        variantImageMap[extractNumericId(variantId)] ||
        null;
    }

    // Fallback to default mockup
    if (!currentMockupUrl) {
      const defaultMockup = template.mockupImages.find((m) => m.isDefault);
      currentMockupUrl =
        defaultMockup?.imageUrl ||
        template.mockupImages[0]?.imageUrl ||
        productBase.defaultMockupUrl ||
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
            productBase.defaultMockupUrl ||
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
