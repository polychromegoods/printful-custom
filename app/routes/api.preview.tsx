import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { getProductBase } from "../config/product-bases";
import { getSharp } from "../fonts/setup-fonts";
import { applyEmbroideryEffect } from "../services/dynamic-mockups.server";

// ─── Constants ──────────────────────────────────────────────────────────────

const PREVIEW_SIZE_FULL = 600;
const PREVIEW_SIZE_THUMB = 300;
const CACHE_MAX_ENTRIES = 200;
const MOCKUP_CACHE_MAX = 50;

/**
 * Map font key → SVG font-family name.
 * These must match the family names declared in app/fonts/fonts.conf
 * so that librsvg (used by sharp) can resolve them.
 */
const SVG_FONT_MAP: Record<string, string> = {
  script: "Great Vibes",
  block: "Oswald",
  serif: "Playfair Display",
  sans: "Montserrat",
  monogram_classic: "Cormorant Garamond",
};

// ─── LRU-style Caches ──────────────────────────────────────────────────────

/** Cache for final generated preview images (keyed by all params) */
const previewCache = new Map<string, { buffer: Buffer; timestamp: number }>();

/** Cache for fetched + resized base mockup images (keyed by URL + size) */
const mockupCache = new Map<string, { buffer: Buffer; metadata: { width: number; height: number }; timestamp: number }>();

function evictOldest(cache: Map<string, any>, maxEntries: number) {
  if (cache.size <= maxEntries) return;
  // Delete oldest entries (first inserted)
  const excess = cache.size - maxEntries;
  let count = 0;
  for (const key of cache.keys()) {
    if (count >= excess) break;
    cache.delete(key);
    count++;
  }
}

function buildCacheKey(
  text: string, style: string, color: string,
  handle: string, colorName: string, size: number
): string {
  return `${text}|${style}|${color}|${handle}|${colorName}|${size}`;
}

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
 */
function buildTextSvg(
  text: string,
  style: string,
  color: string,
  paX: number,
  paY: number,
  paW: number,
  paH: number,
  previewSize: number,
): string {
  const fontFamily = SVG_FONT_MAP[style] || "Montserrat";
  const isScript = style === "script";
  const centerX = paX + paW / 2;
  const centerY = paY + paH / 2;

  let textElements = "";

  const baseline = 'dominant-baseline="central"';
  const anchor = 'text-anchor="middle"';
  const fill = `fill="${svgEscape(color)}"`;
  const weight = isScript ? "" : ' font-weight="bold"';

  if (
    text.length === 3 &&
    !isScript &&
    style !== "sans"
  ) {
    const bigSize = Math.min(paW * 0.45, paH * 0.75);
    const smallSize = bigSize * 0.65;
    const spacing = paW * 0.28;

    const first = svgEscape(text[0]);
    const last = svgEscape(text[1]);
    const middle = svgEscape(text[2]);

    textElements += `<text x="${centerX}" y="${centerY}" font-family="${fontFamily}" font-size="${Math.round(bigSize)}"${weight} ${fill} ${anchor} ${baseline}>${last}</text>`;
    textElements += `<text x="${centerX - spacing}" y="${centerY + bigSize * 0.03}" font-family="${fontFamily}" font-size="${Math.round(smallSize)}"${weight} ${fill} ${anchor} ${baseline}>${first}</text>`;
    textElements += `<text x="${centerX + spacing}" y="${centerY + bigSize * 0.03}" font-family="${fontFamily}" font-size="${Math.round(smallSize)}"${weight} ${fill} ${anchor} ${baseline}>${middle}</text>`;
  } else {
    const lines = text.split("\n");
    let fontSize = isScript
      ? Math.min(paW * 0.5, paH * 0.7)
      : Math.min(paW * 0.4, paH * 0.6);
    
    // Scale down for multi-line
    if (lines.length > 3) fontSize = fontSize * (3 / lines.length);

    if (lines.length === 1) {
      const escaped = svgEscape(text);
      textElements = `<text x="${centerX}" y="${centerY}" font-family="${fontFamily}" font-size="${Math.round(fontSize)}"${weight} ${fill} ${anchor} ${baseline}>${escaped}</text>`;
    } else {
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      const startY = centerY - totalHeight / 2 + lineHeight / 2;
      
      textElements = lines.map((line, i) => {
        const escaped = svgEscape(line);
        return `<text x="${centerX}" y="${startY + i * lineHeight}" font-family="${fontFamily}" font-size="${Math.round(fontSize)}"${weight} ${fill} ${anchor} ${baseline}>${escaped}</text>`;
      }).join("");
    }
  }

  return `<svg width="${previewSize}" height="${previewSize}" xmlns="http://www.w3.org/2000/svg">
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
function buildSilhouetteSvg(previewSize: number): string {
  const w = previewSize;
  const h = previewSize;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="#f5f5f5"/>
  <path d="M${w * 0.15},${h * 0.55} Q${w * 0.15},${h * 0.12} ${w * 0.5},${h * 0.1} Q${w * 0.85},${h * 0.12} ${w * 0.85},${h * 0.55} Z" fill="#e8e8e8" stroke="#ccc" stroke-width="1"/>
  <path d="M${w * 0.05},${h * 0.58} Q${w * 0.5},${h * 0.5} ${w * 0.95},${h * 0.58} Q${w * 0.5},${h * 0.68} ${w * 0.05},${h * 0.58} Z" fill="#ddd" stroke="#ccc" stroke-width="1"/>
</svg>`;
}

