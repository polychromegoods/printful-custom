import type { LoaderFunctionArgs } from "@remix-run/node";
import fs from "fs";
import path from "path";

/**
 * GET /api/print-files/:id
 *
 * Serves generated print files from the local filesystem.
 * These are temporary files created by the webhook handler
 * and consumed by Printful when creating orders.
 *
 * The :id parameter should be the filename (e.g., "abc123.png").
 */

const PRINT_FILES_DIR = path.join(process.cwd(), "generated-print-files");

// Ensure the directory exists
if (!fs.existsSync(PRINT_FILES_DIR)) {
  fs.mkdirSync(PRINT_FILES_DIR, { recursive: true });
}

export { PRINT_FILES_DIR };

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const fileId = params.id;

  if (!fileId) {
    return new Response("Not found", { status: 404 });
  }

  // Sanitize filename to prevent directory traversal
  const sanitized = path.basename(fileId);
  const filePath = path.join(PRINT_FILES_DIR, sanitized);

  if (!fs.existsSync(filePath)) {
    console.log(`[print-files] File not found: ${filePath}`);
    return new Response("Not found", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(sanitized).toLowerCase();

  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".pdf": "application/pdf",
  };

  const contentType = mimeTypes[ext] || "application/octet-stream";

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
