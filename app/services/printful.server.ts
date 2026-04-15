import fs from "fs";
import path from "path";
import db from "../db.server";
import {
  generateMonogram,
  generatePrintFileAsync,
  type LayerInput,
} from "./monogram.server";
import {
  getProductBase,
  EMBROIDERY_THREAD_COLORS,
  type ProductBase,
} from "../config/product-bases";

const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_API = "https://api.printful.com";
const API_VERSION = "2025-01";

// ─── Printful API Helpers ───────────────────────────────────────────────────

async function printfulRequest(
  endpoint: string,
  method: string = "GET",
  body?: any
) {
  const url = `${PRINTFUL_API}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${PRINTFUL_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`[printful] ${method} ${endpoint}`);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(
      `[printful] API error ${response.status}:`,
      JSON.stringify(data)
    );
    throw new Error(`Printful ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

// ─── Shopify CDN File Upload ────────────────────────────────────────────────

/**
 * Upload a print file to Shopify's CDN using the Admin GraphQL API.
 * This gives us a cdn.shopify.com URL that Printful will accept.
 *
 * Uses the same 3-step pattern as the mockup upload:
 * 1. stagedUploadsCreate → get upload target URL
 * 2. POST file to staged target
 * 3. fileCreate → get CDN URL
 *
 * Falls back to storing in our DB and serving from our app URL.
 */
async function uploadToShopifyCDN(
  localPath: string,
  shop: string,
  filename: string
): Promise<string> {
  console.log(`[printful] Uploading print file to Shopify CDN for ${shop}...`);

  // Get the offline session for this shop
  const session = await db.session.findFirst({
    where: { shop, isOnline: false },
  });

  if (!session) {
    console.error(`[printful] No offline session found for shop ${shop}`);
    throw new Error(`No offline session for ${shop}`);
  }

  const accessToken = session.accessToken;
  const graphqlUrl = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;

  // Read the file
  const fileBuffer = fs.readFileSync(localPath);
  const fileSize = String(fileBuffer.length);
  const mimeType = "image/png";

  console.log(`[printful] File: ${filename}, size: ${fileSize} bytes`);

  // Step 1: Create staged upload target
  const stagedQuery = JSON.stringify({
    query: `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    variables: {
      input: [{
        filename,
        fileSize,
        mimeType,
        resource: "FILE",
        httpMethod: "POST",
      }],
    },
  });

  console.log(`[printful] Step 1: Creating staged upload target...`);

  const stagedRes = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: stagedQuery,
  });

  if (!stagedRes.ok) {
    const errText = await stagedRes.text();
    throw new Error(`Staged upload failed (${stagedRes.status}): ${errText}`);
  }

  const stagedData = await stagedRes.json();
  const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];

  if (!target) {
    const errors = stagedData.data?.stagedUploadsCreate?.userErrors;
    throw new Error(`Staged upload failed: ${JSON.stringify(errors)}`);
  }

  console.log(`[printful] Step 1 done. Upload URL: ${target.url}`);
  console.log(`[printful] Resource URL: ${target.resourceUrl}`);

  // Step 2: Upload the file to the staged target
  console.log(`[printful] Step 2: Uploading file to staged target...`);

  // Build multipart form data manually using the Web API FormData
  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }

  // Convert buffer to Blob
  const blob = new Blob([fileBuffer], { type: mimeType });
  uploadForm.append("file", blob, filename);

  const uploadRes = await fetch(target.url, {
    method: "POST",
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`File upload to staged target failed (${uploadRes.status}): ${errText}`);
  }

  console.log(`[printful] Step 2 done. File uploaded to staged target.`);

  // Step 3: Create the file in Shopify using the resourceUrl
  console.log(`[printful] Step 3: Creating file in Shopify...`);

  const fileCreateQuery = JSON.stringify({
    query: `mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          ... on MediaImage {
            image {
              url
            }
          }
          ... on GenericFile {
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    variables: {
      files: [{
        alt: `Print file - ${filename}`,
        contentType: "IMAGE",
        originalSource: target.resourceUrl,
      }],
    },
  });

  const fileCreateRes = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: fileCreateQuery,
  });

  if (!fileCreateRes.ok) {
    const errText = await fileCreateRes.text();
    throw new Error(`File create failed (${fileCreateRes.status}): ${errText}`);
  }

  const fileData = await fileCreateRes.json();
  const createdFile = fileData.data?.fileCreate?.files?.[0];
  const fileErrors = fileData.data?.fileCreate?.userErrors;

  if (fileErrors && fileErrors.length > 0) {
    throw new Error(`File create errors: ${JSON.stringify(fileErrors)}`);
  }

  // The image URL may not be immediately available (Shopify processes it async)
  // Use the resourceUrl as a fallback — it's still a valid Shopify CDN URL
  const cdnUrl = createdFile?.image?.url || createdFile?.url || target.resourceUrl;

  console.log(`[printful] Step 3 done. CDN URL: ${cdnUrl}`);

  return cdnUrl;
}