/**
 * Fetch and cache a base mockup image (resized to target size).
 */
async function getCachedMockup(
  sharpFn: any,
  imageUrl: string,
  previewSize: number,
): Promise<{ resized: Buffer; srcW: number; srcH: number }> {
  const cacheKey = `${imageUrl}|${previewSize}`;
  const cached = mockupCache.get(cacheKey);
  if (cached) {
    return { resized: cached.buffer, srcW: cached.metadata.width, srcH: cached.metadata.height };
  }

  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} for ${imageUrl}`);
  const imgBuf = Buffer.from(await resp.arrayBuffer());

  const metadata = await sharpFn(imgBuf).metadata();
  const srcW = metadata.width || previewSize;
  const srcH = metadata.height || previewSize;

  const resized = await sharpFn(imgBuf)
    .resize(previewSize, previewSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  mockupCache.set(cacheKey, {
    buffer: resized,
    metadata: { width: srcW, height: srcH },
    timestamp: Date.now(),
  });
  evictOldest(mockupCache, MOCKUP_CACHE_MAX);

  return { resized, srcW, srcH };
}

/**
 * Render the text SVG to a transparent PNG buffer at the given print-area
 * dimensions, then send it to the Dynamic Mockups Embroidery Effect API.
 * Returns the embroidery-rendered PNG as a Buffer ready for compositing.
 *
 * Falls back to the plain SVG overlay if the API call fails.
 */
async function buildEmbroideryOverlay(
  sharpFn: any,
  text: string,
  style: string,
  color: string,
  paX: number,
  paY: number,
  paW: number,
  paH: number,
  previewSize: number,
): Promise<Buffer> {
  // 1. Render the text SVG to a PNG at the full preview canvas size
  const textSvg = buildTextSvg(text, style, color, paX, paY, paW, paH, previewSize);

  // Crop the SVG render down to just the print area so the embroidery API
  // receives a tight crop of the design (better results, less empty space).
  const pxX = Math.max(0, Math.round(paX));
  const pxY = Math.max(0, Math.round(paY));
  const pxW = Math.min(Math.round(paW), previewSize - pxX);
  const pxH = Math.min(Math.round(paH), previewSize - pxY);

  const designPng = await sharpFn(Buffer.from(textSvg))
    .png()
    .extract({ left: pxX, top: pxY, width: pxW, height: pxH })
    .toBuffer();

  // 2. Base64-encode and send to Dynamic Mockups
  const base64Design = designPng.toString("base64");

  try {
    const { url: embroideryUrl } = await applyEmbroideryEffect({
      imageBase64: base64Design,
    });

    // 3. Fetch the embroidery-rendered image and resize it back to print area size
    const embResp = await fetch(embroideryUrl);
    if (!embResp.ok) throw new Error(`Failed to fetch embroidery result: ${embResp.status}`);
    const embBuf = Buffer.from(await embResp.arrayBuffer());

    // Resize the embroidery result to fit the print area
    const embResized = await sharpFn(embBuf)
      .resize(pxW, pxH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    // 4. Place the resized embroidery image onto a full-canvas transparent PNG
    const canvas = await sharpFn({
      create: {
        width: previewSize,
        height: previewSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: embResized, top: pxY, left: pxX }])
      .png()
      .toBuffer();

    return canvas;
  } catch (err) {
    // Log and fall back to plain SVG overlay — never break the preview
    console.error("[Preview] Embroidery API failed, falling back to flat overlay:", err);
    return sharpFn(Buffer.from(textSvg)).png().toBuffer();
  }
}

// ─── Main Loader ────────────────────────────────────────────────────────────

/**
 * GET /api/preview?text=ABC&style=serif&color=%23000000&product_id=123&handle=hat-2&color_name=Spruce&size=thumb
 *
 * Generates a monogram preview image composited onto the real product mockup.
 * Uses sharp (libvips) for all image operations.
 *
 * For embroidery-technique templates, the text design is first processed by
 * the Dynamic Mockups Embroidery Effect API to produce a realistic stitched
 * rendering before compositing onto the mockup.
 *
 * Supports:
 *   - format=image (default): Returns raw JPEG bytes
 *   - format=json: Returns { "url": "<app-proxy-image-url>" }
 *   - size=thumb: Returns 300px image (for cart thumbnails)
 *   - size=full (default): Returns 600px image
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const text = (url.searchParams.get("text") || "")
    .slice(0, 1000);
  const style = url.searchParams.get("style") || "block";
  const color = url.searchParams.get("color") || "#000000";
  const format = url.searchParams.get("format") || "image";
  const productId = url.searchParams.get("product_id") || "";
  const variantId = url.searchParams.get("variant_id") || "";
  const shop = url.searchParams.get("shop") || "";
  const colorName = url.searchParams.get("color_name") || "";
  const handle = url.searchParams.get("handle") || "";
  const sizeParam = url.searchParams.get("size") || "full";

  const previewSize = sizeParam === "thumb" ? PREVIEW_SIZE_THUMB : PREVIEW_SIZE_FULL;

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

  // ─── Check preview cache first ───
  const cacheKey = buildCacheKey(text, style, color, handle || productId, colorName, previewSize);
  const cachedPreview = previewCache.get(cacheKey);
  if (cachedPreview && format === "image") {
    return new Response(cachedPreview.buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "X-Cache": "HIT",
      },
    });
  }

  // ─── Resolve the product template and mockup image URL ───
  let baseImageUrl: string | null = null;
  let printArea = { x: 25, y: 15, width: 50, height: 35 };
  let technique = "dtg"; // default; overridden when template is found

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
        // Capture technique for embroidery rendering decision
        technique = template.technique || "dtg";

        const productBase = getProductBase(template.productBaseSlug);

        // Check DB-managed product base for authoritative print area + mockup
        const dbProductBase = await db.productBaseDef.findFirst({
          where: { slug: template.productBaseSlug, isActive: true },
          include: { variants: { where: { isEnabled: true } } },
        });

        // DB product base print area is authoritative (from Mockup Manager)
        if (dbProductBase) {
          printArea = {
            x: dbProductBase.defaultPrintAreaX,
            y: dbProductBase.defaultPrintAreaY,
            width: dbProductBase.defaultPrintAreaWidth,
            height: dbProductBase.defaultPrintAreaHeight,
          };
        } else {
          printArea = {
            x: template.printAreaX,
            y: template.printAreaY,
            width: template.printAreaWidth,
            height: template.printAreaHeight,
          };
        }

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
            const isExactColorMatch = colorName &&
              matchedImage.variantColor.toLowerCase() === colorName.toLowerCase();

            if (isExactColorMatch || !colorName) {
              baseImageUrl = matchedImage.imageUrl;
            } else {
              if (productBase?.variantMockups) {
                const registryUrl =
                  productBase.variantMockups[colorName] ||
                  Object.entries(productBase.variantMockups).find(
                    ([k]) => k.toLowerCase() === colorName.toLowerCase(),
                  )?.[1];
                if (registryUrl) {
                  baseImageUrl = registryUrl;
                }
              }
              if (!baseImageUrl) {
                baseImageUrl = matchedImage.imageUrl;
              }
            }
          }
        }

        // STEP 2: DB product base variant mockups
        if (!baseImageUrl && colorName && dbProductBase?.variants) {
          const dbVariant = dbProductBase.variants.find(
            (v) => v.color.toLowerCase() === colorName.toLowerCase()
          );
          if (dbVariant?.mockupImageUrl) {
            baseImageUrl = dbVariant.mockupImageUrl;
          }
        }

        // STEP 3: Registry variantMockups
        if (!baseImageUrl && colorName && productBase?.variantMockups) {
          const registryUrl =
            productBase.variantMockups[colorName] ||
            Object.entries(productBase.variantMockups).find(
              ([k]) => k.toLowerCase() === colorName.toLowerCase(),
            )?.[1];
          if (registryUrl) {
            baseImageUrl = registryUrl;
          }
        }

        // STEP 4: DB product base default mockup
        if (!baseImageUrl && dbProductBase?.defaultMockupUrl) {
          baseImageUrl = dbProductBase.defaultMockupUrl;
        }

        // STEP 5: Registry default
        if (!baseImageUrl && productBase?.defaultMockupUrl) {
          baseImageUrl = productBase.defaultMockupUrl;
        }
      }
    } catch (error) {
      console.error("[Preview] Error loading template:", error);
    }
  }

  // ─── Generate the preview image with sharp ───
  const sharpFn = await getSharp();
  let outputBuffer: Buffer;

  // Determine if this is an embroidery product
  const isEmbroidery = technique === "embroidery";

  try {
    if (baseImageUrl) {
      // Fetch mockup (cached) and get metadata
      const { resized: resizedBase, srcW, srcH } = await getCachedMockup(sharpFn, baseImageUrl, previewSize);

      // Calculate print area in pixel coordinates
      const scale = Math.min(previewSize / srcW, previewSize / srcH);
      const scaledW = srcW * scale;
      const scaledH = srcH * scale;
      const offsetX = (previewSize - scaledW) / 2;
      const offsetY = (previewSize - scaledH) / 2;

      const paX = offsetX + scaledW * (printArea.x / 100);
      const paY = offsetY + scaledH * (printArea.y / 100);
      const paW = scaledW * (printArea.width / 100);
      const paH = scaledH * (printArea.height / 100);

      let overlayBuffer: Buffer;

      if (isEmbroidery) {
        // ── Embroidery path: send design through Dynamic Mockups API ──
        overlayBuffer = await buildEmbroideryOverlay(
          sharpFn, text, style, color, paX, paY, paW, paH, previewSize,
        );
      } else {
        // ── Standard path: flat SVG text overlay ──
        const textSvg = buildTextSvg(text, style, color, paX, paY, paW, paH, previewSize);
        overlayBuffer = Buffer.from(textSvg);
      }

      // Composite overlay onto the mockup and output as JPEG for speed
      outputBuffer = await sharpFn(resizedBase)
        .composite([{ input: overlayBuffer, top: 0, left: 0 }])
        .jpeg({ quality: 80 })
        .toBuffer();
    } else {
      // No mockup available — render silhouette + text/embroidery
      const silhouetteSvg = buildSilhouetteSvg(previewSize);
      const silhouetteBuffer = await sharpFn(Buffer.from(silhouetteSvg))
        .png()
        .toBuffer();

      const paX = previewSize * 0.1;
      const paY = previewSize * 0.15;
      const paW = previewSize * 0.8;
      const paH = previewSize * 0.35;

      let overlayBuffer: Buffer;

      if (isEmbroidery) {
        overlayBuffer = await buildEmbroideryOverlay(
          sharpFn, text, style, color, paX, paY, paW, paH, previewSize,
        );
      } else {
        const textSvg = buildTextSvg(text, style, color, paX, paY, paW, paH, previewSize);
        overlayBuffer = Buffer.from(textSvg);
      }

      outputBuffer = await sharpFn(silhouetteBuffer)
        .composite([{ input: overlayBuffer, top: 0, left: 0 }])
        .jpeg({ quality: 80 })
        .toBuffer();
    }
  } catch (error) {
    console.error("[Preview] Image generation error:", error);

    const fallbackSvg = `<svg width="${previewSize}" height="${previewSize}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${previewSize}" height="${previewSize}" fill="#f5f5f5"/>
      <text x="${previewSize / 2}" y="${previewSize / 2}" font-family="sans-serif" font-size="60" font-weight="bold"
            fill="${svgEscape(color)}" text-anchor="middle" dominant-baseline="central">${svgEscape(text)}</text>
    </svg>`;
    outputBuffer = await sharpFn(Buffer.from(fallbackSvg)).jpeg({ quality: 80 }).toBuffer();
  }

  // ─── Store in cache ───
  previewCache.set(cacheKey, { buffer: outputBuffer, timestamp: Date.now() });
  evictOldest(previewCache, CACHE_MAX_ENTRIES);

  // ─── Return response ───
  if (format === "json") {
    const params = new URLSearchParams({ text, style, color, format: "image" });
    if (productId) params.set("product_id", productId);
    if (variantId) params.set("variant_id", variantId);
    if (handle) params.set("handle", handle);
    if (colorName) params.set("color_name", colorName);
    if (sizeParam) params.set("size", sizeParam);

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

  return new Response(outputBuffer as any, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Cache": "MISS",
    },
  });
};
