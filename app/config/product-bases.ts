/**
 * Product Base Registry
 * 
 * This file defines all available Printful product bases with their
 * exact specifications, placements, thread colors, variant IDs, and
 * print file requirements.
 * 
 * To add a new product base:
 * 1. Look up the product in Printful's catalog API (GET /v2/catalog-products/{id})
 * 2. Get variants via GET /products/{id}
 * 3. Add a new entry to PRODUCT_BASES following the structure below
 */

// ─── Thread Colors (shared across all embroidery products) ───────────────────

export const EMBROIDERY_THREAD_COLORS = [
  { hex: "#FFFFFF", name: "White", madeira: "1801" },
  { hex: "#000000", name: "Black", madeira: "1800" },
  { hex: "#96A1A8", name: "Grey", madeira: "1718" },
  { hex: "#A67843", name: "Old Gold", madeira: "1672" },
  { hex: "#FFCC00", name: "Gold", madeira: "1951" },
  { hex: "#E25C27", name: "Orange", madeira: "1987" },
  { hex: "#CC3366", name: "Flamingo", madeira: "1910" },
  { hex: "#CC3333", name: "Red", madeira: "1839" },
  { hex: "#660000", name: "Maroon", madeira: "1784" },
  { hex: "#333366", name: "Navy", madeira: "1966" },
  { hex: "#005397", name: "Royal", madeira: "1842" },
  { hex: "#3399FF", name: "Aqua/Teal", madeira: "1695" },
  { hex: "#6B5294", name: "Purple", madeira: "1832" },
  { hex: "#01784E", name: "Kelly Green", madeira: "1751" },
  { hex: "#7BA35A", name: "Kiwi Green", madeira: "1848" },
] as const;

export type ThreadColor = (typeof EMBROIDERY_THREAD_COLORS)[number];

// ─── Technique Types ─────────────────────────────────────────────────────────

export type TechniqueKey = "embroidery" | "dtg" | "dtfilm";

export interface Technique {
  key: TechniqueKey;
  displayName: string;
  isDefault: boolean;
}

// ─── Placement Types ─────────────────────────────────────────────────────────

export interface PrintAreaSpec {
  /** Printful placement key (e.g., "embroidery_front") */
  placementKey: string;
  /** Human-readable name */
  displayName: string;
  /** Which technique this placement uses */
  technique: TechniqueKey;
  /** Max print area in inches */
  maxAreaInches: { width: number; height: number };
  /** Required print file size in pixels (at 300 DPI) */
  fileSizePx: { width: number; height: number };
  /** DPI for the print file */
  dpi: number;
  /** Whether 3D puff embroidery is available */
  supports3dPuff?: boolean;
  /** Position on the mockup image as percentage (for live preview overlay) */
  mockupPosition: {
    x: number; // % from left
    y: number; // % from top
    width: number; // % of image width
    height: number; // % of image height
  };
}

// ─── Variant Types ───────────────────────────────────────────────────────────

export interface ProductVariant {
  /** Printful variant ID */
  printfulVariantId: number;
  /** Color name */
  color: string;
  /** Color hex code */
  colorHex: string;
  /** Size (if applicable) */
  size?: string;
}

// ─── Customization Layer Types ───────────────────────────────────────────────

export type LayerType = "text" | "image" | "fixed_image";