/**
 * Also store the file in our database as a backup.
 */
async function savePrintFileToDb(
  localPath: string,
  orderId?: string
): Promise<string> {
  const ext = path.extname(localPath) || ".png";
  const uniqueFilename = `pf-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  const fileBuffer = fs.readFileSync(localPath);
  const base64Data = fileBuffer.toString("base64");

  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".pdf": "application/pdf",
  };
  const mimeType = mimeTypes[ext.toLowerCase()] || "image/png";

  await db.printFile.create({
    data: {
      filename: uniqueFilename,
      mimeType,
      data: base64Data,
      orderId: orderId || null,
    },
  });

  console.log(`[printful] Print file also saved to DB: ${uniqueFilename} (${fileBuffer.length} bytes)`);
  return uniqueFilename;
}

// ─── Thread Color Helpers ───────────────────────────────────────────────────

const ALLOWED_THREAD_COLORS = EMBROIDERY_THREAD_COLORS.map((tc) => tc.hex);

function normalizeThreadColor(color: string): string {
  const upper = color.toUpperCase();
  if ((ALLOWED_THREAD_COLORS as string[]).includes(upper)) {
    return upper;
  }
  console.log(
    `[printful] Thread color ${color} not in allowed list, defaulting to #000000`
  );
  return "#000000";
}

// ─── Variant Resolution ─────────────────────────────────────────────────────

async function resolvePrintfulVariantId(
  base: ProductBase,
  shopifyVariantId: string,
  shopifyOrder: any
): Promise<number> {
  let variantColor = "";
  let variantSize = "";

  for (const lineItem of shopifyOrder.line_items || []) {
    if (String(lineItem.variant_id) === shopifyVariantId) {
      const parts = (lineItem.variant_title || "")
        .split("/")
        .map((s: string) => s.trim());
      if (parts.length >= 1) variantColor = parts[0];
      if (parts.length >= 2) variantSize = parts[1];

      if (!variantColor && lineItem.variant_options) {
        variantColor = lineItem.variant_options[0] || "";
      }
      break;
    }
  }

  console.log(
    `[printful] Resolving variant: color="${variantColor}", size="${variantSize}"`
  );

  if (base.category === "hat") {
    const match = base.variants.find(
      (v) => v.color.toLowerCase() === variantColor.toLowerCase()
    );
    if (match) {
      console.log(
        `[printful] Matched hat variant: ${match.color} → ${match.printfulVariantId}`
      );
      return match.printfulVariantId;
    }
    console.log(
      `[printful] No color match for hat, using default variant ${base.variants[0].printfulVariantId}`
    );
    return base.variants[0].printfulVariantId;
  }

  if (base.category === "shirt") {
    try {
      const catalogResult = await printfulRequest(
        `/products/${base.printfulProductId}`
      );
      const variants = catalogResult.result.variants || [];

      const match = variants.find(
        (v: any) =>
          v.color?.toLowerCase() === variantColor.toLowerCase() &&
          v.size?.toLowerCase() === variantSize.toLowerCase()
      );

      if (match) {
        console.log(
          `[printful] Matched shirt variant: ${match.color} ${match.size} → ${match.id}`
        );
        return match.id;
      }

      const colorMatch = variants.find(
        (v: any) => v.color?.toLowerCase() === variantColor.toLowerCase()
      );
      if (colorMatch) {
        console.log(
          `[printful] Color-only match for shirt: ${colorMatch.color} ${colorMatch.size} → ${colorMatch.id}`
        );
        return colorMatch.id;
      }
    } catch (err) {
      console.error("[printful] Error looking up catalog variants:", err);
    }

    const registryMatch = base.variants.find(
      (v) => v.color.toLowerCase() === variantColor.toLowerCase()
    );
    if (registryMatch) {
      return registryMatch.printfulVariantId;
    }
  }

  console.log(
    `[printful] No variant match found, using first variant: ${base.variants[0].printfulVariantId}`
  );
  return base.variants[0].printfulVariantId;
}

// ─── Placement Key Mapping ──────────────────────────────────────────────────

