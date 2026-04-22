/**
 * GET /api/printful-mockup
 *
 * Generates a photorealistic Printful product mockup by:
 *   1. Rendering the personalizer text/design to a high-res PNG
 *   2. Uploading it to Shopify CDN (so Printful can fetch it)
 *   3. Submitting it to the Printful Mockup Generator API
 *   4. Polling until the render is complete
 *   5. Returning the mockup URL as JSON
 *
 * This is a slow endpoint (~8-15 seconds) and should only be called once
 * when the customer confirms their design — NOT on every keystroke.
 *
 * Query params:
 *   text         - The personalisation text (required)
 *   style        - Font style key: script | block | serif | sans (default: block)
 *   color        - Hex color e.g. %23000000 (default: #000000)
 *   product_id   - Shopify product GID or numeric ID (used to resolve template)
 *   handle       - Shopify product handle (fallback if no product_id)
 *   shop         - Shopify shop domain (optional, for scoped lookup)
 *
 * Response (JSON):
 *   { url: "https://...", source: "printful-mockup-generator" }
 *
 * On error falls back to:
 *   { url: null, error: "...", source: "fallback" }
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import fs from "fs";
import os from "os";
import path from "path";
import db from "../db.server";
import { getSharp } from "../fonts/setup-fonts";
import { generatePrintfulMockup } from "../services/printful-mockup.server";

// ─── Font map (must match api.preview.tsx) ────────────────────────────────────
const SVG_FONT_MAP: Record<string, string> = {
  script: "Great Vibes",
  block: "Oswald",
  serif: "Playfair Display",
  sans: "Montserrat",
  monogram_classic: "Cormorant Garamond",
};

function svgEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const url = new URL(request.url);
  const text = (url.searchParams.get("text") || "").slice(0, 1000);
  const style = url.searchParams.get("style") || "block";
  const color = url.searchParams.get("color") || "#000000";
  const productId = url.searchParams.get("product_id") || "";
  const handle = url.searchParams.get("handle") || "";
  const shop = url.searchParams.get("shop") || "";

  if (!text) {
    return new Response(
      JSON.stringify({ error: "Missing text parameter", source: "validation" }),
      { status: 400, headers: corsHeaders },
    );
  }

  // ─── Step 1: Resolve the product template → DB product base ──────────────
  let dbProductBase: Awaited<ReturnType<typeof db.productBaseDef.findFirst>> | null = null;

  try {
    const numericProductId = productId
      ? productId.startsWith("gid://")
        ? productId.split("/").pop()!
        : productId
      : "";
    const gidProductId = numericProductId
      ? `gid://shopify/Product/${numericProductId}`
      : "";

    const template =
      (gidProductId
        ? await db.productTemplate.findFirst({
            where: { shopifyProductId: gidProductId, isActive: true, ...(shop ? { shop } : {}) },
          })
        : null) ||
      (gidProductId
        ? await db.productTemplate.findFirst({
            where: { shopifyProductId: gidProductId, isActive: true },
          })
        : null) ||
      (numericProductId
        ? await db.productTemplate.findFirst({
            where: { shopifyProductId: { contains: numericProductId }, isActive: true },
          })
        : null) ||
      (handle
        ? await db.productTemplate.findFirst({
            where: { productHandle: handle, isActive: true },
          })
        : null);

    if (template) {
      dbProductBase = await db.productBaseDef.findFirst({
        where: { slug: template.productBaseSlug, isActive: true },
      });
    }
  } catch (err) {
    console.error("[PrintfulMockup] Template lookup failed:", err);
  }

  // Verify this is a Printful product
  if (
    !dbProductBase ||
    dbProductBase.fulfillmentProvider !== "printful" ||
    !dbProductBase.printfulProductId ||
    dbProductBase.printfulProductId === 0
  ) {
    return new Response(
      JSON.stringify({
        url: null,
        error: "Product is not a Printful product or has no printfulProductId",
        source: "fallback",
      }),
      { status: 200, headers: corsHeaders },
    );
  }

  const printfulProductId = dbProductBase.printfulProductId;
  const pfW = dbProductBase.printFileWidth || 3825;
  const pfH = dbProductBase.printFileHeight || 4950;

  // ─── Step 2: Resolve the variant ID ──────────────────────────────────────
  // For the weekender bag (890) there is only one variant: 22814
  // For future products, we'd look up the variant from ProductBaseVariant
  let printfulVariantId = 22814; // weekender bag default

  try {
    const variant = await db.productBaseVariant.findFirst({
      where: { productBaseId: dbProductBase.id, isEnabled: true },
      orderBy: { id: "asc" },
    });
    if (variant?.printfulVariantId) {
      printfulVariantId = variant.printfulVariantId;
    }
  } catch (_) {
    // Use default
  }

  // ─── Step 3: Render the design to a high-res PNG ─────────────────────────
  let designUrl: string;

  try {
    const sharpFn = await getSharp();
    const fontFamily = SVG_FONT_MAP[style] || "Montserrat";
    const isScript = style === "script";
    const centerX = pfW / 2;
    const centerY = pfH / 2;
    const fontSize = Math.min(pfW * 0.4, pfH * 0.15);

    // Build SVG at print-file resolution
    const designSvg = `<svg width="${pfW}" height="${pfH}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${centerX}"
        y="${centerY}"
        font-family="${fontFamily}"
        font-size="${fontSize}"
        font-weight="${isScript ? "normal" : "bold"}"
        fill="${svgEscape(color)}"
        text-anchor="middle"
        dominant-baseline="central"
      >${svgEscape(text)}</text>
    </svg>`;

    const designPngBuffer = await sharpFn(Buffer.from(designSvg)).png().toBuffer();

    // Write to a temp file for uploadToShopifyCDN (which expects a file path)
    const tmpFile = path.join(os.tmpdir(), `pf-design-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, designPngBuffer);

    // Upload to Shopify CDN
    // We need the shop domain for the session lookup — get it from the DB product base
    const shopDomain = dbProductBase.shop;
    const { uploadToShopifyCDN } = await import("../services/printful.server");
    designUrl = await uploadToShopifyCDN(tmpFile, shopDomain, `pf-design-${Date.now()}.png`);

    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  } catch (err) {
    console.error("[PrintfulMockup] Design render/upload failed:", err);
    return new Response(
      JSON.stringify({ url: null, error: "Design render failed", source: "fallback" }),
      { status: 200, headers: corsHeaders },
    );
  }

  // ─── Step 4: Call Printful Mockup Generator ───────────────────────────────
  try {
    const { mockupUrl } = await generatePrintfulMockup({
      productId: printfulProductId,
      variantId: printfulVariantId,
      placement: "front",
      designUrl,
      printAreaWidth: pfW,
      printAreaHeight: pfH,
      outputWidth: 1000,
    });

    return new Response(
      JSON.stringify({ url: mockupUrl, source: "printful-mockup-generator" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    console.error("[PrintfulMockup] Mockup generation failed:", err);
    return new Response(
      JSON.stringify({ url: null, error: String(err), source: "fallback" }),
      { status: 200, headers: corsHeaders },
    );
  }
};
