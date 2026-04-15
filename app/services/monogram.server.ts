import { createCanvas, registerFont, loadImage } from "canvas";
import path from "path";
import fs from "fs";
import os from "os";
import {
  getProductBase,
  AVAILABLE_FONTS,
  type PrintAreaSpec,
} from "../config/product-bases";

// ─── Font Registration ──────────────────────────────────────────────────────

const fontsDir = path.join(process.cwd(), "fonts");

function ensureFontsRegistered() {
  const fontFiles: Record<string, { family: string }> = {
    "GreatVibes-Regular.ttf": { family: "GreatVibes" },
    "Montserrat-Bold.ttf": { family: "MontserratBold" },
    "Oswald-Bold.ttf": { family: "OswaldBold" },
    "PlayfairDisplay-Regular.ttf": { family: "PlayfairDisplay" },
    "CormorantGaramond-Regular.ttf": { family: "CormorantGaramond" },
    "Montserrat-Regular.ttf": { family: "Montserrat" },
  };

  for (const [file, config] of Object.entries(fontFiles)) {
    const fontPath = path.join(fontsDir, file);
    if (fs.existsSync(fontPath)) {
      try {
        registerFont(fontPath, config);
      } catch {
        // Already registered
      }
    }
  }
}

ensureFontsRegistered();

// ─── Font Key → Canvas Font Family Mapping ──────────────────────────────────

const FONT_MAP: Record<string, string> = {
  script: "GreatVibes",
  block: "MontserratBold",
  serif: "PlayfairDisplay",
  sans: "Montserrat",
  monogram_classic: "CormorantGaramond",
};

// ─── Legacy Interface (backward compat) ─────────────────────────────────────

export interface MonogramOptions {
  text: string;
  style: "script" | "block";
  color: string;
}

/**
 * Legacy: Generate a monogram PNG print file for the Yupoong 6245CM hat.
 * Returns the file path.
 */
export function generateMonogram(options: MonogramOptions): string {
  return generatePrintFile({
    productBaseSlug: "yupoong-6245cm",
    technique: "embroidery",
    placementKey: "embroidery_front",
    layers: [
      {
        key: "monogram_text",
        type: "text",
        value: options.text,
        font: options.style,
        color: options.color,
        position: { x: 10, y: 10, width: 80, height: 80 },
      },
    ],
  });
}

// ─── New Template-Based Interface ───────────────────────────────────────────

