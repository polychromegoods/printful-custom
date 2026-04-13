import type { LoaderFunctionArgs } from "@remix-run/node";
import { createCanvas, registerFont } from "canvas";
import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

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

// Simple in-memory cache to avoid re-generating the same preview
const previewCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/preview?text=ABC&style=script&color=%23000000
 *
 * Generates a monogram preview image, uploads it to a public CDN,
 * and returns a JSON response with the permanent image URL.
 *
 * This endpoint is called via Shopify App Proxy at:
 *   /apps/api/preview?text=ABC&style=script&color=%23000000
 *
 * Response: { "url": "https://cdn.example.com/preview-12345.png" }
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const text = (url.searchParams.get("text") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const style = url.searchParams.get("style") === "block" ? "block" : "script";
  const color = url.searchParams.get("color") || "#000000";
  const format = url.searchParams.get("format") || "json"; // "json" or "image"

  if (!text) {
    return new Response(JSON.stringify({ error: "Missing text parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Check cache
  const cacheKey = `${text}-${style}-${color}`;
  const cached = previewCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (format === "image") {
      // Redirect to the cached URL
      return new Response(null, {
        status: 302,
        headers: { Location: cached.url, "Access-Control-Allow-Origin": "*" },
      });
    }
    return new Response(JSON.stringify({ url: cached.url }), {
      status: 200,
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

  // Save to temp file
  const tmpPath = path.join(os.tmpdir(), `monogram-preview-${text}-${style}-${Date.now()}.png`);
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(tmpPath, buffer);

  try {
    // Upload to public CDN using manus-upload-file
    const output = execSync(`manus-upload-file ${tmpPath}`, {
      encoding: "utf-8",
      timeout: 30000,
    }).trim();

    // Extract the CDN URL
    let publicUrl = "";
    const lines = output.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
        publicUrl = trimmed;
      }
      const cdnMatch = trimmed.match(/CDN URL:\s*(https?:\/\/\S+)/);
      if (cdnMatch) {
        publicUrl = cdnMatch[1];
      }
    }

    if (!publicUrl) {
      throw new Error(`Failed to get public URL from upload: ${output}`);
    }

    console.log(`[preview] Generated and uploaded preview: ${publicUrl}`);

    // Cache the result
    previewCache.set(cacheKey, { url: publicUrl, timestamp: Date.now() });

    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    if (format === "image") {
      return new Response(null, {
        status: 302,
        headers: { Location: publicUrl, "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({ url: publicUrl }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    console.error(`[preview] Error uploading preview:`, error.message);

    // Fallback: return the image directly as binary
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    if (format === "image") {
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // For JSON format, return a data URL as fallback
    const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
    return new Response(JSON.stringify({ url: dataUrl, fallback: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
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
