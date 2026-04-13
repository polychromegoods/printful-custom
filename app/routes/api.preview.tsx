import type { LoaderFunctionArgs } from "@remix-run/node";
import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";
import fs from "fs";
import db from "../db.server";
import { getProductBase } from "../config/product-bases";

// Preview dimensions
const PREVIEW_WIDTH = 600;
const PREVIEW_HEIGHT = 600;

// Register fonts
const fontsDir = path.join(process.cwd(), "fonts");

function ensureFontsRegistered() {
  const fontFiles: Record<string, { family: string }> = {
    "GreatVibes-Regular.ttf": { family: "GreatVibes" },
    "Montserrat-Bold.ttf": { family: "MontserratBold" },
    "Oswald-Bold.ttf": { family: "OswaldBold" },
    "PlayfairDisplay-Regular.ttf": { family: "PlayfairDisplay" },
    "CormorantGaramond-Regular.ttf": { family: "CormorantGaramond" },
    "Montserrat-Regular.ttf": { family: "Montserrat" },
  };

  for (const [file, config] of Object.entries(fontFiles)) {
    const fontPath = path.join(fontsDir, file);
    if (fs.existsSync(fontPath)) {
      try {
        registerFont(fontPath, config);
      } catch {
        // Already registered
      }
    }
  }
}

ensureFontsRegistered();

const FONT_MAP: Record<string, string> = {
  script: "GreatVibes",
  block: "MontserratBold",
  serif: "PlayfairDisplay",
  sans: "Montserrat",
  monogram_classic: "CormorantGaramond",
};

