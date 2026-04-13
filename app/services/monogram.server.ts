import { createCanvas, registerFont } from "canvas";
import path from "path";
import fs from "fs";
import os from "os";

// Printful embroidery_front_large dimensions for Yupoong 6245CM
const PRINT_WIDTH = 1650;
const PRINT_HEIGHT = 600;

// Register fonts on module load
const fontsDir = path.join(process.cwd(), "fonts");

function ensureFontsRegistered() {
  const scriptFont = path.join(fontsDir, "GreatVibes-Regular.ttf");
  const blockFont = path.join(fontsDir, "Montserrat-Bold.ttf");

  if (fs.existsSync(scriptFont)) {
    try {
      registerFont(scriptFont, { family: "GreatVibes" });
    } catch {
      // Already registered
    }
  }
  if (fs.existsSync(blockFont)) {
    try {
      registerFont(blockFont, { family: "MontserratBold" });
    } catch {
      // Already registered
    }
  }
}

ensureFontsRegistered();

export interface MonogramOptions {
  text: string;
  style: "script" | "block";
  color: string;
}

/**
 * Generate a monogram PNG print file and return the file path.
 */
export function generateMonogram(options: MonogramOptions): string {
  const { text, style, color } = options;
  const canvas = createCanvas(PRINT_WIDTH, PRINT_HEIGHT);
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, PRINT_WIDTH, PRINT_HEIGHT);

  // Configure text
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (style === "script") {
    ctx.font = "bold 350px GreatVibes";
  } else {
    // Block style: traditional monogram with larger middle letter
    ctx.font = "bold 300px MontserratBold";
  }

  if (style === "block" && text.length === 3) {
    // Traditional monogram: first-LAST-middle, with LAST being larger
    const first = text[0];
    const last = text[1]; // Middle position = last name initial (larger)
    const middle = text[2];

    // Draw side letters smaller
    ctx.font = "bold 220px MontserratBold";
    const sideMetrics = ctx.measureText("M");
    const sideWidth = sideMetrics.width;

    ctx.font = "bold 320px MontserratBold";
    const centerMetrics = ctx.measureText(last);
    const centerWidth = centerMetrics.width;

    const totalWidth = sideWidth * 2 + centerWidth + 40;
    const startX = (PRINT_WIDTH - totalWidth) / 2;

    // Left letter (first initial)
    ctx.font = "bold 220px MontserratBold";
    ctx.textAlign = "center";
    ctx.fillText(first, startX + sideWidth / 2, PRINT_HEIGHT / 2 + 10);

    // Center letter (last initial, larger)
    ctx.font = "bold 320px MontserratBold";
    ctx.fillText(last, startX + sideWidth + 20 + centerWidth / 2, PRINT_HEIGHT / 2);

    // Right letter (middle initial)
    ctx.font = "bold 220px MontserratBold";
    ctx.fillText(middle, startX + sideWidth + 40 + centerWidth + sideWidth / 2, PRINT_HEIGHT / 2 + 10);
  } else {
    // Script or non-3-letter: just center the text
    ctx.fillText(text, PRINT_WIDTH / 2, PRINT_HEIGHT / 2);
  }

  // Save to temp file
  const outputPath = path.join(os.tmpdir(), `monogram-${Date.now()}.png`);
  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(outputPath, buffer);

  console.log(`[monogram] Generated ${PRINT_WIDTH}x${PRINT_HEIGHT} monogram: "${text}" (${style}, ${color}) → ${outputPath}`);

  return outputPath;
}
