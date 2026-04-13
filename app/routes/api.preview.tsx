import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { getProductBase } from "../config/product-bases";
import { getSharp } from "../fonts/setup-fonts";

// ─── Constants ──────────────────────────────────────────────────────────────

const PREVIEW_SIZE = 600;

/**
 * Map font key → SVG font-family name.
 * These must match the family names declared in app/fonts/fonts.conf
 * so that librsvg (used by sharp) can resolve them.
 */
const SVG_FONT_MAP: Record<string, string> = {
  script: "Great Vibes",       // TODO: bundle this font
  block: "Oswald",
  serif: "Playfair Display",
  sans: "Montserrat",
  monogram_classic: "Cormorant Garamond",
};

// FONTCONFIG_PATH is set by setup-fonts.ts before sharp loads

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Escape text for safe embedding in SVG */
function svgEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build an SVG string that renders the monogram text.
 * Coordinates are in pixels relative to a PREVIEW_SIZE × PREVIEW_SIZE canvas.
 */
function buildTextSvg(
  text: string,
  style: string,
  color: string,
  paX: number,
  paY: number,
  paW: number,
  paH: number,
): string {
  const fontFamily = SVG_FONT_MAP[style] || "Montserrat";
  const isScript = style === "script";
  const centerX = paX + paW / 2;
  const centerY = paY + paH / 2;

  let textElements = "";

  // SVG uses dominant-baseline="central" for vertical centering
  const baseline = 'dominant-baseline="central"';
  const anchor = 'text-anchor="middle"';
  const fill = `fill="${svgEscape(color)}"`;
  const weight = isScript ? "" : ' font-weight="bold"';

  if (
    text.length === 3 &&
    !isScript &&
    style !== "sans"
  ) {
    // Traditional monogram: first-LAST(big)-middle
    // Match monogram.server.ts sizing: bigSize = min(w*0.45, h*0.75), smallSize = bigSize*0.65
    const bigSize = Math.min(paW * 0.45, paH * 0.75);
    const smallSize = bigSize * 0.65;
    const spacing = paW * 0.28;

    const first = svgEscape(text[0]);
    const last = svgEscape(text[1]);
    const middle = svgEscape(text[2]);

    // Center letter (last initial, larger)
    textElements += `<text x="${centerX}" y="${centerY}" font-family="${fontFamily}" font-size="${Math.round(bigSize)}"${weight} ${fill} ${anchor} ${baseline}>${last}</text>`;
    // Left letter (first initial)
    textElements += `<text x="${centerX - spacing}" y="${centerY + bigSize * 0.03}" font-family="${fontFamily}" font-size="${Math.round(smallSize)}"${weight} ${fill} ${anchor} ${baseline}>${first}</text>`;
    // Right letter (middle initial)
    textElements += `<text x="${centerX + spacing}" y="${centerY + bigSize * 0.03}" font-family="${fontFamily}" font-size="${Math.round(smallSize)}"${weight} ${fill} ${anchor} ${baseline}>${middle}</text>`;
  } else {
    // Script, sans, or non-3-letter: just center the text
    const fontSize = isScript
      ? Math.min(paW * 0.5, paH * 0.7)
      : Math.min(paW * 0.4, paH * 0.6);
    const escaped = svgEscape(text);
    textElements = `<text x="${centerX}" y="${centerY}" font-family="${fontFamily}" font-size="${Math.round(fontSize)}"${weight} ${fill} ${anchor} ${baseline}>${escaped}</text>`;
  }

  // Add a subtle drop shadow via SVG filter
  return `<svg width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.12)" />
    </filter>
  </defs>
  <g filter="url(#shadow)">
    ${textElements}
  </g>
</svg>`;
}

/**
 * Build a simple hat silhouette SVG as fallback when no mockup is available.
 */
