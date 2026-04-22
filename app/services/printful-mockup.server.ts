/**
 * Printful Mockup Generator Service
 *
 * Generates realistic product mockups by submitting a design image to the
 * Printful Mockup Generator API and polling until the render is complete.
 *
 * API flow:
 *   1. POST /mockup-generator/create-task/{productId}  → returns task_key
 *   2. GET  /mockup-generator/task?task_key={key}      → poll until "completed"
 *   3. Extract mockup_url from the result
 *
 * Weekender Bag reference data (product 890):
 *   - Variant ID : 22814  (White / 24"×13")
 *   - Placement  : "front"
 *   - Print area : 3825 × 4950 px @ 150 dpi
 *   - Store ID   : 12289675  (Polychrome Goods Shopify store)
 *
 * Auth: Bearer token (PRINTFUL_TOKEN) + X-PF-Store-Id header (PRINTFUL_STORE_ID)
 */

const PRINTFUL_API = "https://api.printful.com";
const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID || "12289675";

// ─── In-memory mockup cache ───────────────────────────────────────────────────
// Keyed by a hash of (productId + variantId + designUrl).
// Mockup URLs from Printful are temporary S3 links; cache for 20 minutes.

const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_CACHE = 200;

interface MockupCacheEntry {
  url: string;
  fetchedAt: number;
}

const mockupCache = new Map<string, MockupCacheEntry>();

function evictStale() {
  const now = Date.now();
  for (const [key, entry] of mockupCache) {
    if (now - entry.fetchedAt > CACHE_TTL_MS) mockupCache.delete(key);
  }
  if (mockupCache.size > MAX_CACHE) {
    let excess = mockupCache.size - MAX_CACHE;
    for (const key of mockupCache.keys()) {
      if (excess-- <= 0) break;
      mockupCache.delete(key);
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrintfulMockupRequest {
  /** Printful catalog product ID (e.g. 890 for Weekender Bag) */
  productId: number;
  /** Printful variant ID (e.g. 22814 for White / 24"×13") */
  variantId: number;
  /** Placement key (e.g. "front") */
  placement: string;
  /** Publicly accessible URL of the design/print file PNG */
  designUrl: string;
  /**
   * Print area dimensions in pixels (from /mockup-generator/printfiles/{productId}).
   * The design will be stretched to fill the full print area.
   */
  printAreaWidth: number;
  printAreaHeight: number;
  /** Output image width in pixels (default 1000) */
  outputWidth?: number;
}

export interface PrintfulMockupResult {
  /** URL of the generated mockup image (temporary S3 link) */
  mockupUrl: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function printfulRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const resp = await fetch(`${PRINTFUL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PRINTFUL_TOKEN}`,
      "X-PF-Store-Id": PRINTFUL_STORE_ID,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await resp.json()) as { code: number; result: T; error?: { message: string } };

  if (!resp.ok || json.code >= 400) {
    throw new Error(
      `[PrintfulMockup] API ${method} ${path} failed ${json.code}: ${json.error?.message ?? JSON.stringify(json)}`,
    );
  }

  return json.result;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Generate a Printful product mockup by passing a design image URL.
 *
 * The design is placed to fill the entire print area of the product.
 * Returns the URL of the rendered mockup image.
 *
 * Throws if the task fails or times out after ~60 seconds.
 */
export async function generatePrintfulMockup(
  req: PrintfulMockupRequest,
): Promise<PrintfulMockupResult> {
  if (!PRINTFUL_TOKEN) {
    throw new Error("[PrintfulMockup] PRINTFUL_TOKEN environment variable is not set.");
  }

  const cacheKey = `${req.productId}:${req.variantId}:${req.placement}:${req.designUrl}`;
  evictStale();

  const cached = mockupCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log("[PrintfulMockup] Cache HIT:", cacheKey.slice(0, 80));
    return { mockupUrl: cached.url };
  }

  console.log("[PrintfulMockup] Submitting mockup task for product", req.productId, "variant", req.variantId);

  // Step 1: Create the task
  const taskResult = await printfulRequest<{ task_key: string; status: string }>(
    "POST",
    `/mockup-generator/create-task/${req.productId}`,
    {
      variant_ids: [req.variantId],
      format: "jpg",
      width: req.outputWidth ?? 1000,
      files: [
        {
          placement: req.placement,
          image_url: req.designUrl,
          position: {
            area_width: req.printAreaWidth,
            area_height: req.printAreaHeight,
            width: req.printAreaWidth,
            height: req.printAreaHeight,
            top: 0,
            left: 0,
          },
        },
      ],
    },
  );

  const taskKey = taskResult.task_key;
  console.log("[PrintfulMockup] Task created:", taskKey);

  // Step 2: Poll until completed (up to ~60 seconds, 15 attempts × 4s)
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((r) => setTimeout(r, 4000));

    const pollResult = await printfulRequest<{
      task_key: string;
      status: string;
      error?: string;
      mockups?: Array<{ variant_ids: number[]; mockup_url: string }>;
    }>("GET", `/mockup-generator/task?task_key=${taskKey}`);

    console.log(`[PrintfulMockup] Poll [${attempt + 1}] status=${pollResult.status}`);

    if (pollResult.status === "completed") {
      const mockup = pollResult.mockups?.[0];
      if (!mockup?.mockup_url) {
        throw new Error("[PrintfulMockup] Task completed but no mockup URL in response.");
      }

      const mockupUrl = mockup.mockup_url;
      mockupCache.set(cacheKey, { url: mockupUrl, fetchedAt: Date.now() });
      console.log("[PrintfulMockup] Mockup ready:", mockupUrl);
      return { mockupUrl };
    }

    if (pollResult.status === "failed") {
      throw new Error(`[PrintfulMockup] Task ${taskKey} failed: ${pollResult.error ?? "unknown error"}`);
    }
  }

  throw new Error(`[PrintfulMockup] Task ${taskKey} timed out after 60 seconds.`);
}

// ─── Weekender Bag Preset ─────────────────────────────────────────────────────

/**
 * Convenience wrapper specifically for the Weekender Bag (product 890).
 * Pass the URL of the personalized design PNG and get back a mockup URL.
 */
export async function generateWeekenderMockup(
  designUrl: string,
): Promise<PrintfulMockupResult> {
  return generatePrintfulMockup({
    productId: 890,
    variantId: 22814,
    placement: "front",
    designUrl,
    printAreaWidth: 3825,
    printAreaHeight: 4950,
    outputWidth: 1000,
  });
}
