/**
 * Dynamic Mockups – Embroidery Effect API
 *
 * Endpoint : POST https://app.dynamicmockups.com/api/v1/tools/embroidery
 * Auth     : x-api-key header  (env: DYNAMIC_MOCKUPS_API_KEY)
 * Cost     : 6 credits per successful request
 *
 * Usage:
 *   const embroideryUrl = await applyEmbroideryEffect({ imageUrl: "https://…/design.png" });
 *   // or
 *   const embroideryUrl = await applyEmbroideryEffect({ imageBase64: "<base64 string>" });
 *
 * The returned URL is a temporary S3 link — download / cache it immediately.
 */

const DM_API_BASE = "https://app.dynamicmockups.com/api/v1";
const DM_EMBROIDERY_ENDPOINT = `${DM_API_BASE}/tools/embroidery`;

// ─── In-memory cache ─────────────────────────────────────────────────────────
// Key: sha-256-like hash of the input (we use a simple string key for speed)
// Value: { url: string; fetchedAt: number }
// The export_path URLs from Dynamic Mockups are temporary S3 links, so we
// cache them for a short window (30 minutes) to avoid redundant API calls
// within a single server session.

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 500;

interface CacheEntry {
  url: string;
  fetchedAt: number;
}

const embroideryCache = new Map<string, CacheEntry>();

function evictStale() {
  const now = Date.now();
  for (const [key, entry] of embroideryCache) {
    if (now - entry.fetchedAt > CACHE_TTL_MS) {
      embroideryCache.delete(key);
    }
  }
  // Also cap size
  if (embroideryCache.size > MAX_CACHE_ENTRIES) {
    const excess = embroideryCache.size - MAX_CACHE_ENTRIES;
    let count = 0;
    for (const key of embroideryCache.keys()) {
      if (count >= excess) break;
      embroideryCache.delete(key);
      count++;
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmbroideryInput {
  /** Public URL of the design image (PNG / JPG / WEBP). */
  imageUrl?: string;
  /** Base64-encoded image data (no data: prefix needed). */
  imageBase64?: string;
}

export interface EmbroideryResult {
  /** URL of the embroidery-rendered image (temporary S3 link). */
  url: string;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Sends a design image to the Dynamic Mockups Embroidery Effect API and
 * returns the URL of the stitched output image.
 *
 * Throws on API errors (non-2xx responses or missing export_path).
 */
export async function applyEmbroideryEffect(
  input: EmbroideryInput,
): Promise<EmbroideryResult> {
  if (!input.imageUrl && !input.imageBase64) {
    throw new Error("[DynamicMockups] Either imageUrl or imageBase64 must be provided.");
  }

  const apiKey = process.env.DYNAMIC_MOCKUPS_API_KEY;
  if (!apiKey) {
    throw new Error("[DynamicMockups] DYNAMIC_MOCKUPS_API_KEY environment variable is not set.");
  }

  // Build a stable cache key
  const cacheKey = input.imageUrl
    ? `url:${input.imageUrl}`
    : `b64:${input.imageBase64!.slice(0, 64)}`; // first 64 chars is enough for uniqueness

  // Check cache
  evictStale();
  const cached = embroideryCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    console.log("[DynamicMockups] Cache HIT for embroidery effect:", cacheKey.slice(0, 60));
    return { url: cached.url };
  }

  // Build request body
  const body: Record<string, string> = {};
  if (input.imageUrl) {
    body.image_url = input.imageUrl;
  } else {
    body.image_data_b64 = input.imageBase64!;
  }

  console.log("[DynamicMockups] Calling embroidery API for:", cacheKey.slice(0, 60));

  const response = await fetch(DM_EMBROIDERY_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "(no body)");
    throw new Error(
      `[DynamicMockups] Embroidery API error ${response.status}: ${errorText}`,
    );
  }

  const json = await response.json() as {
    success?: boolean;
    message?: string;
    data?: { export_path?: string };
  };

  if (!json.success || !json.data?.export_path) {
    throw new Error(
      `[DynamicMockups] Unexpected response: ${JSON.stringify(json)}`,
    );
  }

  const exportUrl = json.data.export_path;

  // Store in cache
  embroideryCache.set(cacheKey, { url: exportUrl, fetchedAt: Date.now() });

  console.log("[DynamicMockups] Embroidery effect generated:", exportUrl);
  return { url: exportUrl };
}
