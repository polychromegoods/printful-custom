import type { LoaderFunctionArgs } from "@remix-run/node";
import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";
import fs from "fs";
import db from "../db.server";

// Preview dimensions
const PREVIEW_WIDTH = 600;
const PREVIEW_HEIGHT = 600;

// Register fonts
const fontsDir = path.join(process.cwd(), "fonts");

function ensureFontsRegistered() {
  const scriptFont = path.join(fontsDir, "GreatVibes-Regular.ttf");
  const blockFont = path.join(fontsDir, "Montserrat-Bold.ttf");

  if (fs.existsSync(scriptFont)) {
    try {
      registerFont(scriptFont, { family: "GreatVibes" });
    } catch {
      // Already registered
    }
  }
  if (fs.existsSync(blockFont)) {
    try {
      registerFont(blockFont, { family: "MontserratBold" });
    } catch {
      // Already registered
    }
  }
}

ensureFontsRegistered();

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
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  const style =
    url.searchParams.get("style") === "block" ? "block" : "script";
  const color = url.searchParams.get("color") || "#000000";
  const format = url.searchParams.get("format") || "image";
  const productId = url.searchParams.get("product_id") || "";
  const variantId = url.searchParams.get("variant_id") || "";
  const shop = url.searchParams.get("shop") || "";

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

  // ─── Try to load the product base image ───
  let baseImageUrl: string | null = null;
  let printArea = { x: 25, y: 15, width: 50, height: 35 };

  if (productId) {
    const gidProductId = productId.startsWith("gid://")
      ? productId
      : `gid://shopify/Product/${productId}`;
    const gidVariantId = variantId
      ? variantId.startsWith("gid://")
        ? variantId
        : `gid://shopify/ProductVariant/${variantId}`
      : null;

    try {
      const productBase = await db.productBase.findFirst({
        where: {
          shopifyProductId: gidProductId,
          isActive: true,
          ...(shop ? { shop } : {}),
        },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
        },
      });

      if (productBase) {
        printArea = {
          x: productBase.printAreaX,
          y: productBase.printAreaY,
          width: productBase.printAreaWidth,
          height: productBase.printAreaHeight,
        };

        // Find best matching image
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
        if (matchedImage) {
          baseImageUrl = matchedImage.imageUrl;
        }
      }
    } catch (error) {
      console.error("Error loading product base:", error);
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

      // Draw monogram text within the print area
      drawMonogramInArea(ctx, text, style, color, paX, paY, paW, paH);
    } catch (error) {
      console.error("Error loading base image, falling back:", error);
      // Fall back to generic silhouette
      drawHatSilhouette(ctx, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      drawMonogramCentered(ctx, text, style, color, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    }
  } else {
    // No product base configured — use generic hat silhouette
    drawHatSilhouette(ctx, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    drawMonogramCentered(ctx, text, style, color, PREVIEW_WIDTH, PREVIEW_HEIGHT);
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
 * Draw monogram text within a specific print area rectangle.
 */
function drawMonogramInArea(
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

  if (style === "script") {
    // Size to fit the print area
    const fontSize = Math.min(w * 0.5, h * 0.7);
    ctx.font = `${Math.round(fontSize)}px GreatVibes`;
    ctx.fillText(text, centerX, centerY);
  } else {
    if (text.length === 3) {
      const bigSize = Math.min(w * 0.35, h * 0.7);
      const smallSize = bigSize * 0.65;
      const spacing = w * 0.28;

      ctx.font = `bold ${Math.round(bigSize)}px MontserratBold`;
      ctx.fillText(text[1], centerX, centerY);

      ctx.font = `bold ${Math.round(smallSize)}px MontserratBold`;
      ctx.fillText(text[0], centerX - spacing, centerY);
      ctx.fillText(text[2], centerX + spacing, centerY);
    } else {
      const fontSize = Math.min(w * 0.4, h * 0.6);
      ctx.font = `bold ${Math.round(fontSize)}px MontserratBold`;
      ctx.fillText(text, centerX, centerY);
    }
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Draw monogram centered on the canvas (fallback when no base image).
 */
function drawMonogramCentered(
  ctx: any,
  text: string,
  style: string,
  color: string,
  w: number,
  h: number
) {
  const centerX = w * 0.5;
  const centerY = h * 0.38;

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (style === "script") {
    const fontSize = Math.round(w * 0.18);
    ctx.font = `${fontSize}px GreatVibes`;
    ctx.fillText(text, centerX, centerY);
  } else {
    if (text.length === 3) {
      const bigSize = Math.round(w * 0.2);
      const smallSize = Math.round(w * 0.14);
      const spacing = w * 0.14;

      ctx.font = `bold ${bigSize}px MontserratBold`;
      ctx.fillText(text[1], centerX, centerY);

      ctx.font = `bold ${smallSize}px MontserratBold`;
      ctx.fillText(text[0], centerX - spacing, centerY);
      ctx.fillText(text[2], centerX + spacing, centerY);
    } else {
      const fontSize = Math.round(w * 0.18);
      ctx.font = `bold ${fontSize}px MontserratBold`;
      ctx.fillText(text, centerX, centerY);
    }
  }
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
