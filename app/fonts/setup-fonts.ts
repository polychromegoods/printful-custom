/**
 * MUST be imported before any module that uses sharp.
 * Sets FONTCONFIG_PATH so that librsvg (used by sharp for SVG rendering)
 * can discover our bundled fonts (Playfair Display, Oswald, Montserrat, etc.).
 *
 * This module also exports a lazy-loaded sharp instance to guarantee
 * the env var is set before sharp's native bindings initialize.
 */
import path from "path";

const fontsDir = path.join(process.cwd(), "app", "fonts");

// Set BEFORE any sharp import
if (!process.env.FONTCONFIG_PATH) {
  process.env.FONTCONFIG_PATH = fontsDir;
}

let _sharp: any = null;

export async function getSharp() {
  if (!_sharp) {
    // Ensure env var is set before dynamic import
    process.env.FONTCONFIG_PATH = fontsDir;
    const sharpModule = await import("sharp");
    _sharp = sharpModule.default || sharpModule;
  }
  return _sharp;
}