export interface CustomizationLayerDef {
  /** Unique key for this layer */
  key: string;
  /** Layer type */
  type: LayerType;
  /** Human-readable label */
  label: string;
  /** Whether the customer can customize this layer */
  customerEditable: boolean;
  /** For text layers: max characters */
  maxChars?: number;
  /** For text layers: available font families */
  fonts?: FontDef[];
  /** For text layers: use thread colors or custom color list */
  colorSource?: "thread_colors" | "custom";
  /** For image layers: accepted file types */
  acceptedFileTypes?: string[];
  /** For image layers: max file size in MB */
  maxFileSizeMb?: number;
  /** For fixed_image layers: the URL of the fixed image */
  fixedImageUrl?: string;
  /** Position within the print area as percentage */
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FontDef {
  key: string;
  displayName: string;
  /** CSS font-family for live preview */
  cssFontFamily: string;
  /** URL to the font file (for server-side rendering) */
  fontFileUrl?: string;
  /** Google Fonts name (for easy loading) */
  googleFontName?: string;
}

// ─── Product Base Definition ─────────────────────────────────────────────────

export interface ProductBase {
  /** Unique slug for this product base */
  slug: string;
  /** Printful catalog product ID */
  printfulProductId: number;
  /** Human-readable name */
  name: string;
  /** Brand */
  brand: string;
  /** Model number */
  model: string;
  /** Product category */
  category: "hat" | "shirt" | "hoodie" | "bag" | "accessory";
  /** Available techniques for this product */
  techniques: Technique[];
  /** Available placements (front only for now) */
  placements: PrintAreaSpec[];
  /** All variant colors */
  variants: ProductVariant[];
  /** Default mockup image URL for the visual editor (stored in public/mockups/) */
  defaultMockupUrl?: string;
  /** Default customization layers (can be overridden per product template) */
  defaultLayers: CustomizationLayerDef[];
}

// ─── Font Definitions ────────────────────────────────────────────────────────

export const AVAILABLE_FONTS: FontDef[] = [
  {
    key: "script",
    displayName: "Script",
    cssFontFamily: "'Great Vibes', cursive",
    googleFontName: "Great Vibes",
  },
  {
    key: "block",
    displayName: "Block",
    cssFontFamily: "'Oswald', sans-serif",
    googleFontName: "Oswald",
  },
  {
    key: "serif",
    displayName: "Serif",
    cssFontFamily: "'Playfair Display', serif",
    googleFontName: "Playfair Display",
  },
  {
    key: "sans",
    displayName: "Sans Serif",
    cssFontFamily: "'Montserrat', sans-serif",
    googleFontName: "Montserrat",
  },
  {
    key: "monogram_classic",
    displayName: "Monogram Classic",
    cssFontFamily: "'Cormorant Garamond', serif",
    googleFontName: "Cormorant Garamond",
  },
];

// ─── Product Base Registry ───────────────────────────────────────────────────

export const PRODUCT_BASES: ProductBase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Yupoong 6245CM Classic Dad Hat
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug: "yupoong-6245cm",
    printfulProductId: 206,
    name: "Classic Dad Hat",
    brand: "Yupoong",
    model: "6245CM",
    category: "hat",
    defaultMockupUrl: "/mockups/dad-hat-white.png",
    techniques: [
      { key: "embroidery", displayName: "Embroidery", isDefault: true },
      { key: "dtfilm", displayName: "DTF Printing", isDefault: false },
    ],
    placements: [
      {
        placementKey: "embroidery_front",
        displayName: "Front Embroidery",
        technique: "embroidery",
        maxAreaInches: { width: 5.5, height: 2 },
        fileSizePx: { width: 1650, height: 600 },
        dpi: 300,
        supports3dPuff: true,
        mockupPosition: { x: 20, y: 38, width: 60, height: 22 },
      },
      {
        placementKey: "embroidery_front_large",
        displayName: "Front Large Embroidery",
        technique: "embroidery",
        maxAreaInches: { width: 5.5, height: 2 },
        fileSizePx: { width: 1650, height: 600 },
        dpi: 300,
        supports3dPuff: true,
        mockupPosition: { x: 15, y: 33, width: 70, height: 30 },
      },
    ],
    variants: [
      { printfulVariantId: 7854, color: "Black", colorHex: "#181717" },
      { printfulVariantId: 12735, color: "Cranberry", colorHex: "#a3001b" },
      { printfulVariantId: 12736, color: "Dark Grey", colorHex: "#39353a" },
      { printfulVariantId: 9794, color: "Green Camo", colorHex: "#415446" },
      { printfulVariantId: 7855, color: "Khaki", colorHex: "#b49771" },
      { printfulVariantId: 7856, color: "Light Blue", colorHex: "#b5cbda" },
      { printfulVariantId: 7857, color: "Navy", colorHex: "#182031" },
      { printfulVariantId: 7858, color: "Pink", colorHex: "#fab2ba" },
      { printfulVariantId: 8745, color: "Spruce", colorHex: "#183a31" },
      { printfulVariantId: 7859, color: "Stone", colorHex: "#d6bdad" },
      { printfulVariantId: 7853, color: "White", colorHex: "#ffffff" },
    ],
    defaultLayers: [
      {
        key: "monogram_text",
        type: "text",
        label: "Monogram Text",
        customerEditable: true,
        maxChars: 3,
        fonts: AVAILABLE_FONTS,
        colorSource: "thread_colors",
        position: { x: 10, y: 10, width: 80, height: 80 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Comfort Colors 1717 Heavyweight T-Shirt
  // ═══════════════════════════════════════════════════════════════════════════
  {
    slug: "comfort-colors-1717",
    printfulProductId: 586,
    name: "Unisex Garment-Dyed Heavyweight T-Shirt",
    brand: "Comfort Colors",
    model: "1717",
    category: "shirt",
    techniques: [
      { key: "dtg", displayName: "DTG Printing", isDefault: true },
      { key: "embroidery", displayName: "Embroidery", isDefault: false },
      { key: "dtfilm", displayName: "DTF Printing", isDefault: false },
    ],
    placements: [
      // ── Embroidery placements ──
      {
        placementKey: "embroidery_chest_left",
        displayName: "Left Chest Embroidery",
        technique: "embroidery",
        maxAreaInches: { width: 4, height: 4 },
        fileSizePx: { width: 1200, height: 1200 },
        dpi: 300,
        supports3dPuff: false,
        mockupPosition: { x: 52, y: 28, width: 18, height: 18 },
      },
      {
        placementKey: "embroidery_chest_center",
        displayName: "Center Chest Embroidery",
        technique: "embroidery",
        maxAreaInches: { width: 4, height: 4 },
        fileSizePx: { width: 1200, height: 1200 },
        dpi: 300,
        supports3dPuff: false,
        mockupPosition: { x: 35, y: 25, width: 30, height: 20 },
      },
      {
        placementKey: "embroidery_large_front",
        displayName: "Large Front Embroidery",
        technique: "embroidery",
        maxAreaInches: { width: 10, height: 6 },
        fileSizePx: { width: 3000, height: 1800 },
        dpi: 300,
        supports3dPuff: false,
        mockupPosition: { x: 20, y: 22, width: 60, height: 36 },
      },
      // ── DTG placements ──
      {
        placementKey: "front",
        displayName: "Front Print (DTG)",
        technique: "dtg",
        maxAreaInches: { width: 12, height: 16 },
        fileSizePx: { width: 3600, height: 4800 },
        dpi: 300,
        mockupPosition: { x: 18, y: 18, width: 64, height: 55 },
      },
      // ── DTF placements ──
      {
        placementKey: "front_dtf",
        displayName: "Front Print (DTF)",
        technique: "dtfilm",
        maxAreaInches: { width: 12, height: 16 },
        fileSizePx: { width: 3600, height: 4800 },
        dpi: 300,
        mockupPosition: { x: 18, y: 18, width: 64, height: 55 },
      },
    ],
    variants: [
      // Only including unique colors (size S as reference — size is selected separately)
      { printfulVariantId: 17707, color: "Bay", colorHex: "#b8bfab", size: "S" },
      { printfulVariantId: 15156, color: "Berry", colorHex: "#8e5a7b", size: "S" },
      { printfulVariantId: 15114, color: "Black", colorHex: "#1b1b1c", size: "S" },
      { printfulVariantId: 16541, color: "Blossom", colorHex: "#ffd6e1", size: "S" },
      { printfulVariantId: 16511, color: "Blue Jean", colorHex: "#707e8d", size: "S" },
      { printfulVariantId: 17714, color: "Blue Spruce", colorHex: "#4c6151", size: "S" },
      { printfulVariantId: 15162, color: "Brick", colorHex: "#8d4b54", size: "S" },
      { printfulVariantId: 17721, color: "Burnt Orange", colorHex: "#FF7842", size: "S" },
      { printfulVariantId: 15168, color: "Butter", colorHex: "#ffe09e", size: "S" },
      { printfulVariantId: 16547, color: "Chalky Mint", colorHex: "#a1f2dc", size: "S" },
      { printfulVariantId: 16553, color: "Chambray", colorHex: "#d9f3ff", size: "S" },
      { printfulVariantId: 17728, color: "Crimson", colorHex: "#bb5151", size: "S" },
      { printfulVariantId: 16559, color: "Crunchberry", colorHex: "#ff748e", size: "S" },
      { printfulVariantId: 15174, color: "Denim", colorHex: "#565a67", size: "S" },
      { printfulVariantId: 16565, color: "Espresso", colorHex: "#87634a", size: "S" },
      { printfulVariantId: 15180, color: "Flo Blue", colorHex: "#5669be", size: "S" },
      { printfulVariantId: 15186, color: "Granite", colorHex: "#a6abaa", size: "S" },
      { printfulVariantId: 15192, color: "Grape", colorHex: "#644E6D", size: "S" },
      { printfulVariantId: 16571, color: "Graphite", colorHex: "#3e3737", size: "S" },
      { printfulVariantId: 15198, color: "Grey", colorHex: "#92928f", size: "S" },
      { printfulVariantId: 17735, color: "Hemp", colorHex: "#4F5232", size: "S" },
      { printfulVariantId: 15204, color: "Ice Blue", colorHex: "#7a9096", size: "S" },
      { printfulVariantId: 15210, color: "Island Reef", colorHex: "#b8ffca", size: "S" },
      { printfulVariantId: 15216, color: "Ivory", colorHex: "#fff4d9", size: "S" },
      { printfulVariantId: 15222, color: "Khaki", colorHex: "#b3ab8b", size: "S" },
      { printfulVariantId: 16577, color: "Lagoon Blue", colorHex: "#92dedb", size: "S" },
      { printfulVariantId: 16583, color: "Light Green", colorHex: "#608267", size: "S" },
      { printfulVariantId: 15228, color: "Midnight", colorHex: "#3a4e63", size: "S" },
      { printfulVariantId: 15234, color: "Moss", colorHex: "#6b7053", size: "S" },
      { printfulVariantId: 15240, color: "Mustard", colorHex: "#ffbc5a", size: "S" },
      { printfulVariantId: 17742, color: "Mystic Blue", colorHex: "#5068AB", size: "S" },
      { printfulVariantId: 15120, color: "Navy", colorHex: "#424150", size: "S" },
      { printfulVariantId: 16589, color: "Orchid", colorHex: "#ead3f2", size: "S" },
      { printfulVariantId: 17749, color: "Paprika", colorHex: "#fe4747", size: "S" },
      { printfulVariantId: 15246, color: "Pepper", colorHex: "#514f4c", size: "S" },
      { printfulVariantId: 15252, color: "Red", colorHex: "#bb1035", size: "S" },
      { printfulVariantId: 16595, color: "Sage", colorHex: "#49482e", size: "S" },
      { printfulVariantId: 15126, color: "Seafoam", colorHex: "#69a999", size: "S" },
      { printfulVariantId: 16601, color: "Terracotta", colorHex: "#ff9364", size: "S" },
      { printfulVariantId: 15132, color: "True Navy", colorHex: "#1e2c4a", size: "S" },
      { printfulVariantId: 16607, color: "Violet", colorHex: "#9a8ad2", size: "S" },
      { printfulVariantId: 16613, color: "Washed Denim", colorHex: "#98aed1", size: "S" },
      { printfulVariantId: 15138, color: "Watermelon", colorHex: "#d15c68", size: "S" },
      { printfulVariantId: 15144, color: "White", colorHex: "#ffffff", size: "S" },
      { printfulVariantId: 15150, color: "Yam", colorHex: "#db642f", size: "S" },
    ],
    defaultLayers: [
      {
        key: "main_text",
        type: "text",
        label: "Custom Text",
        customerEditable: true,
        maxChars: 20,
        fonts: AVAILABLE_FONTS,
        colorSource: "thread_colors",
        position: { x: 10, y: 20, width: 80, height: 60 },
      },
    ],
  },
];

// ─── Helper Functions ────────────────────────────────────────────────────────

export function getProductBase(slug: string): ProductBase | undefined {
  return PRODUCT_BASES.find((pb) => pb.slug === slug);
}

export function getProductBaseByPrintfulId(printfulProductId: number): ProductBase | undefined {
  return PRODUCT_BASES.find((pb) => pb.printfulProductId === printfulProductId);
}

export function getPlacementsForTechnique(
  base: ProductBase,
  technique: TechniqueKey
): PrintAreaSpec[] {
  return base.placements.filter((p) => p.technique === technique);
}

export function getVariantByColor(
  base: ProductBase,
  color: string
): ProductVariant | undefined {
  return base.variants.find(
    (v) => v.color.toLowerCase() === color.toLowerCase()
  );
}

export function getThreadColorByHex(hex: string): ThreadColor | undefined {
  return EMBROIDERY_THREAD_COLORS.find(
    (tc) => tc.hex.toLowerCase() === hex.toLowerCase()
  );
}

/**
 * Get the correct Printful variant ID for a given product, color, and size.
 * For hats (one size), size is ignored.
 * For shirts, we need to look up the specific size variant.
 */
export function getPrintfulVariantId(
  base: ProductBase,
  color: string,
  size?: string
): number | undefined {
  if (base.category === "hat") {
    return getVariantByColor(base, color)?.printfulVariantId;
  }
  // For sized products, the registry only stores size S references.
  // The actual variant ID needs to be looked up via the Printful API at order time.
  // We store the base variant ID for reference.
  return getVariantByColor(base, color)?.printfulVariantId;
}