function getPlacementConfig(placementKey: string): {
  fileType: string;
  threadColorsOptionId: string | null;
} {
  const mapping: Record<
    string,
    { fileType: string; threadColorsOptionId: string | null }
  > = {
    embroidery_front: {
      fileType: "embroidery_front",
      threadColorsOptionId: "thread_colors",
    },
    embroidery_front_large: {
      fileType: "embroidery_front_large",
      threadColorsOptionId: "thread_colors",
    },
    embroidery_chest_left: {
      fileType: "embroidery_chest_left",
      threadColorsOptionId: "thread_colors_chest_left",
    },
    embroidery_chest_center: {
      fileType: "embroidery_chest_center",
      threadColorsOptionId: "thread_colors_chest_center",
    },
    embroidery_large_front: {
      fileType: "embroidery_large_front",
      threadColorsOptionId: "thread_colors_large_front",
    },
    front: { fileType: "front", threadColorsOptionId: null },
    front_dtf: { fileType: "front", threadColorsOptionId: null },
  };

  return (
    mapping[placementKey] || {
      fileType: placementKey,
      threadColorsOptionId: null,
    }
  );
}

// ─── Main Processing Pipeline ───────────────────────────────────────────────

/**
 * Process a personalized order end-to-end.
 *
 * Flow:
 * 1. Generate the custom print file (PNG) based on personalization data
 * 2. Upload to Shopify CDN (cdn.shopify.com URL that Printful accepts)
 * 3. Upload to Printful File Library for reliable access
 * 4. Resolve the correct Printful variant ID
 * 5. Create a draft order in Printful with the custom print file
 */