/**
 * GET /api/preview?text=ABC&style=script&color=%23000000&product_id=123&variant_id=456
 *
 * Generates a monogram preview image composited onto the real product base image.
 * If no product base is configured, falls back to a generic hat silhouette.
 *
 * Called via Shopify App Proxy at:
 *   /apps/api/preview?text=ABC&style=script&color=%23000000&product_id=123&variant_id=456
 *
 * Supports two response formats:
 *   - format=image (default): Returns raw PNG bytes
 *   - format=json: Returns { "url": "<app-proxy-image-url>" }
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const text = (url.searchParams.get("text") || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 10);
  const style = url.searchParams.get("style") || "block";
  const color = url.searchParams.get("color") || "#000000";
  const format = url.searchParams.get("format") || "image";
  const productId = url.searchParams.get("product_id") || "";
  const variantId = url.searchParams.get("variant_id") || "";
  const shop = url.searchParams.get("shop") || "";
  const colorName = url.searchParams.get("color_name") || "";

  if (!text) {
    return new Response(
      JSON.stringify({ error: "Missing text parameter" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // ─── Try to load the product template and mockup image ───
  let baseImageUrl: string | null = null;
  let printArea = { x: 25, y: 15, width: 50, height: 35 };

  const handle = url.searchParams.get("handle") || "";

  if (productId || handle) {
    // Extract numeric ID for flexible matching
    const numericProductId = productId
      ? (productId.startsWith("gid://") ? productId.split("/").pop()! : productId)
      : "";
    const gidProductId = numericProductId ? `gid://shopify/Product/${numericProductId}` : "";
    const gidVariantId = variantId
      ? `gid://shopify/ProductVariant/${variantId.startsWith("gid://") ? variantId.split("/").pop()! : variantId}`
      : null;

    try {
      // Try multiple ID formats for robust matching
      const includeOpts = { mockupImages: { orderBy: { sortOrder: "asc" } as const } };
      let template = gidProductId ? await db.productTemplate.findFirst({
        where: { shopifyProductId: gidProductId, isActive: true, ...(shop ? { shop } : {}) },
        include: includeOpts,
      }) : null;
      if (!template && gidProductId) {
        template = await db.productTemplate.findFirst({
          where: { shopifyProductId: gidProductId, isActive: true },
          include: includeOpts,
        });
      }
      if (!template && numericProductId) {
        template = await db.productTemplate.findFirst({
          where: { shopifyProductId: numericProductId, isActive: true },
          include: includeOpts,
        });
      }
      if (!template && numericProductId) {
        template = await db.productTemplate.findFirst({
          where: { shopifyProductId: { contains: numericProductId }, isActive: true },
          include: includeOpts,
        });
      }
      // Handle-based fallback (storefront legacy ID may differ from Admin GID)
      if (!template && handle) {
        template = await db.productTemplate.findFirst({
          where: { productHandle: handle, isActive: true },
          include: includeOpts,
        });
      }

      if (template) {
        printArea = {
          x: template.printAreaX,
          y: template.printAreaY,
          width: template.printAreaWidth,
          height: template.printAreaHeight,
        };

        // Find best matching mockup image
        let matchedImage = null;

        // Try to match by color name in DB mockups
        if (colorName) {
          matchedImage = template.mockupImages.find(
            (img) => img.variantColor.toLowerCase() === colorName.toLowerCase()
          );
        }

        // Try to match by variant ID
        if (!matchedImage && gidVariantId) {
          matchedImage = template.mockupImages.find(
            (img) => img.shopifyVariantId === gidVariantId
          );
          // Also try numeric ID match
          if (!matchedImage) {
            const numericId = variantId.replace(/\D/g, "");
            matchedImage = template.mockupImages.find(
              (img) =>
                img.shopifyVariantId &&
                img.shopifyVariantId.includes(numericId)
            );
          }
        }

        // Try default image
        if (!matchedImage) {
          matchedImage = template.mockupImages.find((img) => img.isDefault);
        }

        // Fall back to first image
        if (!matchedImage && template.mockupImages.length > 0) {
          matchedImage = template.mockupImages[0];
        }

        if (matchedImage) {
          baseImageUrl = matchedImage.imageUrl;
        }

        // ★ If no DB mockup found for this color, try the registry's variantMockups
        if (!baseImageUrl || (colorName && !matchedImage?.variantColor?.toLowerCase().includes(colorName.toLowerCase()))) {
          const productBase = getProductBase(template.productBaseSlug);
          if (productBase?.variantMockups) {
            // Try exact color name match
            const registryUrl = productBase.variantMockups[colorName]
              || productBase.variantMockups[colorName.charAt(0).toUpperCase() + colorName.slice(1)]
              || Object.entries(productBase.variantMockups).find(
                  ([k]) => k.toLowerCase() === colorName.toLowerCase()
                )?.[1];
            if (registryUrl) {
              baseImageUrl = registryUrl;
              console.log(`[Preview] Using registry mockup for color "${colorName}": ${registryUrl}`);
            }
          }
          // If still no base image, use registry default
          if (!baseImageUrl && !matchedImage) {
            const productBase2 = getProductBase(template.productBaseSlug);
            if (productBase2?.defaultMockupUrl) {
              baseImageUrl = productBase2.defaultMockupUrl;
            }
          }
        }
      }
    } catch (error) {
      console.error("Error loading product template:", error);
    }
  }

  // ─── Generate the preview image ───
  const canvas = createCanvas(PREVIEW_WIDTH, PREVIEW_HEIGHT);
  const ctx = canvas.getContext("2d");

  if (baseImageUrl) {
    // Load and draw the real product base image
    try {
      const baseImage = await loadImage(baseImageUrl);
      // Scale to fit canvas while maintaining aspect ratio
      const scale = Math.min(
        PREVIEW_WIDTH / baseImage.width,
        PREVIEW_HEIGHT / baseImage.height
      );
      const scaledW = baseImage.width * scale;
      const scaledH = baseImage.height * scale;
      const offsetX = (PREVIEW_WIDTH - scaledW) / 2;
      const offsetY = (PREVIEW_HEIGHT - scaledH) / 2;

      // White background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

      ctx.drawImage(baseImage, offsetX, offsetY, scaledW, scaledH);

      // Calculate print area in pixel coordinates
      const paX = offsetX + scaledW * (printArea.x / 100);
      const paY = offsetY + scaledH * (printArea.y / 100);
      const paW = scaledW * (printArea.width / 100);
      const paH = scaledH * (printArea.height / 100);

      // Draw text within the print area
      drawTextInArea(ctx, text, style, color, paX, paY, paW, paH);
    } catch (error) {
      console.error("Error loading base image, falling back:", error);
      drawHatSilhouette(ctx, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      drawTextCentered(ctx, text, style, color, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    }
  } else {
    // No product base configured — use generic hat silhouette
    drawHatSilhouette(ctx, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    drawTextCentered(ctx, text, style, color, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  }

  const buffer = canvas.toBuffer("image/png");

  // For JSON format: return the app proxy URL
  if (format === "json") {
    const params = new URLSearchParams({
      text,
      style,
      color,
      format: "image",
    });
    if (productId) params.set("product_id", productId);
    if (variantId) params.set("variant_id", variantId);

    const imageUrl = `/apps/api/preview?${params.toString()}`;

    return new Response(JSON.stringify({ url: imageUrl }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Default: return image directly
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

/**
 * Draw text within a specific print area rectangle.
 * Supports multiple font styles and traditional monogram layout.
 */
