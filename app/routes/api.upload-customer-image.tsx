import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import crypto from "crypto";

/**
 * POST /api/upload-customer-image
 *
 * Accepts a customer-uploaded image (base64 dataURL) from the storefront,
 * stores it in PostgreSQL (PrintFile table), and returns a public URL
 * that can be saved as a Shopify line item property.
 *
 * This is needed because customer-uploaded images (e.g., for tote bag
 * personalization) are too large to fit in Shopify line item properties
 * directly. Instead, the storefront uploads the image here first, then
 * stores the returned URL as a compact line item property.
 *
 * Request body (JSON):
 *   { "image": "data:image/png;base64,iVBOR..." }
 *
 * Response (JSON):
 *   { "success": true, "url": "https://app.../api/print-files/cust-abc123", "fileId": "cust-abc123" }
 */

// Max image size: 15MB of base64 data (roughly 11MB raw image)
const MAX_BASE64_LENGTH = 15 * 1024 * 1024;

export const action = async ({ request }: ActionFunctionArgs) => {
  // CORS headers for storefront cross-origin requests
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const imageDataUrl = body.image;

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing 'image' field (base64 dataURL)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate it's a data URL
    const dataUrlMatch = imageDataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
    if (!dataUrlMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid image format. Must be a base64 data URL (PNG, JPEG, or WebP)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mimeType = dataUrlMatch[1]; // e.g., "image/png"
    const base64Data = dataUrlMatch[3];

    // Check size
    if (base64Data.length > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ success: false, error: "Image too large. Maximum size is ~11MB" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a unique filename
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const filename = `cust-${uniqueId}.${ext}`;

    console.log(`[upload-customer-image] Storing customer image: ${filename} (${mimeType}, ${Math.round(base64Data.length / 1024)}KB base64)`);

    // Store in the PrintFile table (same model used for generated print files)
    await db.printFile.create({
      data: {
        filename,
        mimeType,
        data: base64Data,
        orderId: null, // Will be linked to an order later when the order is placed
      },
    });

    // Build the public URL using the existing print-files serving route
    const appUrl = process.env.SHOPIFY_APP_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
      || "https://printful-custom-production.up.railway.app";

    const publicUrl = `${appUrl}/api/print-files/${filename}`;

    console.log(`[upload-customer-image] ✓ Stored as ${filename}, URL: ${publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        fileId: filename,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error(`[upload-customer-image] Error:`, error.message);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
};

// Also handle OPTIONS for CORS preflight via loader
export const loader = async ({ request }: { request: Request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  return new Response(
    JSON.stringify({ error: "Use POST to upload images" }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
};