export interface LayerInput {
  key: string;
  type: "text" | "image" | "fixed_image";
  value: string; // text content, or image URL for image layers
  font?: string; // font key for text layers
  color?: string; // hex color for text layers
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PrintFileOptions {
  productBaseSlug: string;
  technique: string;
  placementKey: string;
  layers: LayerInput[];
}

/**
 * Generate a print file based on template configuration.
 * Returns the local file path to the generated PNG.
 */
export function generatePrintFile(options: PrintFileOptions): string {
  const { productBaseSlug, technique, placementKey, layers } = options;

  // Look up the product base to get the correct file dimensions
  const base = getProductBase(productBaseSlug);
  let fileWidth = 1650;
  let fileHeight = 600;

  if (base) {
    const placement = base.placements.find(
      (p) => p.placementKey === placementKey
    );
    if (placement) {
      fileWidth = placement.fileSizePx.width;
      fileHeight = placement.fileSizePx.height;
    }
  }

  console.log(
    `[print-file] Generating ${fileWidth}x${fileHeight} print file for ${productBaseSlug} / ${technique} / ${placementKey}`
  );

  const canvas = createCanvas(fileWidth, fileHeight);
  const ctx = canvas.getContext("2d");

  // Transparent background for print files (Printful expects transparent PNG)
  ctx.clearRect(0, 0, fileWidth, fileHeight);

  // Composite each layer
  for (const layer of layers) {
    if (layer.type === "text" && layer.value) {
      drawTextLayer(ctx, layer, fileWidth, fileHeight);
    }
    // Image layers would be handled async — for now we support text
    // Fixed image layers would load from URL — future enhancement
  }

  // Save to temp file
  const outputPath = path.join(
    os.tmpdir(),
    `printfile-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  );
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputPath, buffer);

  console.log(
    `[print-file] Generated: ${outputPath} (${layers.length} layers)`
  );

  return outputPath;
}

/**
 * Draw a text layer onto the canvas within its position bounds.
 */
function drawTextLayer(
  ctx: any,
  layer: LayerInput,
  canvasWidth: number,
  canvasHeight: number
) {
  const { value, font, color, position } = layer;

  // Calculate pixel coordinates from percentage position
  const x = canvasWidth * (position.x / 100);
  const y = canvasHeight * (position.y / 100);
  const w = canvasWidth * (position.width / 100);
  const h = canvasHeight * (position.height / 100);

  const centerX = x + w / 2;
  const centerY = y + h / 2;

  ctx.fillStyle = color || "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fontFamily = FONT_MAP[font || "block"] || "MontserratBold";
  const isScript = font === "script";
  const isMonogramClassic = font === "monogram_classic";

  // For 3-letter monogram text with block/serif/classic fonts, use traditional layout
  if (
    value.length === 3 &&
    !isScript &&
    (font === "block" || font === "serif" || font === "monogram_classic")
  ) {
    // Traditional monogram: first-LAST-middle, with LAST being larger
    const bigSize = Math.min(w * 0.45, h * 0.75);
    const smallSize = bigSize * 0.65;

    const first = value[0];
    const last = value[1]; // Middle position = last name initial (larger)
    const middle = value[2];

    // Measure to calculate spacing
    ctx.font = `bold ${Math.round(bigSize)}px ${fontFamily}`;
    const centerMetrics = ctx.measureText(last);
    const centerWidth = centerMetrics.width;

    ctx.font = `bold ${Math.round(smallSize)}px ${fontFamily}`;
    const sideMetrics = ctx.measureText("M");
    const sideWidth = sideMetrics.width;

    const totalWidth = sideWidth * 2 + centerWidth + w * 0.06;
    const startX = centerX - totalWidth / 2;

    // Left letter (first initial)
    ctx.font = `bold ${Math.round(smallSize)}px ${fontFamily}`;
    ctx.fillText(first, startX + sideWidth / 2, centerY + bigSize * 0.05);

    // Center letter (last initial, larger)
    ctx.font = `bold ${Math.round(bigSize)}px ${fontFamily}`;
    ctx.fillText(
      last,
      startX + sideWidth + w * 0.03 + centerWidth / 2,
      centerY
    );

    // Right letter (middle initial)
    ctx.font = `bold ${Math.round(smallSize)}px ${fontFamily}`;
    ctx.fillText(
      middle,
      startX + sideWidth + w * 0.06 + centerWidth + sideWidth / 2,
      centerY + bigSize * 0.05
    );
  } else {
    // Script or non-3-letter: just center the text
    const lines = value.split("\n");
    let fontSize = isScript
      ? Math.min(w * 0.5, h * 0.7)
      : Math.min(w * 0.4, h * 0.6);

    // If many lines, scale down font
    if (lines.length > 3) fontSize = fontSize * (3 / lines.length);

    const weight = isScript ? "" : "bold ";
    ctx.font = `${weight}${Math.round(fontSize)}px ${fontFamily}`;

    if (lines.length === 1) {
      ctx.fillText(value, centerX, centerY);
    } else {
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      const startY = centerY - totalHeight / 2 + lineHeight / 2;
      lines.forEach((line: string, i: number) => {
        ctx.fillText(line, centerX, startY + i * lineHeight);
      });
    }
  }
}

/**
 * Generate a print file asynchronously (for image layers that need fetching).
 * Returns the local file path.
 */
export async function generatePrintFileAsync(
  options: PrintFileOptions
): Promise<string> {
  const { productBaseSlug, technique, placementKey, layers } = options;

  const base = getProductBase(productBaseSlug);
  let fileWidth = 1650;
  let fileHeight = 600;

  if (base) {
    const placement = base.placements.find(
      (p) => p.placementKey === placementKey
    );
    if (placement) {
      fileWidth = placement.fileSizePx.width;
      fileHeight = placement.fileSizePx.height;
    }
  }

  console.log(
    `[print-file] Generating async ${fileWidth}x${fileHeight} print file for ${productBaseSlug} / ${technique} / ${placementKey}`
  );

  const canvas = createCanvas(fileWidth, fileHeight);
  const ctx = canvas.getContext("2d");

  // Transparent background
  ctx.clearRect(0, 0, fileWidth, fileHeight);

  // Composite each layer
  for (const layer of layers) {
    if (layer.type === "text" && layer.value) {
      drawTextLayer(ctx, layer, fileWidth, fileHeight);
    } else if (layer.type === "image" && layer.value) {
      // Load and draw the uploaded image
      try {
        const img = await loadImage(layer.value);
        const x = fileWidth * (layer.position.x / 100);
        const y = fileHeight * (layer.position.y / 100);
        const w = fileWidth * (layer.position.width / 100);
        const h = fileHeight * (layer.position.height / 100);
        ctx.drawImage(img, x, y, w, h);
      } catch (err) {
        console.error(`[print-file] Failed to load image layer: ${err}`);
      }
    } else if (layer.type === "fixed_image" && layer.value) {
      // Load and draw the fixed template image
      try {
        const img = await loadImage(layer.value);
        const x = fileWidth * (layer.position.x / 100);
        const y = fileHeight * (layer.position.y / 100);
        const w = fileWidth * (layer.position.width / 100);
        const h = fileHeight * (layer.position.height / 100);
        ctx.drawImage(img, x, y, w, h);
      } catch (err) {
        console.error(`[print-file] Failed to load fixed image layer: ${err}`);
      }
    }
  }

  const outputPath = path.join(
    os.tmpdir(),
    `printfile-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  );
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputPath, buffer);

  console.log(
    `[print-file] Generated async: ${outputPath} (${layers.length} layers)`
  );

  return outputPath;
}