export async function processPersonalizedOrder(
  recordId: string,
  shopifyOrder: any
) {
  console.log(`[printful] ═══════════════════════════════════════════════`);
  console.log(`[printful] Processing personalization order ${recordId}...`);

  try {
    // 1. Load the record
    const record = await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "generating" },
    });

    console.log(`[printful] Order: ${record.shopifyOrderName}`);
    console.log(`[printful] Shop: ${record.shop}`);
    console.log(`[printful] Product base: ${record.productBaseSlug || "legacy"}`);
    console.log(`[printful] Technique: ${record.technique || "embroidery"}`);
    console.log(`[printful] Monogram: "${record.monogramText}" (${record.monogramStyle})`);

    // 2. Determine if this is a template-based or legacy order
    const isTemplateBased = !!record.productBaseSlug && !!record.technique;

    let printFilePath: string;
    let base: ProductBase | undefined;
    let technique: string;
    let placementKey: string;
    let threadColor: string;

    if (isTemplateBased) {
      base = getProductBase(record.productBaseSlug!);
      technique = record.technique!;
      placementKey = record.placementKey || "embroidery_front";

      let persData: { layers?: any[] } = {};
      try {
        persData = JSON.parse(record.personalizationData || "{}");
      } catch {
        console.error("[printful] Failed to parse personalizationData");
      }

      const layers: LayerInput[] = (persData.layers || []).map((l: any) => ({
        key: l.key || "text",
        type: l.type || "text",
        value: l.text || l.value || "",
        font: l.font || "block",
        color: l.color || "#000000",
        position: l.position || { x: 10, y: 10, width: 80, height: 80 },
      }));

      if (layers.length === 0 && record.monogramText) {
        layers.push({
          key: "monogram_text",
          type: "text",
          value: record.monogramText,
          font: record.monogramStyle || "block",
          color: record.threadColor || "#000000",
          position: { x: 10, y: 10, width: 80, height: 80 },
        });
      }

      threadColor = layers.find((l) => l.type === "text")?.color || "#000000";

      console.log(`[printful] Generating print file with ${layers.length} layers`);

      printFilePath = await generatePrintFileAsync({
        productBaseSlug: record.productBaseSlug!,
        technique,
        placementKey,
        layers,
      });
    } else {
      base = getProductBase("yupoong-6245cm");
      technique = "embroidery";
      placementKey = "embroidery_front";
      threadColor = record.threadColor || "#000000";

      console.log(`[printful] Legacy monogram: "${record.monogramText}" style=${record.monogramStyle} color=${threadColor}`);

      printFilePath = generateMonogram({
        text: record.monogramText || "ABC",
        style: (record.monogramStyle as "script" | "block") || "script",
        color: threadColor,
      });
    }

    console.log(`[printful] Print file generated: ${printFilePath}`);

    // 3. Upload print file to Shopify CDN
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "uploading" },
    });

    const orderFilename = `monogram-${record.shopifyOrderName.replace("#", "")}-${Date.now()}.png`;

    let printFileUrl: string;
    try {
      printFileUrl = await uploadToShopifyCDN(
        printFilePath,
        record.shop,
        orderFilename
      );
      console.log(`[printful] ✓ Uploaded to Shopify CDN: ${printFileUrl}`);
    } catch (cdnError: any) {
      console.error(`[printful] Shopify CDN upload failed: ${cdnError.message}`);
      console.log(`[printful] Falling back to DB storage...`);

      // Fallback: save to DB and use our app URL
      const APP_URL =
        process.env.SHOPIFY_APP_URL ||
        process.env.APP_URL ||
        "https://printful-custom-production.up.railway.app";
      const dbFilename = await savePrintFileToDb(printFilePath, recordId);
      printFileUrl = `${APP_URL}/api/print-files/${dbFilename}`;
    }

    // Also save to DB as backup
    await savePrintFileToDb(printFilePath, recordId);

    // 4. Upload to Printful File Library
    let printfulFileId: number | null = null;
    try {
      console.log(`[printful] Uploading to Printful File Library: ${printFileUrl}`);
      const fileResult = await printfulRequest("/files", "POST", {
        url: printFileUrl,
        filename: orderFilename,
        visible: false,
      });
      printfulFileId = fileResult.result?.id || null;
      if (printfulFileId) {
        console.log(`[printful] ✓ Printful file ID: ${printfulFileId} (status: ${fileResult.result?.status})`);
      }
    } catch (fileErr: any) {
      console.error(`[printful] Printful file library upload failed: ${fileErr.message}`);
    }

    // 5. Resolve the Printful variant ID
    let printfulVariantId: number;

    if (base) {
      printfulVariantId = await resolvePrintfulVariantId(
        base,
        record.shopifyVariantId,
        shopifyOrder
      );
    } else {
      printfulVariantId = 7853; // Default white Yupoong
    }

    console.log(`[printful] Resolved variant ID: ${printfulVariantId}`);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printFileUrl,
        printfulFileId: printfulFileId ? String(printfulFileId) : null,
        printfulVariantId,
        status: "submitting",
      },
    });

    // 6. Build the Printful order
    const shipping = shopifyOrder.shipping_address || {};
    const { fileType, threadColorsOptionId } =
      getPlacementConfig(placementKey);

    const normalizedColor = normalizeThreadColor(threadColor);

    console.log(`[printful] File type: ${fileType}`);
    console.log(`[printful] Thread color: ${normalizedColor}`);
    console.log(`[printful] Print file URL: ${printFileUrl}`);
    if (printfulFileId) {
      console.log(`[printful] Printful file ID: ${printfulFileId}`);
    }

    // Build the file reference — prefer Printful file ID if available, else URL
    const fileRef: any = { type: fileType };
    if (printfulFileId) {
      fileRef.id = printfulFileId;
    } else {
      fileRef.url = printFileUrl;
    }

    const itemPayload: any = {
      external_id: record.shopifyVariantId,
      variant_id: printfulVariantId,
      quantity: 1,
      files: [fileRef],
    };

    // Add thread colors option for embroidery orders
    if (technique === "embroidery" && threadColorsOptionId) {
      itemPayload.options = [
        {
          id: threadColorsOptionId,
          value: [normalizedColor],
        },
      ];
    }

    const recipientName =
      `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() ||
      "Customer";

    const printfulOrderBody = {
      external_id: `shopify-${record.shopifyOrderId}`,
      shipping: "STANDARD",
      recipient: {
        name: recipientName,
        address1: shipping.address1 || "",
        address2: shipping.address2 || "",
        city: shipping.city || "",
        state_code: shipping.province_code || "",
        country_code: shipping.country_code || "US",
        zip: shipping.zip || "",
        phone: shipping.phone || "",
        email: shopifyOrder.email || "",
      },
      items: [itemPayload],
    };

    console.log(
      `[printful] Submitting order to Printful: variant=${printfulVariantId}, file=${fileType}, technique=${technique}`
    );
    console.log(
      `[printful] Recipient: ${recipientName}, ${shipping.city || "?"}, ${shipping.province_code || "?"} ${shipping.zip || "?"}`
    );

    // Submit as draft so the store owner can review before charges
    const orderResult = await printfulRequest(
      "/orders?confirm=false",
      "POST",
      printfulOrderBody
    );

    const printfulOrderId = String(orderResult.result.id);
    const printfulStatus = orderResult.result.status;

    // 7. Update record as completed
    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printfulOrderId,
        printfulStatus,
        status: "completed",
      },
    });

    console.log(
      `[printful] ✓ Order ${recordId} completed → Printful #${printfulOrderId} (${printfulStatus})`
    );
    console.log(
      `[printful] Dashboard: https://www.printful.com/dashboard?order_id=${printfulOrderId}`
    );
    console.log(`[printful] ═══════════════════════════════════════════════`);

    // Clean up the original temp file
    try {
      fs.unlinkSync(printFilePath);
    } catch {
      // Ignore cleanup errors
    }
  } catch (error: any) {
    console.error(
      `[printful] ✗ Error processing order ${recordId}:`,
      error.message
    );
    console.error(`[printful] Stack:`, error.stack);
    console.log(`[printful] ═══════════════════════════════════════════════`);

    await db.personalizationOrder.update({
      where: { id: recordId },
      data: {
        status: "failed",
        errorMessage: error.message?.substring(0, 500) || "Unknown error",
      },
    });
  }
}
