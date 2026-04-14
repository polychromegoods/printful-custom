import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

/**
 * GET /api/print-files/:id
 *
 * Serves generated print files stored in the database.
 * Files are stored as base64 in PostgreSQL so they persist
 * across Railway container restarts and deployments.
 *
 * The :id parameter should be the filename (e.g., "pf-abc123.png").
 */

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const fileId = params.id;

  if (!fileId) {
    return new Response("Not found", { status: 404 });
  }

  // Look up the file in the database
  const printFile = await db.printFile.findUnique({
    where: { filename: fileId },
  });

  if (!printFile) {
    console.log(`[print-files] File not found in DB: ${fileId}`);
    return new Response("Not found", { status: 404 });
  }

  // Decode base64 to buffer
  const fileBuffer = Buffer.from(printFile.data, "base64");

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": printFile.mimeType,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