function drawTextInArea(
  ctx: any,
  text: string,
  style: string,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const centerX = x + w / 2;
  const centerY = y + h / 2;

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Subtle shadow for visibility on any background
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  const fontFamily = FONT_MAP[style] || "MontserratBold";
  const isScript = style === "script";

  if (isScript) {
    const fontSize = Math.min(w * 0.5, h * 0.85);
    ctx.font = `${Math.round(fontSize)}px ${fontFamily}`;
    ctx.fillText(text, centerX, centerY);
  } else if (text.length === 3 && style !== "sans") {
    // Traditional monogram layout: first-LAST(big)-middle
    const baseSize = Math.min(w * 0.5, h * 0.85);
    const bigSize = baseSize * 1.35;
    const smallSize = baseSize * 0.85;
    const spacing = w * 0.28;

    ctx.font = `bold ${Math.round(bigSize)}px ${fontFamily}`;
    ctx.fillText(text[1], centerX, centerY);

    ctx.font = `bold ${Math.round(smallSize)}px ${fontFamily}`;
    ctx.fillText(text[0], centerX - spacing, centerY);
    ctx.fillText(text[2], centerX + spacing, centerY);
  } else {
    const fontSize = Math.min(w * 0.5, h * 0.85);
    ctx.font = `bold ${Math.round(fontSize)}px ${fontFamily}`;
    ctx.fillText(text, centerX, centerY);
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Draw text centered on the canvas (fallback when no base image).
 */
function drawTextCentered(
  ctx: any,
  text: string,
  style: string,
  color: string,
  w: number,
  h: number
) {
  drawTextInArea(ctx, text, style, color, w * 0.1, h * 0.15, w * 0.8, h * 0.5);
}

/**
 * Draw a simple hat silhouette as fallback background.
 */
function drawHatSilhouette(ctx: any, w: number, h: number) {
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, w, h);

  // Hat crown
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.55);
  ctx.quadraticCurveTo(w * 0.15, h * 0.12, w * 0.5, h * 0.1);
  ctx.quadraticCurveTo(w * 0.85, h * 0.12, w * 0.85, h * 0.55);
  ctx.lineTo(w * 0.15, h * 0.55);
  ctx.fill();

  // Brim
  ctx.fillStyle = "#ddd";
  ctx.beginPath();
  ctx.moveTo(w * 0.05, h * 0.58);
  ctx.quadraticCurveTo(w * 0.5, h * 0.5, w * 0.95, h * 0.58);
  ctx.quadraticCurveTo(w * 0.5, h * 0.68, w * 0.05, h * 0.58);
  ctx.fill();

  // Outline
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.55);
  ctx.quadraticCurveTo(w * 0.15, h * 0.12, w * 0.5, h * 0.1);
  ctx.quadraticCurveTo(w * 0.85, h * 0.12, w * 0.85, h * 0.55);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w * 0.05, h * 0.58);
  ctx.quadraticCurveTo(w * 0.5, h * 0.5, w * 0.95, h * 0.58);
  ctx.quadraticCurveTo(w * 0.5, h * 0.68, w * 0.05, h * 0.58);
  ctx.stroke();
}