function buildSilhouetteSvg(): string {
  const w = PREVIEW_SIZE;
  const h = PREVIEW_SIZE;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="#f5f5f5"/>
  <path d="M${w * 0.15},${h * 0.55} Q${w * 0.15},${h * 0.12} ${w * 0.5},${h * 0.1} Q${w * 0.85},${h * 0.12} ${w * 0.85},${h * 0.55} Z" fill="#e8e8e8" stroke="#ccc" stroke-width="1"/>
  <path d="M${w * 0.05},${h * 0.58} Q${w * 0.5},${h * 0.5} ${w * 0.95},${h * 0.58} Q${w * 0.5},${h * 0.68} ${w * 0.05},${h * 0.58} Z" fill="#ddd" stroke="#ccc" stroke-width="1"/>
</svg>`;
}

// ─── Main Loader ────────────────────────────────────────────────────────────

/**
 * GET /api/preview?text=ABC&style=serif&color=%23000000&product_id=123&handle=hat-2&color_name=Spruce
 *
 * Generates a monogram preview image composited onto the real product mockup.
 * Uses sharp (libvips) for all image operations — no node-canvas dependency.
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
  const handle = url.searchParams.get("handle") || "";

  if (!text) {
    return new Response(
      JSON.stringify({ error: "Missing text parameter" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  // ─── Resolve the product template and mockup image URL ───
  let baseImageUrl: string | null = null;
  let printArea = { x: 25, y: 15, width: 50, height: 35 };

  if (productId || handle) {
    const numericProductId = productId
      ? productId.startsWith("gid://")
        ? productId.split("/").pop()!
        : productId
      : "";
    const gidProductId = numericProductId
      ? `gid://shopify/Product/${numericProductId}`
      : "";
    const gidVariantId = variantId
      ? `gid://shopify/ProductVariant/${
          variantId.startsWith("gid://") ? variantId.split("/").pop()! : variantId
        }`
      : null;

    try {
      const includeOpts = {
        mockupImages: { orderBy: { sortOrder: "asc" } as const },
      };

      // Multi-strategy template lookup
      let template =
        (gidProductId
          ? await db.productTemplate.findFirst({
              where: { shopifyProductId: gidProductId, isActive: true, ...(shop ? { shop } : {}) },
              include: includeOpts,
            })
          : null) ||
        (gidProductId
          ? await db.productTemplate.findFirst({
              where: { shopifyProductId: gidProductId, isActive: true },
              include: includeOpts,
            })
          : null) ||
        (numericProductId
          ? await db.productTemplate.findFirst({
              where: { shopifyProductId: numericProductId, isActive: true },
              include: includeOpts,
            })
          : null) ||
        (numericProductId
          ? await db.productTemplate.findFirst({
              where: { shopifyProductId: { contains: numericProductId }, isActive: true },
              include: includeOpts,
            })
          : null) ||
        (handle
          ? await db.productTemplate.findFirst({
              where: { productHandle: handle, isActive: true },
              include: includeOpts,
            })
          : null);

      if (template) {
        printArea = {
          x: template.printAreaX,
          y: template.printAreaY,
          width: template.printAreaWidth,
          height: template.printAreaHeight,
        };

        const productBase = getProductBase(template.productBaseSlug);

        // STEP 1: DB mockup images (user-uploaded, most reliable)
        if (template.mockupImages.length > 0) {
          let matchedImage =
            (colorName
              ? template.mockupImages.find(
                  (img) => img.variantColor.toLowerCase() === colorName.toLowerCase(),
                )
              : null) ||
            (gidVariantId
              ? template.mockupImages.find((img) => img.shopifyVariantId === gidVariantId)
              : null) ||
            template.mockupImages.find((img) => img.isDefault) ||
            template.mockupImages[0];

          if (matchedImage) {
            // If we have a color-specific DB match, use it directly
            // If we only have a generic/default match and a specific color was requested,
            // try the registry first for the correct color
            const isExactColorMatch = colorName &&
              matchedImage.variantColor.toLowerCase() === colorName.toLowerCase();

            if (isExactColorMatch || !colorName) {
              baseImageUrl = matchedImage.imageUrl;
              console.log(`[Preview] DB mockup (exact match): ${matchedImage.variantColor}`);
            } else {
              // We have a DB mockup but it's not the right color — try registry first
              if (productBase?.variantMockups) {
                const registryUrl =
                  productBase.variantMockups[colorName] ||
                  Object.entries(productBase.variantMockups).find(
                    ([k]) => k.toLowerCase() === colorName.toLowerCase(),
                  )?.[1];
                if (registryUrl) {
                  baseImageUrl = registryUrl;
                  console.log(`[Preview] Registry mockup for "${colorName}": ${registryUrl.slice(-30)}`);
                }
              }
              // If registry didn't have it either, use the DB default
              if (!baseImageUrl) {
                baseImageUrl = matchedImage.imageUrl;
                console.log(`[Preview] DB mockup (fallback): ${matchedImage.variantColor}`);
              }
            }
          }
        }

        // STEP 2: Registry variantMockups (fallback when no DB mockup at all)
        if (!baseImageUrl && colorName && productBase?.variantMockups) {
          const registryUrl =
            productBase.variantMockups[colorName] ||
            Object.entries(productBase.variantMockups).find(
              ([k]) => k.toLowerCase() === colorName.toLowerCase(),
            )?.[1];
          if (registryUrl) {
            baseImageUrl = registryUrl;
            console.log(`[Preview] Registry mockup for "${colorName}": ${registryUrl.slice(-30)}`);
          }
        }

        // STEP 3: Registry default
        if (!baseImageUrl && productBase?.defaultMockupUrl) {
          baseImageUrl = productBase.defaultMockupUrl;
          console.log(`[Preview] Registry default mockup`);
        }
      } else {
        console.log(`[Preview] No template found for product_id=${productId} handle=${handle}`);
      }
    } catch (error) {
      console.error("[Preview] Error loading template:", error);
    }
  }

  // ─── Generate the preview image with sharp ───
  const sharpFn = await getSharp();
  let outputBuffer: Buffer;

  try {
    if (baseImageUrl) {
      // Fetch the mockup image
      const resp = await fetch(baseImageUrl);
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} for ${baseImageUrl}`);
      const imgBuf = Buffer.from(await resp.arrayBuffer());

      // Resize to PREVIEW_SIZE × PREVIEW_SIZE with white background
      const resizedBase = await sharpFn(imgBuf)
        .resize(PREVIEW_SIZE, PREVIEW_SIZE, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer();

      // Calculate print area in pixel coordinates
      // The image is "contain" fitted, so we need to figure out the actual image bounds
      const metadata = await sharpFn(imgBuf).metadata();
      const srcW = metadata.width || PREVIEW_SIZE;
      const srcH = metadata.height || PREVIEW_SIZE;
      const scale = Math.min(PREVIEW_SIZE / srcW, PREVIEW_SIZE / srcH);
      const scaledW = srcW * scale;
      const scaledH = srcH * scale;
      const offsetX = (PREVIEW_SIZE - scaledW) / 2;
      const offsetY = (PREVIEW_SIZE - scaledH) / 2;

      const paX = offsetX + scaledW * (printArea.x / 100);
      const paY = offsetY + scaledH * (printArea.y / 100);
      const paW = scaledW * (printArea.width / 100);
      const paH = scaledH * (printArea.height / 100);

      // Build SVG text overlay
      const textSvg = buildTextSvg(text, style, color, paX, paY, paW, paH);

      // Composite text onto the mockup
      outputBuffer = await sharpFn(resizedBase)
        .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
        .png()
        .toBuffer();

      console.log(`[Preview] Generated ${text} (${style}, ${color}) on ${colorName || "default"}`);
    } else {
      // No mockup available — render silhouette + text
      const silhouetteSvg = buildSilhouetteSvg();
      const silhouetteBuffer = await sharpFn(Buffer.from(silhouetteSvg))
        .png()
        .toBuffer();

      // Default print area for silhouette
      const paX = PREVIEW_SIZE * 0.1;
      const paY = PREVIEW_SIZE * 0.15;
      const paW = PREVIEW_SIZE * 0.8;
      const paH = PREVIEW_SIZE * 0.35;

      const textSvg = buildTextSvg(text, style, color, paX, paY, paW, paH);

      outputBuffer = await sharpFn(silhouetteBuffer)
        .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
        .png()
        .toBuffer();

      console.log(`[Preview] Generated ${text} on silhouette (no mockup found)`);
    }
  } catch (error) {
    console.error("[Preview] Image generation error:", error);

    // Last-resort fallback: silhouette with text, all via SVG
    const fallbackSvg = `<svg width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}" fill="#f5f5f5"/>
      <text x="${PREVIEW_SIZE / 2}" y="${PREVIEW_SIZE / 2}" font-family="sans-serif" font-size="60" font-weight="bold"
            fill="${svgEscape(color)}" text-anchor="middle" dominant-baseline="central">${svgEscape(text)}</text>
    </svg>`;
    outputBuffer = await sharpFn(Buffer.from(fallbackSvg)).png().toBuffer();
  }

  // ─── Return response ───
  if (format === "json") {
    const params = new URLSearchParams({ text, style, color, format: "image" });
    if (productId) params.set("product_id", productId);
    if (variantId) params.set("variant_id", variantId);
    if (handle) params.set("handle", handle);
    if (colorName) params.set("color_name", colorName);

    return new Response(
      JSON.stringify({ url: `/apps/api/preview?${params.toString()}` }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  return new Response(outputBuffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
