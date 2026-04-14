import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const APP_URL = process.env.SHOPIFY_APP_URL || process.env.APP_URL || "https://printful-custom-production.up.railway.app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const fileUrl = url.searchParams.get("url") || `${APP_URL}/api/print-files/pf-1776194486126-r6wa7gjlbb.png`;

  console.log(`[test-upload] Testing Printful file upload with URL: ${fileUrl}`);
  console.log(`[test-upload] PRINTFUL_TOKEN present: ${!!PRINTFUL_TOKEN}`);
  console.log(`[test-upload] PRINTFUL_TOKEN length: ${PRINTFUL_TOKEN.length}`);

  try {
    // Step 1: Try uploading to Printful File Library
    const fileResponse = await fetch("https://api.printful.com/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: fileUrl,
        filename: "test-upload.png",
        visible: false,
      }),
    });

    const fileData = await fileResponse.json();
    console.log(`[test-upload] File upload response: ${JSON.stringify(fileData)}`);

    return json({
      step: "file_upload",
      status: fileResponse.status,
      ok: fileResponse.ok,
      result: fileData,
      testedUrl: fileUrl,
      tokenPresent: !!PRINTFUL_TOKEN,
      tokenLength: PRINTFUL_TOKEN.length,
    });
  } catch (error: any) {
    return json({
      step: "file_upload",
      error: error.message,
      testedUrl: fileUrl,
    }, { status: 500 });
  }
};
