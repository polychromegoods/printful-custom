import type { LoaderFunctionArgs } from "@remix-run/node";
import { createCanvas, registerFont } from "canvas";
import path from "path";
import fs from "fs";

// Preview dimensions — good for thumbnails
const PREVIEW_WIDTH = 400;
const PREVIEW_HEIGHT = 400;

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
 * GET /api/preview?text=ABC&style=script&color=%23000000
 *
 * Generates a monogram preview image and returns it directly as PNG.
 * 
 * This endpoint is called via Shopify App Proxy at:
 *   /apps/api/preview?text=ABC&style=script&color=%23000000
 *
 * The app proxy URL itself serves as the permanent image URL.
 * When stored as a line item property, Shopify will render it as a
 * thumbnail in cart, checkout, order confirmation, and admin.
 *
 * Supports two response formats:
 *   - format=image (default): Returns raw PNG bytes (for <img src="...">)
 *   - format=json: Returns { "url": "<app-proxy-image-url>" }
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const text = (url.searchParams.get("text") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const style = url.searchParams.get("style") === "block" ? "block" : "script";
  const color = url.searchParams.get("color") || "#000000";
  const format = url.searchParams.get("format") || "image";

  if (!text) {
    return new Response(JSON.stringify({ error: "Missing text parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Generate the preview image
  const canvas = createCanvas(PREVIEW_WIDTH, PREVIEW_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Draw hat silhouette background
  drawHatSilhouette(ctx, PREVIEW_WIDTH, PREVIEW_HEIGHT);

  // Draw the monogram text on the hat
  const centerX = PREVIEW_WIDTH * 0.50;
  const centerY = PREVIEW_WIDTH * 0.38;

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (style === "script") {
    const fontSize = Math.round(PREVIEW_WIDTH * 0.18);
    ctx.font = `${fontSize}px GreatVibes`;
    ctx.fillText(text, centerX, centerY);
  } else {
    if (text.length === 3) {
      const bigSize = Math.round(PREVIEW_WIDTH * 0.2);
      const smallSize = Math.round(PREVIEW_WIDTH * 0.14);
      const spacing = PREVIEW_WIDTH * 0.14;

      ctx.font = `bold ${bigSize}px MontserratBold`;
      ctx.fillText(text[1], centerX, centerY);

      ctx.font = `bold ${smallSize}px MontserratBold`;
      ctx.fillText(text[0], centerX - spacing, centerY);
      ctx.fillText(text[2], centerX + spacing, centerY);
    } else {
      const fontSize = Math.round(PREVIEW_WIDTH * 0.18);
      ctx.font = `bold ${fontSize}px MontserratBold`;
      ctx.fillText(text, centerX, centerY);
    }
  }

  const buffer = canvas.toBuffer("image/png");

  // For JSON format: return the app proxy URL that serves this image
  if (format === "json") {
    // Build the app proxy URL for this preview image
    // The storefront can use this URL directly as an <img> src
    const encodedColor = encodeURIComponent(color);
    const imageUrl = `/apps/api/preview?text=${encodeURIComponent(text)}&style=${encodeURIComponent(style)}&color=${encodedColor}&format=image`;

    return new Response(JSON.stringify({ url: imageUrl }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Default: return the image directly as PNG
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
 * Draw a simple hat silhouette as the preview background.
 */
function drawHatSilhouette(ctx: any, w: number, h: number) {
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, w, h);

  // Hat crown
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.55);
  ctx.quadraticCurveTo(w * 0.15, h * 0.12, w * 0.5, h * 0.10);
  ctx.quadraticCurveTo(w * 0.85, h * 0.12, w * 0.85, h * 0.55);
  ctx.lineTo(w * 0.15, h * 0.55);
  ctx.fill();

  // Brim
  ctx.fillStyle = "#ddd";
  ctx.beginPath();
  ctx.moveTo(w * 0.05, h * 0.58);
  ctx.quadraticCurveTo(w * 0.5, h * 0.50, w * 0.95, h * 0.58);
  ctx.quadraticCurveTo(w * 0.5, h * 0.68, w * 0.05, h * 0.58);
  ctx.fill();

  // Outline
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.55);
  ctx.quadraticCurveTo(w * 0.15, h * 0.12, w * 0.5, h * 0.10);
  ctx.quadraticCurveTo(w * 0.85, h * 0.12, w * 0.85, h * 0.55);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w * 0.05, h * 0.58);
  ctx.quadraticCurveTo(w * 0.5, h * 0.50, w * 0.95, h * 0.58);
  ctx.quadraticCurveTo(w * 0.5, h * 0.68, w * 0.05, h * 0.58);
  ctx.stroke();
}
