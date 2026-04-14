var _a;
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useActionData, Form, Link, useRouteError, useSubmit, useNavigation, useRevalidator } from "@remix-run/react";
import { createReadableStreamFromReadable, json, redirect } from "@remix-run/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-remix/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { registerFont, createCanvas, loadImage } from "canvas";
import os from "os";
import { useState, useRef, useEffect, useCallback } from "react";
import { AppProvider, Page, Card, FormLayout, Text, TextField, Button, BlockStack, InlineStack, Select, Checkbox, Divider, Layout, Banner, EmptyState, IndexTable, Badge, Box, Thumbnail, Modal, DropZone, ChoiceList, Link as Link$1, List, Tooltip } from "@shopify/polaris";
import { AppProvider as AppProvider$1 } from "@shopify/shopify-app-remix/react";
import { NavMenu, useAppBridge, TitleBar } from "@shopify/app-bridge-react";
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.Custom,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.January25;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, remixContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        RemixServer,
        {
          context: remixContext,
          url: request.url
        }
      ),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
function App$2() {
  return /* @__PURE__ */ jsxs("html", { children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width,initial-scale=1" }),
      /* @__PURE__ */ jsx("link", { rel: "preconnect", href: "https://cdn.shopify.com/" }),
      /* @__PURE__ */ jsx(
        "link",
        {
          rel: "stylesheet",
          href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        }
      ),
      /* @__PURE__ */ jsx(Meta, {}),
      /* @__PURE__ */ jsx(Links, {})
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsx(Outlet, {}),
      /* @__PURE__ */ jsx(ScrollRestoration, {}),
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: App$2
}, Symbol.toStringTag, { value: "Module" }));
const PRINTFUL_TOKEN$2 = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_API$1 = "https://api.printful.com";
const APP_URL$1 = process.env.SHOPIFY_APP_URL || process.env.APP_URL || "https://printful-custom-production.up.railway.app";
const loader$c = async ({ request }) => {
  try {
    const response = await fetch(`${PRINTFUL_API$1}/webhooks`, {
      headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN$2}`,
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();
    return json({
      status: "ok",
      currentWebhook: data.result || null,
      appUrl: APP_URL$1
    });
  } catch (error) {
    return json({ status: "error", message: error.message }, { status: 500 });
  }
};
const action$6 = async ({ request }) => {
  var _a2, _b, _c;
  const webhookUrl = `${APP_URL$1}/api/printful-webhook`;
  console.log(`[printful-webhook-setup] Registering webhook: ${webhookUrl}`);
  try {
    const response = await fetch(`${PRINTFUL_API$1}/webhooks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN$2}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: webhookUrl,
        types: [
          "package_shipped",
          "package_returned",
          "order_created",
          "order_updated",
          "order_failed",
          "order_canceled"
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(
        `[printful-webhook-setup] Failed to register: ${JSON.stringify(data)}`
      );
      return json(
        {
          status: "error",
          message: ((_a2 = data.error) == null ? void 0 : _a2.message) || "Failed to register webhook",
          details: data
        },
        { status: response.status }
      );
    }
    console.log(
      `[printful-webhook-setup] ✓ Webhook registered successfully!`
    );
    console.log(
      `[printful-webhook-setup]   URL: ${(_b = data.result) == null ? void 0 : _b.url}`
    );
    console.log(
      `[printful-webhook-setup]   Types: ${JSON.stringify((_c = data.result) == null ? void 0 : _c.types)}`
    );
    return json({
      status: "ok",
      message: "Webhook registered successfully",
      webhook: data.result
    });
  } catch (error) {
    console.error(
      `[printful-webhook-setup] Error:`,
      error.message
    );
    return json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6,
  loader: loader$c
}, Symbol.toStringTag, { value: "Module" }));
const action$5 = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await prisma.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
const PRINTFUL_TOKEN$1 = process.env.PRINTFUL_TOKEN || "";
const APP_URL = process.env.SHOPIFY_APP_URL || process.env.APP_URL || "https://printful-custom-production.up.railway.app";
const loader$b = async ({ request }) => {
  const url = new URL(request.url);
  const fileUrl = url.searchParams.get("url") || `${APP_URL}/api/print-files/pf-1776194486126-r6wa7gjlbb.png`;
  console.log(`[test-upload] Testing Printful file upload with URL: ${fileUrl}`);
  console.log(`[test-upload] PRINTFUL_TOKEN present: ${!!PRINTFUL_TOKEN$1}`);
  console.log(`[test-upload] PRINTFUL_TOKEN length: ${PRINTFUL_TOKEN$1.length}`);
  try {
    const fileResponse = await fetch("https://api.printful.com/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PRINTFUL_TOKEN$1}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: fileUrl,
        filename: "test-upload.png",
        visible: false
      })
    });
    const fileData = await fileResponse.json();
    console.log(`[test-upload] File upload response: ${JSON.stringify(fileData)}`);
    return json({
      step: "file_upload",
      status: fileResponse.status,
      ok: fileResponse.ok,
      result: fileData,
      testedUrl: fileUrl,
      tokenPresent: !!PRINTFUL_TOKEN$1,
      tokenLength: PRINTFUL_TOKEN$1.length
    });
  } catch (error) {
    return json({
      step: "file_upload",
      error: error.message,
      testedUrl: fileUrl
    }, { status: 500 });
  }
};
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
const action$4 = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await prisma.session.deleteMany({ where: { shop } });
  }
  return new Response();
};
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const EMBROIDERY_THREAD_COLORS = [
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
  { hex: "#7BA35A", name: "Kiwi Green", madeira: "1848" }
];
const AVAILABLE_FONTS = [
  {
    key: "script",
    displayName: "Script",
    cssFontFamily: "'Great Vibes', cursive",
    googleFontName: "Great Vibes"
  },
  {
    key: "block",
    displayName: "Block",
    cssFontFamily: "'Oswald', sans-serif",
    googleFontName: "Oswald"
  },
  {
    key: "serif",
    displayName: "Serif",
    cssFontFamily: "'Playfair Display', serif",
    googleFontName: "Playfair Display"
  },
  {
    key: "sans",
    displayName: "Sans Serif",
    cssFontFamily: "'Montserrat', sans-serif",
    googleFontName: "Montserrat"
  },
  {
    key: "monogram_classic",
    displayName: "Monogram Classic",
    cssFontFamily: "'Cormorant Garamond', serif",
    googleFontName: "Cormorant Garamond"
  }
];
const PRODUCT_BASES = [
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
    defaultMockupUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/DoicGgedrbpWtliI.webp",
    variantMockups: {
      "White": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/DoicGgedrbpWtliI.webp",
      "Black": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/hVMqQqWVoUnIaESk.webp",
      "Green Camo": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/FyLGXZOHUVwHnsAz.webp",
      "Navy": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/KQVqTsdQtgptQQlw.webp",
      "Dark Grey": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/DinZcLEvJCIyGWsV.webp",
      "Khaki": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/RIyTVTbyHlboqbeC.webp",
      "Light Blue": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/xHJLnUJNprMNqIQS.webp",
      "Pink": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/CcMgnXgysxtFJzDS.webp",
      "Spruce": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/HQrpMPQBFUhwvgdp.webp",
      "Stone": "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/pOloSlhZHOYaeRBW.webp"
    },
    techniques: [
      { key: "embroidery", displayName: "Embroidery", isDefault: true },
      { key: "dtfilm", displayName: "DTF Printing", isDefault: false }
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
        mockupPosition: { x: 20, y: 38, width: 60, height: 22 }
      },
      {
        placementKey: "embroidery_front_large",
        displayName: "Front Large Embroidery",
        technique: "embroidery",
        maxAreaInches: { width: 5.5, height: 2 },
        fileSizePx: { width: 1650, height: 600 },
        dpi: 300,
        supports3dPuff: true,
        mockupPosition: { x: 15, y: 33, width: 70, height: 30 }
      }
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
      { printfulVariantId: 7853, color: "White", colorHex: "#ffffff" }
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
        position: { x: 10, y: 10, width: 80, height: 80 }
      }
    ]
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
      { key: "dtfilm", displayName: "DTF Printing", isDefault: false }
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
        mockupPosition: { x: 52, y: 28, width: 18, height: 18 }
      },
      {
        placementKey: "embroidery_chest_center",
        displayName: "Center Chest Embroidery",
        technique: "embroidery",
        maxAreaInches: { width: 4, height: 4 },
        fileSizePx: { width: 1200, height: 1200 },
        dpi: 300,
        supports3dPuff: false,
        mockupPosition: { x: 35, y: 25, width: 30, height: 20 }
      },
      {
        placementKey: "embroidery_large_front",
        displayName: "Large Front Embroidery",
        technique: "embroidery",
        maxAreaInches: { width: 10, height: 6 },
        fileSizePx: { width: 3e3, height: 1800 },
        dpi: 300,
        supports3dPuff: false,
        mockupPosition: { x: 20, y: 22, width: 60, height: 36 }
      },
      // ── DTG placements ──
      {
        placementKey: "front",
        displayName: "Front Print (DTG)",
        technique: "dtg",
        maxAreaInches: { width: 12, height: 16 },
        fileSizePx: { width: 3600, height: 4800 },
        dpi: 300,
        mockupPosition: { x: 18, y: 18, width: 64, height: 55 }
      },
      // ── DTF placements ──
      {
        placementKey: "front_dtf",
        displayName: "Front Print (DTF)",
        technique: "dtfilm",
        maxAreaInches: { width: 12, height: 16 },
        fileSizePx: { width: 3600, height: 4800 },
        dpi: 300,
        mockupPosition: { x: 18, y: 18, width: 64, height: 55 }
      }
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
      { printfulVariantId: 15150, color: "Yam", colorHex: "#db642f", size: "S" }
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
        position: { x: 10, y: 20, width: 80, height: 60 }
      }
    ]
  }
];
function getProductBase(slug) {
  return PRODUCT_BASES.find((pb) => pb.slug === slug);
}
function getPlacementsForTechnique(base, technique) {
  return base.placements.filter((p) => p.technique === technique);
}
const fontsDir$1 = path.join(process.cwd(), "fonts");
function ensureFontsRegistered() {
  const fontFiles = {
    "GreatVibes-Regular.ttf": { family: "GreatVibes" },
    "Montserrat-Bold.ttf": { family: "MontserratBold" },
    "Oswald-Bold.ttf": { family: "OswaldBold" },
    "PlayfairDisplay-Regular.ttf": { family: "PlayfairDisplay" },
    "CormorantGaramond-Regular.ttf": { family: "CormorantGaramond" },
    "Montserrat-Regular.ttf": { family: "Montserrat" }
  };
  for (const [file, config] of Object.entries(fontFiles)) {
    const fontPath = path.join(fontsDir$1, file);
    if (fs.existsSync(fontPath)) {
      try {
        registerFont(fontPath, config);
      } catch {
      }
    }
  }
}
ensureFontsRegistered();
const FONT_MAP = {
  script: "GreatVibes",
  block: "MontserratBold",
  serif: "PlayfairDisplay",
  sans: "Montserrat",
  monogram_classic: "CormorantGaramond"
};
function generateMonogram(options) {
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
        position: { x: 10, y: 10, width: 80, height: 80 }
      }
    ]
  });
}
function generatePrintFile(options) {
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
    `[print-file] Generating ${fileWidth}x${fileHeight} print file for ${productBaseSlug} / ${technique} / ${placementKey}`
  );
  const canvas = createCanvas(fileWidth, fileHeight);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, fileWidth, fileHeight);
  for (const layer of layers) {
    if (layer.type === "text" && layer.value) {
      drawTextLayer(ctx, layer, fileWidth, fileHeight);
    }
  }
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
function drawTextLayer(ctx, layer, canvasWidth, canvasHeight) {
  const { value, font, color, position } = layer;
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
  if (value.length === 3 && !isScript && (font === "block" || font === "serif" || font === "monogram_classic")) {
    const bigSize = Math.min(w * 0.45, h * 0.75);
    const smallSize = bigSize * 0.65;
    const first = value[0];
    const last = value[1];
    const middle = value[2];
    ctx.font = `bold ${Math.round(bigSize)}px ${fontFamily}`;
    const centerMetrics = ctx.measureText(last);
    const centerWidth = centerMetrics.width;
    ctx.font = `bold ${Math.round(smallSize)}px ${fontFamily}`;
    const sideMetrics = ctx.measureText("M");
    const sideWidth = sideMetrics.width;
    const totalWidth = sideWidth * 2 + centerWidth + w * 0.06;
    const startX = centerX - totalWidth / 2;
    ctx.font = `bold ${Math.round(smallSize)}px ${fontFamily}`;
    ctx.fillText(first, startX + sideWidth / 2, centerY + bigSize * 0.05);
    ctx.font = `bold ${Math.round(bigSize)}px ${fontFamily}`;
    ctx.fillText(
      last,
      startX + sideWidth + w * 0.03 + centerWidth / 2,
      centerY
    );
    ctx.font = `bold ${Math.round(smallSize)}px ${fontFamily}`;
    ctx.fillText(
      middle,
      startX + sideWidth + w * 0.06 + centerWidth + sideWidth / 2,
      centerY + bigSize * 0.05
    );
  } else {
    const fontSize = isScript ? Math.min(w * 0.5, h * 0.7) : Math.min(w * 0.4, h * 0.6);
    const weight = isScript ? "" : "bold ";
    ctx.font = `${weight}${Math.round(fontSize)}px ${fontFamily}`;
    ctx.fillText(value, centerX, centerY);
  }
}
async function generatePrintFileAsync(options) {
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
  ctx.clearRect(0, 0, fileWidth, fileHeight);
  for (const layer of layers) {
    if (layer.type === "text" && layer.value) {
      drawTextLayer(ctx, layer, fileWidth, fileHeight);
    } else if (layer.type === "image" && layer.value) {
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
const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_API = "https://api.printful.com";
const API_VERSION = "2025-01";
async function printfulRequest(endpoint, method = "GET", body) {
  const url = `${PRINTFUL_API}${endpoint}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${PRINTFUL_TOKEN}`,
      "Content-Type": "application/json"
    }
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
async function uploadToShopifyCDN(localPath, shop, filename) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  console.log(`[printful] Uploading print file to Shopify CDN for ${shop}...`);
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false }
  });
  if (!session) {
    console.error(`[printful] No offline session found for shop ${shop}`);
    throw new Error(`No offline session for ${shop}`);
  }
  const accessToken = session.accessToken;
  const graphqlUrl = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
  const fileBuffer = fs.readFileSync(localPath);
  const fileSize = String(fileBuffer.length);
  const mimeType = "image/png";
  console.log(`[printful] File: ${filename}, size: ${fileSize} bytes`);
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
        httpMethod: "POST"
      }]
    }
  });
  console.log(`[printful] Step 1: Creating staged upload target...`);
  const stagedRes = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json"
    },
    body: stagedQuery
  });
  if (!stagedRes.ok) {
    const errText = await stagedRes.text();
    throw new Error(`Staged upload failed (${stagedRes.status}): ${errText}`);
  }
  const stagedData = await stagedRes.json();
  const target = (_c = (_b = (_a2 = stagedData.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.stagedTargets) == null ? void 0 : _c[0];
  if (!target) {
    const errors = (_e = (_d = stagedData.data) == null ? void 0 : _d.stagedUploadsCreate) == null ? void 0 : _e.userErrors;
    throw new Error(`Staged upload failed: ${JSON.stringify(errors)}`);
  }
  console.log(`[printful] Step 1 done. Upload URL: ${target.url}`);
  console.log(`[printful] Resource URL: ${target.resourceUrl}`);
  console.log(`[printful] Step 2: Uploading file to staged target...`);
  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  const blob = new Blob([fileBuffer], { type: mimeType });
  uploadForm.append("file", blob, filename);
  const uploadRes = await fetch(target.url, {
    method: "POST",
    body: uploadForm
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`File upload to staged target failed (${uploadRes.status}): ${errText}`);
  }
  console.log(`[printful] Step 2 done. File uploaded to staged target.`);
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
        originalSource: target.resourceUrl
      }]
    }
  });
  const fileCreateRes = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json"
    },
    body: fileCreateQuery
  });
  if (!fileCreateRes.ok) {
    const errText = await fileCreateRes.text();
    throw new Error(`File create failed (${fileCreateRes.status}): ${errText}`);
  }
  const fileData = await fileCreateRes.json();
  const createdFile = (_h = (_g = (_f = fileData.data) == null ? void 0 : _f.fileCreate) == null ? void 0 : _g.files) == null ? void 0 : _h[0];
  const fileErrors = (_j = (_i = fileData.data) == null ? void 0 : _i.fileCreate) == null ? void 0 : _j.userErrors;
  if (fileErrors && fileErrors.length > 0) {
    throw new Error(`File create errors: ${JSON.stringify(fileErrors)}`);
  }
  const cdnUrl = ((_k = createdFile == null ? void 0 : createdFile.image) == null ? void 0 : _k.url) || (createdFile == null ? void 0 : createdFile.url) || target.resourceUrl;
  console.log(`[printful] Step 3 done. CDN URL: ${cdnUrl}`);
  return cdnUrl;
}
async function savePrintFileToDb(localPath, orderId) {
  const ext = path.extname(localPath) || ".png";
  const uniqueFilename = `pf-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const fileBuffer = fs.readFileSync(localPath);
  const base64Data = fileBuffer.toString("base64");
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".pdf": "application/pdf"
  };
  const mimeType = mimeTypes[ext.toLowerCase()] || "image/png";
  await prisma.printFile.create({
    data: {
      filename: uniqueFilename,
      mimeType,
      data: base64Data,
      orderId: orderId || null
    }
  });
  console.log(`[printful] Print file also saved to DB: ${uniqueFilename} (${fileBuffer.length} bytes)`);
  return uniqueFilename;
}
const ALLOWED_THREAD_COLORS = EMBROIDERY_THREAD_COLORS.map((tc) => tc.hex);
function normalizeThreadColor(color) {
  const upper = color.toUpperCase();
  if (ALLOWED_THREAD_COLORS.includes(upper)) {
    return upper;
  }
  console.log(
    `[printful] Thread color ${color} not in allowed list, defaulting to #000000`
  );
  return "#000000";
}
async function resolvePrintfulVariantId(base, shopifyVariantId, shopifyOrder) {
  let variantColor = "";
  let variantSize = "";
  for (const lineItem of shopifyOrder.line_items || []) {
    if (String(lineItem.variant_id) === shopifyVariantId) {
      const parts = (lineItem.variant_title || "").split("/").map((s) => s.trim());
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
        (v) => {
          var _a2, _b;
          return ((_a2 = v.color) == null ? void 0 : _a2.toLowerCase()) === variantColor.toLowerCase() && ((_b = v.size) == null ? void 0 : _b.toLowerCase()) === variantSize.toLowerCase();
        }
      );
      if (match) {
        console.log(
          `[printful] Matched shirt variant: ${match.color} ${match.size} → ${match.id}`
        );
        return match.id;
      }
      const colorMatch = variants.find(
        (v) => {
          var _a2;
          return ((_a2 = v.color) == null ? void 0 : _a2.toLowerCase()) === variantColor.toLowerCase();
        }
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
function getPlacementConfig(placementKey) {
  const mapping = {
    embroidery_front: {
      fileType: "embroidery_front",
      threadColorsOptionId: "thread_colors"
    },
    embroidery_front_large: {
      fileType: "embroidery_front_large",
      threadColorsOptionId: "thread_colors"
    },
    embroidery_chest_left: {
      fileType: "embroidery_chest_left",
      threadColorsOptionId: "thread_colors_chest_left"
    },
    embroidery_chest_center: {
      fileType: "embroidery_chest_center",
      threadColorsOptionId: "thread_colors_chest_center"
    },
    embroidery_large_front: {
      fileType: "embroidery_large_front",
      threadColorsOptionId: "thread_colors_large_front"
    },
    front: { fileType: "front", threadColorsOptionId: null },
    front_dtf: { fileType: "front", threadColorsOptionId: null }
  };
  return mapping[placementKey] || {
    fileType: placementKey,
    threadColorsOptionId: null
  };
}
async function processPersonalizedOrder(recordId, shopifyOrder) {
  var _a2, _b, _c, _d;
  console.log(`[printful] ═══════════════════════════════════════════════`);
  console.log(`[printful] Processing personalization order ${recordId}...`);
  try {
    const record = await prisma.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "generating" }
    });
    console.log(`[printful] Order: ${record.shopifyOrderName}`);
    console.log(`[printful] Shop: ${record.shop}`);
    console.log(`[printful] Product base: ${record.productBaseSlug || "legacy"}`);
    console.log(`[printful] Technique: ${record.technique || "embroidery"}`);
    console.log(`[printful] Monogram: "${record.monogramText}" (${record.monogramStyle})`);
    const isTemplateBased = !!record.productBaseSlug && !!record.technique;
    let printFilePath;
    let base;
    let technique;
    let placementKey;
    let threadColor;
    if (isTemplateBased) {
      base = getProductBase(record.productBaseSlug);
      technique = record.technique;
      placementKey = record.placementKey || "embroidery_front";
      let persData = {};
      try {
        persData = JSON.parse(record.personalizationData || "{}");
      } catch {
        console.error("[printful] Failed to parse personalizationData");
      }
      const layers = (persData.layers || []).map((l) => ({
        key: l.key || "text",
        type: l.type || "text",
        value: (l.text || l.value || "").toUpperCase().replace(/[^A-Z0-9 ]/g, ""),
        font: l.font || "block",
        color: l.color || "#000000",
        position: l.position || { x: 10, y: 10, width: 80, height: 80 }
      }));
      if (layers.length === 0 && record.monogramText) {
        layers.push({
          key: "monogram_text",
          type: "text",
          value: record.monogramText,
          font: record.monogramStyle || "block",
          color: record.threadColor || "#000000",
          position: { x: 10, y: 10, width: 80, height: 80 }
        });
      }
      threadColor = ((_a2 = layers.find((l) => l.type === "text")) == null ? void 0 : _a2.color) || "#000000";
      console.log(`[printful] Generating print file with ${layers.length} layers`);
      printFilePath = await generatePrintFileAsync({
        productBaseSlug: record.productBaseSlug,
        technique,
        placementKey,
        layers
      });
    } else {
      base = getProductBase("yupoong-6245cm");
      technique = "embroidery";
      placementKey = "embroidery_front";
      threadColor = record.threadColor || "#000000";
      console.log(`[printful] Legacy monogram: "${record.monogramText}" style=${record.monogramStyle} color=${threadColor}`);
      printFilePath = generateMonogram({
        text: record.monogramText || "ABC",
        style: record.monogramStyle || "script",
        color: threadColor
      });
    }
    console.log(`[printful] Print file generated: ${printFilePath}`);
    await prisma.personalizationOrder.update({
      where: { id: recordId },
      data: { status: "uploading" }
    });
    const orderFilename = `monogram-${record.shopifyOrderName.replace("#", "")}-${Date.now()}.png`;
    let printFileUrl;
    try {
      printFileUrl = await uploadToShopifyCDN(
        printFilePath,
        record.shop,
        orderFilename
      );
      console.log(`[printful] ✓ Uploaded to Shopify CDN: ${printFileUrl}`);
    } catch (cdnError) {
      console.error(`[printful] Shopify CDN upload failed: ${cdnError.message}`);
      console.log(`[printful] Falling back to DB storage...`);
      const APP_URL2 = process.env.SHOPIFY_APP_URL || process.env.APP_URL || "https://printful-custom-production.up.railway.app";
      const dbFilename = await savePrintFileToDb(printFilePath, recordId);
      printFileUrl = `${APP_URL2}/api/print-files/${dbFilename}`;
    }
    await savePrintFileToDb(printFilePath, recordId);
    let printfulFileId = null;
    try {
      console.log(`[printful] Uploading to Printful File Library: ${printFileUrl}`);
      const fileResult = await printfulRequest("/files", "POST", {
        url: printFileUrl,
        filename: orderFilename,
        visible: false
      });
      printfulFileId = ((_b = fileResult.result) == null ? void 0 : _b.id) || null;
      if (printfulFileId) {
        console.log(`[printful] ✓ Printful file ID: ${printfulFileId} (status: ${(_c = fileResult.result) == null ? void 0 : _c.status})`);
      }
    } catch (fileErr) {
      console.error(`[printful] Printful file library upload failed: ${fileErr.message}`);
    }
    let printfulVariantId;
    if (base) {
      printfulVariantId = await resolvePrintfulVariantId(
        base,
        record.shopifyVariantId,
        shopifyOrder
      );
    } else {
      printfulVariantId = 7853;
    }
    console.log(`[printful] Resolved variant ID: ${printfulVariantId}`);
    await prisma.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printFileUrl,
        printfulFileId: printfulFileId ? String(printfulFileId) : null,
        printfulVariantId,
        status: "submitting"
      }
    });
    const shipping = shopifyOrder.shipping_address || {};
    const { fileType, threadColorsOptionId } = getPlacementConfig(placementKey);
    const normalizedColor = normalizeThreadColor(threadColor);
    console.log(`[printful] File type: ${fileType}`);
    console.log(`[printful] Thread color: ${normalizedColor}`);
    console.log(`[printful] Print file URL: ${printFileUrl}`);
    if (printfulFileId) {
      console.log(`[printful] Printful file ID: ${printfulFileId}`);
    }
    const fileRef = { type: fileType };
    if (printfulFileId) {
      fileRef.id = printfulFileId;
    } else {
      fileRef.url = printFileUrl;
    }
    const itemPayload = {
      external_id: record.shopifyVariantId,
      variant_id: printfulVariantId,
      quantity: 1,
      files: [fileRef]
    };
    if (technique === "embroidery" && threadColorsOptionId) {
      itemPayload.options = [
        {
          id: threadColorsOptionId,
          value: [normalizedColor]
        }
      ];
    }
    const recipientName = `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim() || "Customer";
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
        email: shopifyOrder.email || ""
      },
      items: [itemPayload]
    };
    console.log(
      `[printful] Submitting order to Printful: variant=${printfulVariantId}, file=${fileType}, technique=${technique}`
    );
    console.log(
      `[printful] Recipient: ${recipientName}, ${shipping.city || "?"}, ${shipping.province_code || "?"} ${shipping.zip || "?"}`
    );
    const orderResult = await printfulRequest(
      "/orders",
      "POST",
      printfulOrderBody
    );
    const printfulOrderId = String(orderResult.result.id);
    const printfulStatus = orderResult.result.status;
    await prisma.personalizationOrder.update({
      where: { id: recordId },
      data: {
        printfulOrderId,
        printfulStatus,
        status: "completed"
      }
    });
    console.log(
      `[printful] ✓ Order ${recordId} completed → Printful #${printfulOrderId} (${printfulStatus})`
    );
    console.log(
      `[printful] Dashboard: https://www.printful.com/dashboard?order_id=${printfulOrderId}`
    );
    console.log(`[printful] ═══════════════════════════════════════════════`);
    try {
      fs.unlinkSync(printFilePath);
    } catch {
    }
  } catch (error) {
    console.error(
      `[printful] ✗ Error processing order ${recordId}:`,
      error.message
    );
    console.error(`[printful] Stack:`, error.stack);
    console.log(`[printful] ═══════════════════════════════════════════════`);
    await prisma.personalizationOrder.update({
      where: { id: recordId },
      data: {
        status: "failed",
        errorMessage: ((_d = error.message) == null ? void 0 : _d.substring(0, 500)) || "Unknown error"
      }
    });
  }
}
const action$3 = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[webhook] Received ${topic} for ${shop}`);
  const order = payload;
  const orderId = String(order.id);
  const orderName = order.name || `#${order.order_number}`;
  for (const lineItem of order.line_items || []) {
    const properties = {};
    for (const prop of lineItem.properties || []) {
      if (prop.name && prop.value) {
        properties[prop.name] = prop.value;
      }
    }
    const personalizationData = properties["_personalization_data"];
    const templateId = properties["_template_id"];
    const productBaseSlug = properties["_product_base"];
    const technique = properties["_technique"];
    const placementKey = properties["_placement"];
    const monogramText = properties["_monogram_text"];
    const monogramStyle = properties["_monogram_style"] || "script";
    const threadColor = properties["_thread_color"] || "#000000";
    if (!personalizationData && !monogramText) {
      continue;
    }
    const variantId = String(lineItem.variant_id);
    console.log(`[webhook] Found personalized item in order ${orderName}:`);
    if (templateId) {
      console.log(`  Template: ${templateId}, Base: ${productBaseSlug}, Technique: ${technique}, Placement: ${placementKey}`);
    }
    if (monogramText) {
      console.log(`  Monogram: "${monogramText}" (${monogramStyle}, ${threadColor})`);
    }
    const existing = await prisma.personalizationOrder.findFirst({
      where: {
        shopifyOrderId: orderId,
        shopifyVariantId: variantId,
        ...monogramText ? { monogramText } : {},
        ...templateId ? { templateId } : {}
      }
    });
    if (existing) {
      console.log(`[webhook] Duplicate detected for order ${orderId}, skipping`);
      continue;
    }
    const record = await prisma.personalizationOrder.create({
      data: {
        shop,
        shopifyOrderId: orderId,
        shopifyOrderName: orderName,
        shopifyVariantId: variantId,
        customerEmail: order.email || null,
        customerName: order.shipping_address ? `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim() : null,
        // New template fields
        templateId: templateId || null,
        productBaseSlug: productBaseSlug || null,
        technique: technique || null,
        placementKey: placementKey || null,
        personalizationData: personalizationData || "{}",
        // Legacy fields (always populated for backward compat)
        monogramText: monogramText || null,
        monogramStyle,
        threadColor,
        status: "pending"
      }
    });
    console.log(`[webhook] Created PersonalizationOrder ${record.id} for order ${orderName}`);
    processPersonalizedOrder(record.id, order).catch((err) => {
      console.error(`[webhook] Error processing order ${record.id}:`, err);
    });
  }
  return new Response();
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const action$2 = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    console.error("[printful-webhook] Failed to parse request body");
    return new Response("Bad request", { status: 400 });
  }
  const eventType = body.type;
  const data = body.data || {};
  console.log(`[printful-webhook] ═══════════════════════════════════════`);
  console.log(`[printful-webhook] Received event: ${eventType}`);
  console.log(`[printful-webhook] Retries: ${body.retries || 0}`);
  try {
    switch (eventType) {
      case "package_shipped":
        await handlePackageShipped(data);
        break;
      case "order_updated":
        await handleOrderUpdated(data);
        break;
      case "order_failed":
        await handleOrderFailed(data);
        break;
      default:
        console.log(`[printful-webhook] Unhandled event type: ${eventType}`);
    }
  } catch (error) {
    console.error(
      `[printful-webhook] Error handling ${eventType}:`,
      error.message
    );
    console.error(`[printful-webhook] Stack:`, error.stack);
  }
  console.log(`[printful-webhook] ═══════════════════════════════════════`);
  return new Response("OK", { status: 200 });
};
async function handlePackageShipped(data) {
  const shipment = data.shipment || {};
  const order = data.order || {};
  const printfulOrderId = String(order.id || "");
  const externalId = order.external_id || "";
  const trackingNumber = shipment.tracking_number || "";
  const trackingUrl = shipment.tracking_url || "";
  const carrier = shipment.carrier || "";
  const service = shipment.service || "";
  console.log(`[printful-webhook] Package shipped!`);
  console.log(`[printful-webhook]   Printful order: ${printfulOrderId}`);
  console.log(`[printful-webhook]   External ID: ${externalId}`);
  console.log(`[printful-webhook]   Carrier: ${carrier} (${service})`);
  console.log(`[printful-webhook]   Tracking: ${trackingNumber}`);
  console.log(`[printful-webhook]   Tracking URL: ${trackingUrl}`);
  let record = await prisma.personalizationOrder.findFirst({
    where: { printfulOrderId }
  });
  if (!record && externalId) {
    const shopifyOrderId = externalId.replace("shopify-", "");
    record = await prisma.personalizationOrder.findFirst({
      where: { shopifyOrderId }
    });
  }
  if (!record) {
    console.log(
      `[printful-webhook] No PersonalizationOrder found for Printful order ${printfulOrderId}`
    );
    return;
  }
  console.log(
    `[printful-webhook] Found order record: ${record.id} (Shopify: ${record.shopifyOrderName})`
  );
  await prisma.personalizationOrder.update({
    where: { id: record.id },
    data: {
      printfulStatus: "shipped"
    }
  });
  await syncTrackingToShopify(record, {
    trackingNumber,
    trackingUrl,
    carrier
  });
}
async function handleOrderUpdated(data) {
  const order = data.order || {};
  const printfulOrderId = String(order.id || "");
  const status = order.status || "";
  console.log(
    `[printful-webhook] Order updated: ${printfulOrderId} → ${status}`
  );
  if (!printfulOrderId) return;
  const record = await prisma.personalizationOrder.findFirst({
    where: { printfulOrderId }
  });
  if (record) {
    await prisma.personalizationOrder.update({
      where: { id: record.id },
      data: { printfulStatus: status }
    });
    console.log(
      `[printful-webhook] Updated record ${record.id} status to "${status}"`
    );
  }
}
async function handleOrderFailed(data) {
  const order = data.order || {};
  const printfulOrderId = String(order.id || "");
  const reason = data.reason || "Unknown reason";
  console.error(
    `[printful-webhook] Order FAILED: ${printfulOrderId} — ${reason}`
  );
  if (!printfulOrderId) return;
  const record = await prisma.personalizationOrder.findFirst({
    where: { printfulOrderId }
  });
  if (record) {
    await prisma.personalizationOrder.update({
      where: { id: record.id },
      data: {
        printfulStatus: "failed",
        errorMessage: `Printful order failed: ${reason}`.substring(0, 500)
      }
    });
  }
}
async function syncTrackingToShopify(record, tracking) {
  var _a2;
  console.log(
    `[printful-webhook] Syncing tracking to Shopify for ${record.shopifyOrderName}...`
  );
  try {
    const session = await prisma.session.findFirst({
      where: {
        shop: record.shop,
        isOnline: false
      }
    });
    if (!session) {
      console.error(
        `[printful-webhook] No offline session found for shop ${record.shop}`
      );
      return;
    }
    const shopDomain = record.shop;
    const accessToken = session.accessToken;
    const apiVersion = "2025-01";
    const carrierMap = {
      USPS: "USPS",
      "FEDEX": "FedEx",
      "UPS": "UPS",
      "DHL": "DHL Express",
      "DHL_EXPRESS": "DHL Express",
      "CANADA_POST": "Canada Post",
      "ROYAL_MAIL": "Royal Mail"
    };
    const shopifyCarrier = carrierMap[tracking.carrier.toUpperCase()] || tracking.carrier;
    const fulfillmentOrdersUrl = `https://${shopDomain}/admin/api/${apiVersion}/orders/${record.shopifyOrderId}/fulfillment_orders.json`;
    console.log(
      `[printful-webhook] Fetching fulfillment orders: ${fulfillmentOrdersUrl}`
    );
    const foResponse = await fetch(fulfillmentOrdersUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json"
      }
    });
    if (!foResponse.ok) {
      const errText = await foResponse.text();
      console.error(
        `[printful-webhook] Failed to get fulfillment orders (${foResponse.status}): ${errText}`
      );
      return;
    }
    const foData = await foResponse.json();
    const fulfillmentOrders = foData.fulfillment_orders || [];
    const openFOs = fulfillmentOrders.filter(
      (fo) => fo.status === "open" || fo.status === "in_progress"
    );
    if (openFOs.length === 0) {
      console.log(
        `[printful-webhook] No open fulfillment orders found — order may already be fulfilled`
      );
      return;
    }
    const fulfillmentUrl = `https://${shopDomain}/admin/api/${apiVersion}/fulfillments.json`;
    const fulfillmentBody = {
      fulfillment: {
        line_items_by_fulfillment_order: openFOs.map((fo) => ({
          fulfillment_order_id: fo.id
        })),
        tracking_info: {
          number: tracking.trackingNumber,
          url: tracking.trackingUrl,
          company: shopifyCarrier
        },
        notify_customer: true
      }
    };
    console.log(
      `[printful-webhook] Creating fulfillment with tracking: ${tracking.trackingNumber} (${shopifyCarrier})`
    );
    const fulfillResponse = await fetch(fulfillmentUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(fulfillmentBody)
    });
    if (!fulfillResponse.ok) {
      const errText = await fulfillResponse.text();
      console.error(
        `[printful-webhook] Failed to create fulfillment (${fulfillResponse.status}): ${errText}`
      );
      return;
    }
    const fulfillData = await fulfillResponse.json();
    const fulfillmentId = (_a2 = fulfillData.fulfillment) == null ? void 0 : _a2.id;
    console.log(
      `[printful-webhook] ✓ Fulfillment created: ${fulfillmentId}`
    );
    console.log(
      `[printful-webhook] ✓ Tracking synced to Shopify for ${record.shopifyOrderName}`
    );
    console.log(
      `[printful-webhook]   Customer will receive shipping notification email`
    );
  } catch (error) {
    console.error(
      `[printful-webhook] Error syncing tracking to Shopify:`,
      error.message
    );
  }
}
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$a = async ({ request }) => {
  const headers2 = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };
  try {
    const templates = await prisma.productTemplate.findMany({
      include: {
        layers: { select: { id: true, layerType: true, label: true } },
        mockupImages: { select: { id: true, variantColor: true, imageUrl: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return new Response(
      JSON.stringify({
        count: templates.length,
        templates: templates.map((t) => ({
          id: t.id,
          shop: t.shop,
          shopifyProductId: t.shopifyProductId,
          numericProductId: t.shopifyProductId.includes("/") ? t.shopifyProductId.split("/").pop() : t.shopifyProductId,
          productTitle: t.productTitle,
          productHandle: t.productHandle,
          productBaseSlug: t.productBaseSlug,
          technique: t.technique,
          placementKey: t.placementKey,
          isActive: t.isActive,
          layerCount: t.layers.length,
          mockupCount: t.mockupImages.length,
          mockups: t.mockupImages,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt
        }))
      }, null, 2),
      { status: 200, headers: headers2 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal error", details: error.message }),
      { status: 500, headers: headers2 }
    );
  }
};
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
const loader$9 = async ({ params }) => {
  const fileId = params.id;
  if (!fileId) {
    return new Response("Not found", { status: 404 });
  }
  const printFile = await prisma.printFile.findUnique({
    where: { filename: fileId }
  });
  if (!printFile) {
    console.log(`[print-files] File not found in DB: ${fileId}`);
    return new Response("Not found", { status: 404 });
  }
  const fileBuffer = Buffer.from(printFile.data, "base64");
  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": printFile.mimeType,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*"
    }
  });
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$9
}, Symbol.toStringTag, { value: "Module" }));
const loader$8 = async ({ request }) => {
  const orders = await prisma.personalizationOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return json({
    count: orders.length,
    orders: orders.map((o) => ({
      id: o.id,
      shop: o.shop,
      shopifyOrderId: o.shopifyOrderId,
      shopifyOrderName: o.shopifyOrderName,
      monogramText: o.monogramText,
      monogramStyle: o.monogramStyle,
      threadColor: o.threadColor,
      productBaseSlug: o.productBaseSlug,
      technique: o.technique,
      status: o.status,
      errorMessage: o.errorMessage,
      printFileUrl: o.printFileUrl,
      printfulOrderId: o.printfulOrderId,
      printfulStatus: o.printfulStatus,
      printfulVariantId: o.printfulVariantId,
      createdAt: o.createdAt
    }))
  });
};
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
function extractNumericId(id) {
  if (id.startsWith("gid://")) {
    const parts = id.split("/");
    return parts[parts.length - 1];
  }
  return id;
}
const loader$7 = async ({ request }) => {
  var _a2, _b, _c;
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id") || "";
  const variantId = url.searchParams.get("variant_id") || "";
  const handle = url.searchParams.get("handle") || "";
  const shop = url.searchParams.get("shop") || "";
  const headers2 = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60"
  };
  if (!productId && !handle) {
    return new Response(
      JSON.stringify({ error: "Missing product_id or handle" }),
      { status: 400, headers: headers2 }
    );
  }
  const numericId = productId ? extractNumericId(productId) : "";
  const gidProductId = numericId ? `gid://shopify/Product/${numericId}` : "";
  const gidVariantId = variantId ? `gid://shopify/ProductVariant/${extractNumericId(variantId)}` : null;
  try {
    let template = null;
    const includeRelations = {
      layers: { orderBy: { sortOrder: "asc" } },
      mockupImages: { orderBy: { sortOrder: "asc" } }
    };
    if (shop && gidProductId) {
      template = await prisma.productTemplate.findFirst({
        where: { shopifyProductId: gidProductId, shop, isActive: true },
        include: includeRelations
      });
    }
    if (!template && gidProductId) {
      template = await prisma.productTemplate.findFirst({
        where: { shopifyProductId: gidProductId, isActive: true },
        include: includeRelations
      });
    }
    if (!template && numericId) {
      template = await prisma.productTemplate.findFirst({
        where: { shopifyProductId: numericId, isActive: true },
        include: includeRelations
      });
    }
    if (!template && numericId) {
      template = await prisma.productTemplate.findFirst({
        where: { shopifyProductId: { contains: numericId }, isActive: true },
        include: includeRelations
      });
    }
    if (!template && handle) {
      template = await prisma.productTemplate.findFirst({
        where: { productHandle: handle, isActive: true },
        include: includeRelations
      });
      if (template) {
        console.log(
          `[API] Product matched by handle "${handle}" — stored GID: ${template.shopifyProductId}, requested ID: ${productId}`
        );
      }
    }
    if (!template && handle) {
      const titleGuess = handle.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      template = await prisma.productTemplate.findFirst({
        where: { productTitle: titleGuess, isActive: true },
        include: includeRelations
      });
      if (template) {
        console.log(
          `[API] Product matched by title guess "${titleGuess}" — stored GID: ${template.shopifyProductId}`
        );
      }
    }
    if (!template) {
      const allTemplates = await prisma.productTemplate.findMany({
        select: { id: true, shopifyProductId: true, productTitle: true, productHandle: true, shop: true, isActive: true },
        take: 20
      });
      return new Response(
        JSON.stringify({
          found: false,
          debug: {
            searchedGid: gidProductId,
            searchedNumeric: numericId,
            searchedHandle: handle,
            shop: shop || "(none)",
            allTemplatesInDb: allTemplates.map((t) => ({
              id: t.id,
              shopifyProductId: t.shopifyProductId,
              numericId: t.shopifyProductId.includes("/") ? t.shopifyProductId.split("/").pop() : t.shopifyProductId,
              productTitle: t.productTitle,
              productHandle: t.productHandle,
              shop: t.shop,
              isActive: t.isActive
            }))
          }
        }),
        { status: 200, headers: headers2 }
      );
    }
    const productBase = getProductBase(template.productBaseSlug);
    if (!productBase) {
      return new Response(
        JSON.stringify({ found: false, error: "Product base not found in registry" }),
        { status: 200, headers: headers2 }
      );
    }
    const placementSpec = productBase.placements.find(
      (p) => p.placementKey === template.placementKey
    );
    let enabledFontKeys = [];
    try {
      const parsed = JSON.parse(template.enabledFonts);
      if (Array.isArray(parsed) && parsed.length > 0) {
        enabledFontKeys = parsed;
      }
    } catch {
    }
    const enabledFonts = enabledFontKeys.length > 0 ? AVAILABLE_FONTS.filter((f) => enabledFontKeys.includes(f.key)) : [...AVAILABLE_FONTS];
    let enabledColorHexes = [];
    try {
      enabledColorHexes = JSON.parse(template.enabledThreadColors);
    } catch {
      enabledColorHexes = [];
    }
    const threadColors = enabledColorHexes.length > 0 ? EMBROIDERY_THREAD_COLORS.filter(
      (c) => enabledColorHexes.includes(c.hex)
    ) : [...EMBROIDERY_THREAD_COLORS];
    let enabledVariantColors = [];
    try {
      enabledVariantColors = JSON.parse(template.enabledVariantColors);
    } catch {
      enabledVariantColors = [];
    }
    const variants = enabledVariantColors.length > 0 ? productBase.variants.filter(
      (v) => enabledVariantColors.includes(v.color)
    ) : productBase.variants;
    let currentMockupUrl = null;
    const variantImageMap = {};
    if (productBase.variantMockups) {
      for (const [colorName, url2] of Object.entries(productBase.variantMockups)) {
        variantImageMap[colorName] = url2;
        variantImageMap[colorName.toLowerCase()] = url2;
      }
      for (const variant of variants) {
        const mockupUrl = productBase.variantMockups[variant.color];
        if (mockupUrl) {
          variantImageMap[String(variant.printfulVariantId)] = mockupUrl;
        }
      }
    }
    for (const mockup of template.mockupImages) {
      if (mockup.shopifyVariantId) {
        variantImageMap[mockup.shopifyVariantId] = mockup.imageUrl;
        const numId = extractNumericId(mockup.shopifyVariantId);
        variantImageMap[numId] = mockup.imageUrl;
      }
      variantImageMap[mockup.variantColor] = mockup.imageUrl;
      variantImageMap[mockup.variantColor.toLowerCase()] = mockup.imageUrl;
    }
    if (gidVariantId) {
      currentMockupUrl = variantImageMap[gidVariantId] || variantImageMap[variantId] || variantImageMap[extractNumericId(variantId)] || null;
    }
    if (!currentMockupUrl) {
      const defaultMockup = template.mockupImages.find((m) => m.isDefault);
      currentMockupUrl = (defaultMockup == null ? void 0 : defaultMockup.imageUrl) || ((_a2 = template.mockupImages[0]) == null ? void 0 : _a2.imageUrl) || productBase.defaultMockupUrl || null;
    }
    const layers = template.layers.map((layer) => {
      let layerFonts = enabledFonts;
      if (layer.enabledFonts) {
        try {
          const layerFontKeys = JSON.parse(layer.enabledFonts);
          if (layerFontKeys.length > 0) {
            layerFonts = AVAILABLE_FONTS.filter(
              (f) => layerFontKeys.includes(f.key)
            );
          }
        } catch {
        }
      }
      return {
        id: layer.id,
        type: layer.layerType,
        label: layer.label,
        customerEditable: layer.customerEditable,
        position: {
          x: layer.positionX,
          y: layer.positionY,
          width: layer.positionWidth,
          height: layer.positionHeight
        },
        sortOrder: layer.sortOrder,
        // Text layer options
        maxChars: layer.maxChars,
        placeholder: layer.placeholder,
        fonts: layer.layerType === "text" ? layerFonts : void 0,
        defaultFont: layer.defaultFont,
        defaultColor: layer.defaultColor,
        // Image layer options
        acceptedFileTypes: layer.acceptedFileTypes ? JSON.parse(layer.acceptedFileTypes) : void 0,
        maxFileSizeMb: layer.maxFileSizeMb,
        // Fixed image layer options
        fixedImageUrl: layer.fixedImageUrl
      };
    });
    return new Response(
      JSON.stringify({
        found: true,
        template: {
          id: template.id,
          productBaseSlug: template.productBaseSlug,
          productBaseName: productBase.name,
          brand: productBase.brand,
          category: productBase.category,
          technique: template.technique,
          placementKey: template.placementKey,
          placementName: (placementSpec == null ? void 0 : placementSpec.displayName) || template.placementKey,
          printArea: {
            x: template.printAreaX,
            y: template.printAreaY,
            width: template.printAreaWidth,
            height: template.printAreaHeight
          },
          printFileSize: placementSpec ? {
            width: placementSpec.fileSizePx.width,
            height: placementSpec.fileSizePx.height,
            dpi: placementSpec.dpi
          } : null,
          layers,
          fonts: enabledFonts,
          threadColors: template.technique === "embroidery" ? threadColors : [],
          variants,
          currentMockupUrl,
          variantImages: variantImageMap,
          defaultMockupUrl: ((_b = template.mockupImages.find((m) => m.isDefault)) == null ? void 0 : _b.imageUrl) || ((_c = template.mockupImages[0]) == null ? void 0 : _c.imageUrl) || productBase.defaultMockupUrl || null
        }
      }),
      { status: 200, headers: headers2 }
    );
  } catch (error) {
    console.error("Product template API error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", details: error.message }),
      { status: 500, headers: headers2 }
    );
  }
};
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const fontsDir = path.join(process.cwd(), "app", "fonts");
if (!process.env.FONTCONFIG_PATH) {
  process.env.FONTCONFIG_PATH = fontsDir;
}
let _sharp = null;
async function getSharp() {
  if (!_sharp) {
    process.env.FONTCONFIG_PATH = fontsDir;
    _sharp = await import("sharp");
  }
  return _sharp.default;
}
const PREVIEW_SIZE_FULL = 600;
const PREVIEW_SIZE_THUMB = 300;
const CACHE_MAX_ENTRIES = 200;
const MOCKUP_CACHE_MAX = 50;
const SVG_FONT_MAP = {
  script: "Great Vibes",
  block: "Oswald",
  serif: "Playfair Display",
  sans: "Montserrat",
  monogram_classic: "Cormorant Garamond"
};
const previewCache = /* @__PURE__ */ new Map();
const mockupCache = /* @__PURE__ */ new Map();
function evictOldest(cache, maxEntries) {
  if (cache.size <= maxEntries) return;
  const excess = cache.size - maxEntries;
  let count = 0;
  for (const key of cache.keys()) {
    if (count >= excess) break;
    cache.delete(key);
    count++;
  }
}
function buildCacheKey(text2, style, color, handle, colorName, size) {
  return `${text2}|${style}|${color}|${handle}|${colorName}|${size}`;
}
function svgEscape(text2) {
  return text2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function buildTextSvg(text2, style, color, paX, paY, paW, paH, previewSize) {
  const fontFamily = SVG_FONT_MAP[style] || "Montserrat";
  const isScript = style === "script";
  const centerX = paX + paW / 2;
  const centerY = paY + paH / 2;
  let textElements = "";
  const baseline = 'dominant-baseline="central"';
  const anchor = 'text-anchor="middle"';
  const fill = `fill="${svgEscape(color)}"`;
  const weight = isScript ? "" : ' font-weight="bold"';
  if (text2.length === 3 && !isScript && style !== "sans") {
    const bigSize = Math.min(paW * 0.45, paH * 0.75);
    const smallSize = bigSize * 0.65;
    const spacing = paW * 0.28;
    const first = svgEscape(text2[0]);
    const last = svgEscape(text2[1]);
    const middle = svgEscape(text2[2]);
    textElements += `<text x="${centerX}" y="${centerY}" font-family="${fontFamily}" font-size="${Math.round(bigSize)}"${weight} ${fill} ${anchor} ${baseline}>${last}</text>`;
    textElements += `<text x="${centerX - spacing}" y="${centerY + bigSize * 0.03}" font-family="${fontFamily}" font-size="${Math.round(smallSize)}"${weight} ${fill} ${anchor} ${baseline}>${first}</text>`;
    textElements += `<text x="${centerX + spacing}" y="${centerY + bigSize * 0.03}" font-family="${fontFamily}" font-size="${Math.round(smallSize)}"${weight} ${fill} ${anchor} ${baseline}>${middle}</text>`;
  } else {
    const fontSize = isScript ? Math.min(paW * 0.5, paH * 0.7) : Math.min(paW * 0.4, paH * 0.6);
    const escaped = svgEscape(text2);
    textElements = `<text x="${centerX}" y="${centerY}" font-family="${fontFamily}" font-size="${Math.round(fontSize)}"${weight} ${fill} ${anchor} ${baseline}>${escaped}</text>`;
  }
  return `<svg width="${previewSize}" height="${previewSize}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="1" dy="1" stdDeviation="1" flood-color="rgba(0,0,0,0.12)" />
    </filter>
  </defs>
  <g filter="url(#shadow)">
    ${textElements}
  </g>
</svg>`;
}
function buildSilhouetteSvg(previewSize) {
  const w = previewSize;
  const h = previewSize;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${w}" height="${h}" fill="#f5f5f5"/>
  <path d="M${w * 0.15},${h * 0.55} Q${w * 0.15},${h * 0.12} ${w * 0.5},${h * 0.1} Q${w * 0.85},${h * 0.12} ${w * 0.85},${h * 0.55} Z" fill="#e8e8e8" stroke="#ccc" stroke-width="1"/>
  <path d="M${w * 0.05},${h * 0.58} Q${w * 0.5},${h * 0.5} ${w * 0.95},${h * 0.58} Q${w * 0.5},${h * 0.68} ${w * 0.05},${h * 0.58} Z" fill="#ddd" stroke="#ccc" stroke-width="1"/>
</svg>`;
}
async function getCachedMockup(sharpFn, imageUrl, previewSize) {
  const cacheKey = `${imageUrl}|${previewSize}`;
  const cached = mockupCache.get(cacheKey);
  if (cached) {
    return { resized: cached.buffer, srcW: cached.metadata.width, srcH: cached.metadata.height };
  }
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} for ${imageUrl}`);
  const imgBuf = Buffer.from(await resp.arrayBuffer());
  const metadata = await sharpFn(imgBuf).metadata();
  const srcW = metadata.width || previewSize;
  const srcH = metadata.height || previewSize;
  const resized = await sharpFn(imgBuf).resize(previewSize, previewSize, {
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  }).png().toBuffer();
  mockupCache.set(cacheKey, {
    buffer: resized,
    metadata: { width: srcW, height: srcH },
    timestamp: Date.now()
  });
  evictOldest(mockupCache, MOCKUP_CACHE_MAX);
  return { resized, srcW, srcH };
}
const loader$6 = async ({ request }) => {
  var _a2, _b;
  const url = new URL(request.url);
  const text2 = (url.searchParams.get("text") || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 10);
  const style = url.searchParams.get("style") || "block";
  const color = url.searchParams.get("color") || "#000000";
  const format = url.searchParams.get("format") || "image";
  const productId = url.searchParams.get("product_id") || "";
  const variantId = url.searchParams.get("variant_id") || "";
  const shop = url.searchParams.get("shop") || "";
  const colorName = url.searchParams.get("color_name") || "";
  const handle = url.searchParams.get("handle") || "";
  const sizeParam = url.searchParams.get("size") || "full";
  const previewSize = sizeParam === "thumb" ? PREVIEW_SIZE_THUMB : PREVIEW_SIZE_FULL;
  if (!text2) {
    return new Response(
      JSON.stringify({ error: "Missing text parameter" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
  const cacheKey = buildCacheKey(text2, style, color, handle || productId, colorName, previewSize);
  const cachedPreview = previewCache.get(cacheKey);
  if (cachedPreview && format === "image") {
    return new Response(cachedPreview.buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "X-Cache": "HIT"
      }
    });
  }
  let baseImageUrl = null;
  let printArea = { x: 25, y: 15, width: 50, height: 35 };
  if (productId || handle) {
    const numericProductId = productId ? productId.startsWith("gid://") ? productId.split("/").pop() : productId : "";
    const gidProductId = numericProductId ? `gid://shopify/Product/${numericProductId}` : "";
    const gidVariantId = variantId ? `gid://shopify/ProductVariant/${variantId.startsWith("gid://") ? variantId.split("/").pop() : variantId}` : null;
    try {
      const includeOpts = {
        mockupImages: { orderBy: { sortOrder: "asc" } }
      };
      let template = (gidProductId ? await prisma.productTemplate.findFirst({
        where: { shopifyProductId: gidProductId, isActive: true, ...shop ? { shop } : {} },
        include: includeOpts
      }) : null) || (gidProductId ? await prisma.productTemplate.findFirst({
        where: { shopifyProductId: gidProductId, isActive: true },
        include: includeOpts
      }) : null) || (numericProductId ? await prisma.productTemplate.findFirst({
        where: { shopifyProductId: numericProductId, isActive: true },
        include: includeOpts
      }) : null) || (numericProductId ? await prisma.productTemplate.findFirst({
        where: { shopifyProductId: { contains: numericProductId }, isActive: true },
        include: includeOpts
      }) : null) || (handle ? await prisma.productTemplate.findFirst({
        where: { productHandle: handle, isActive: true },
        include: includeOpts
      }) : null);
      if (template) {
        printArea = {
          x: template.printAreaX,
          y: template.printAreaY,
          width: template.printAreaWidth,
          height: template.printAreaHeight
        };
        const productBase = getProductBase(template.productBaseSlug);
        if (template.mockupImages.length > 0) {
          let matchedImage = (colorName ? template.mockupImages.find(
            (img) => img.variantColor.toLowerCase() === colorName.toLowerCase()
          ) : null) || (gidVariantId ? template.mockupImages.find((img) => img.shopifyVariantId === gidVariantId) : null) || template.mockupImages.find((img) => img.isDefault) || template.mockupImages[0];
          if (matchedImage) {
            const isExactColorMatch = colorName && matchedImage.variantColor.toLowerCase() === colorName.toLowerCase();
            if (isExactColorMatch || !colorName) {
              baseImageUrl = matchedImage.imageUrl;
            } else {
              if (productBase == null ? void 0 : productBase.variantMockups) {
                const registryUrl = productBase.variantMockups[colorName] || ((_a2 = Object.entries(productBase.variantMockups).find(
                  ([k]) => k.toLowerCase() === colorName.toLowerCase()
                )) == null ? void 0 : _a2[1]);
                if (registryUrl) {
                  baseImageUrl = registryUrl;
                }
              }
              if (!baseImageUrl) {
                baseImageUrl = matchedImage.imageUrl;
              }
            }
          }
        }
        if (!baseImageUrl && colorName && (productBase == null ? void 0 : productBase.variantMockups)) {
          const registryUrl = productBase.variantMockups[colorName] || ((_b = Object.entries(productBase.variantMockups).find(
            ([k]) => k.toLowerCase() === colorName.toLowerCase()
          )) == null ? void 0 : _b[1]);
          if (registryUrl) {
            baseImageUrl = registryUrl;
          }
        }
        if (!baseImageUrl && (productBase == null ? void 0 : productBase.defaultMockupUrl)) {
          baseImageUrl = productBase.defaultMockupUrl;
        }
      }
    } catch (error) {
      console.error("[Preview] Error loading template:", error);
    }
  }
  const sharpFn = await getSharp();
  let outputBuffer;
  try {
    if (baseImageUrl) {
      const { resized: resizedBase, srcW, srcH } = await getCachedMockup(sharpFn, baseImageUrl, previewSize);
      const scale = Math.min(previewSize / srcW, previewSize / srcH);
      const scaledW = srcW * scale;
      const scaledH = srcH * scale;
      const offsetX = (previewSize - scaledW) / 2;
      const offsetY = (previewSize - scaledH) / 2;
      const paX = offsetX + scaledW * (printArea.x / 100);
      const paY = offsetY + scaledH * (printArea.y / 100);
      const paW = scaledW * (printArea.width / 100);
      const paH = scaledH * (printArea.height / 100);
      const textSvg = buildTextSvg(text2, style, color, paX, paY, paW, paH, previewSize);
      outputBuffer = await sharpFn(resizedBase).composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }]).jpeg({ quality: 80 }).toBuffer();
    } else {
      const silhouetteSvg = buildSilhouetteSvg(previewSize);
      const silhouetteBuffer = await sharpFn(Buffer.from(silhouetteSvg)).png().toBuffer();
      const paX = previewSize * 0.1;
      const paY = previewSize * 0.15;
      const paW = previewSize * 0.8;
      const paH = previewSize * 0.35;
      const textSvg = buildTextSvg(text2, style, color, paX, paY, paW, paH, previewSize);
      outputBuffer = await sharpFn(silhouetteBuffer).composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }]).jpeg({ quality: 80 }).toBuffer();
    }
  } catch (error) {
    console.error("[Preview] Image generation error:", error);
    const fallbackSvg = `<svg width="${previewSize}" height="${previewSize}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${previewSize}" height="${previewSize}" fill="#f5f5f5"/>
      <text x="${previewSize / 2}" y="${previewSize / 2}" font-family="sans-serif" font-size="60" font-weight="bold"
            fill="${svgEscape(color)}" text-anchor="middle" dominant-baseline="central">${svgEscape(text2)}</text>
    </svg>`;
    outputBuffer = await sharpFn(Buffer.from(fallbackSvg)).jpeg({ quality: 80 }).toBuffer();
  }
  previewCache.set(cacheKey, { buffer: outputBuffer, timestamp: Date.now() });
  evictOldest(previewCache, CACHE_MAX_ENTRIES);
  if (format === "json") {
    const params = new URLSearchParams({ text: text2, style, color, format: "image" });
    if (productId) params.set("product_id", productId);
    if (variantId) params.set("variant_id", variantId);
    if (handle) params.set("handle", handle);
    if (colorName) params.set("color_name", colorName);
    params.set("size", sizeParam);
    return new Response(
      JSON.stringify({ url: `/apps/api/preview?${params.toString()}` }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
  return new Response(outputBuffer, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Cache": "MISS"
    }
  });
};
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const Polaris = /* @__PURE__ */ JSON.parse('{"ActionMenu":{"Actions":{"moreActions":"More actions"},"RollupActions":{"rollupButton":"View actions"}},"ActionList":{"SearchField":{"clearButtonLabel":"Clear","search":"Search","placeholder":"Search actions"}},"Avatar":{"label":"Avatar","labelWithInitials":"Avatar with initials {initials}"},"Autocomplete":{"spinnerAccessibilityLabel":"Loading","ellipsis":"{content}…"},"Badge":{"PROGRESS_LABELS":{"incomplete":"Incomplete","partiallyComplete":"Partially complete","complete":"Complete"},"TONE_LABELS":{"info":"Info","success":"Success","warning":"Warning","critical":"Critical","attention":"Attention","new":"New","readOnly":"Read-only","enabled":"Enabled"},"progressAndTone":"{toneLabel} {progressLabel}"},"Banner":{"dismissButton":"Dismiss notification"},"Button":{"spinnerAccessibilityLabel":"Loading"},"Common":{"checkbox":"checkbox","undo":"Undo","cancel":"Cancel","clear":"Clear","close":"Close","submit":"Submit","more":"More"},"ContextualSaveBar":{"save":"Save","discard":"Discard"},"DataTable":{"sortAccessibilityLabel":"sort {direction} by","navAccessibilityLabel":"Scroll table {direction} one column","totalsRowHeading":"Totals","totalRowHeading":"Total"},"DatePicker":{"previousMonth":"Show previous month, {previousMonthName} {showPreviousYear}","nextMonth":"Show next month, {nextMonth} {nextYear}","today":"Today ","start":"Start of range","end":"End of range","months":{"january":"January","february":"February","march":"March","april":"April","may":"May","june":"June","july":"July","august":"August","september":"September","october":"October","november":"November","december":"December"},"days":{"monday":"Monday","tuesday":"Tuesday","wednesday":"Wednesday","thursday":"Thursday","friday":"Friday","saturday":"Saturday","sunday":"Sunday"},"daysAbbreviated":{"monday":"Mo","tuesday":"Tu","wednesday":"We","thursday":"Th","friday":"Fr","saturday":"Sa","sunday":"Su"}},"DiscardConfirmationModal":{"title":"Discard all unsaved changes","message":"If you discard changes, you’ll delete any edits you made since you last saved.","primaryAction":"Discard changes","secondaryAction":"Continue editing"},"DropZone":{"single":{"overlayTextFile":"Drop file to upload","overlayTextImage":"Drop image to upload","overlayTextVideo":"Drop video to upload","actionTitleFile":"Add file","actionTitleImage":"Add image","actionTitleVideo":"Add video","actionHintFile":"or drop file to upload","actionHintImage":"or drop image to upload","actionHintVideo":"or drop video to upload","labelFile":"Upload file","labelImage":"Upload image","labelVideo":"Upload video"},"allowMultiple":{"overlayTextFile":"Drop files to upload","overlayTextImage":"Drop images to upload","overlayTextVideo":"Drop videos to upload","actionTitleFile":"Add files","actionTitleImage":"Add images","actionTitleVideo":"Add videos","actionHintFile":"or drop files to upload","actionHintImage":"or drop images to upload","actionHintVideo":"or drop videos to upload","labelFile":"Upload files","labelImage":"Upload images","labelVideo":"Upload videos"},"errorOverlayTextFile":"File type is not valid","errorOverlayTextImage":"Image type is not valid","errorOverlayTextVideo":"Video type is not valid"},"EmptySearchResult":{"altText":"Empty search results"},"Frame":{"skipToContent":"Skip to content","navigationLabel":"Navigation","Navigation":{"closeMobileNavigationLabel":"Close navigation"}},"FullscreenBar":{"back":"Back","accessibilityLabel":"Exit fullscreen mode"},"Filters":{"moreFilters":"More filters","moreFiltersWithCount":"More filters ({count})","filter":"Filter {resourceName}","noFiltersApplied":"No filters applied","cancel":"Cancel","done":"Done","clearAllFilters":"Clear all filters","clear":"Clear","clearLabel":"Clear {filterName}","addFilter":"Add filter","clearFilters":"Clear all","searchInView":"in:{viewName}"},"FilterPill":{"clear":"Clear","unsavedChanges":"Unsaved changes - {label}"},"IndexFilters":{"searchFilterTooltip":"Search and filter","searchFilterTooltipWithShortcut":"Search and filter (F)","searchFilterAccessibilityLabel":"Search and filter results","sort":"Sort your results","addView":"Add a new view","newView":"Custom search","SortButton":{"ariaLabel":"Sort the results","tooltip":"Sort","title":"Sort by","sorting":{"asc":"Ascending","desc":"Descending","az":"A-Z","za":"Z-A"}},"EditColumnsButton":{"tooltip":"Edit columns","accessibilityLabel":"Customize table column order and visibility"},"UpdateButtons":{"cancel":"Cancel","update":"Update","save":"Save","saveAs":"Save as","modal":{"title":"Save view as","label":"Name","sameName":"A view with this name already exists. Please choose a different name.","save":"Save","cancel":"Cancel"}}},"IndexProvider":{"defaultItemSingular":"Item","defaultItemPlural":"Items","allItemsSelected":"All {itemsLength}+ {resourceNamePlural} are selected","selected":"{selectedItemsCount} selected","a11yCheckboxDeselectAllSingle":"Deselect {resourceNameSingular}","a11yCheckboxSelectAllSingle":"Select {resourceNameSingular}","a11yCheckboxDeselectAllMultiple":"Deselect all {itemsLength} {resourceNamePlural}","a11yCheckboxSelectAllMultiple":"Select all {itemsLength} {resourceNamePlural}"},"IndexTable":{"emptySearchTitle":"No {resourceNamePlural} found","emptySearchDescription":"Try changing the filters or search term","onboardingBadgeText":"New","resourceLoadingAccessibilityLabel":"Loading {resourceNamePlural}…","selectAllLabel":"Select all {resourceNamePlural}","selected":"{selectedItemsCount} selected","undo":"Undo","selectAllItems":"Select all {itemsLength}+ {resourceNamePlural}","selectItem":"Select {resourceName}","selectButtonText":"Select","sortAccessibilityLabel":"sort {direction} by"},"Loading":{"label":"Page loading bar"},"Modal":{"iFrameTitle":"body markup","modalWarning":"These required properties are missing from Modal: {missingProps}"},"Page":{"Header":{"rollupActionsLabel":"View actions for {title}","pageReadyAccessibilityLabel":"{title}. This page is ready"}},"Pagination":{"previous":"Previous","next":"Next","pagination":"Pagination"},"ProgressBar":{"negativeWarningMessage":"Values passed to the progress prop shouldn’t be negative. Resetting {progress} to 0.","exceedWarningMessage":"Values passed to the progress prop shouldn’t exceed 100. Setting {progress} to 100."},"ResourceList":{"sortingLabel":"Sort by","defaultItemSingular":"item","defaultItemPlural":"items","showing":"Showing {itemsCount} {resource}","showingTotalCount":"Showing {itemsCount} of {totalItemsCount} {resource}","loading":"Loading {resource}","selected":"{selectedItemsCount} selected","allItemsSelected":"All {itemsLength}+ {resourceNamePlural} in your store are selected","allFilteredItemsSelected":"All {itemsLength}+ {resourceNamePlural} in this filter are selected","selectAllItems":"Select all {itemsLength}+ {resourceNamePlural} in your store","selectAllFilteredItems":"Select all {itemsLength}+ {resourceNamePlural} in this filter","emptySearchResultTitle":"No {resourceNamePlural} found","emptySearchResultDescription":"Try changing the filters or search term","selectButtonText":"Select","a11yCheckboxDeselectAllSingle":"Deselect {resourceNameSingular}","a11yCheckboxSelectAllSingle":"Select {resourceNameSingular}","a11yCheckboxDeselectAllMultiple":"Deselect all {itemsLength} {resourceNamePlural}","a11yCheckboxSelectAllMultiple":"Select all {itemsLength} {resourceNamePlural}","Item":{"actionsDropdownLabel":"Actions for {accessibilityLabel}","actionsDropdown":"Actions dropdown","viewItem":"View details for {itemName}"},"BulkActions":{"actionsActivatorLabel":"Actions","moreActionsActivatorLabel":"More actions"}},"SkeletonPage":{"loadingLabel":"Page loading"},"Tabs":{"newViewAccessibilityLabel":"Create new view","newViewTooltip":"Create view","toggleTabsLabel":"More views","Tab":{"rename":"Rename view","duplicate":"Duplicate view","edit":"Edit view","editColumns":"Edit columns","delete":"Delete view","copy":"Copy of {name}","deleteModal":{"title":"Delete view?","description":"This can’t be undone. {viewName} view will no longer be available in your admin.","cancel":"Cancel","delete":"Delete view"}},"RenameModal":{"title":"Rename view","label":"Name","cancel":"Cancel","create":"Save","errors":{"sameName":"A view with this name already exists. Please choose a different name."}},"DuplicateModal":{"title":"Duplicate view","label":"Name","cancel":"Cancel","create":"Create view","errors":{"sameName":"A view with this name already exists. Please choose a different name."}},"CreateViewModal":{"title":"Create new view","label":"Name","cancel":"Cancel","create":"Create view","errors":{"sameName":"A view with this name already exists. Please choose a different name."}}},"Tag":{"ariaLabel":"Remove {children}"},"TextField":{"characterCount":"{count} characters","characterCountWithMaxLength":"{count} of {limit} characters used"},"TooltipOverlay":{"accessibilityLabel":"Tooltip: {label}"},"TopBar":{"toggleMenuLabel":"Toggle menu","SearchField":{"clearButtonLabel":"Clear","search":"Search"}},"MediaCard":{"dismissButton":"Dismiss","popoverButton":"Actions"},"VideoThumbnail":{"playButtonA11yLabel":{"default":"Play video","defaultWithDuration":"Play video of length {duration}","duration":{"hours":{"other":{"only":"{hourCount} hours","andMinutes":"{hourCount} hours and {minuteCount} minutes","andMinute":"{hourCount} hours and {minuteCount} minute","minutesAndSeconds":"{hourCount} hours, {minuteCount} minutes, and {secondCount} seconds","minutesAndSecond":"{hourCount} hours, {minuteCount} minutes, and {secondCount} second","minuteAndSeconds":"{hourCount} hours, {minuteCount} minute, and {secondCount} seconds","minuteAndSecond":"{hourCount} hours, {minuteCount} minute, and {secondCount} second","andSeconds":"{hourCount} hours and {secondCount} seconds","andSecond":"{hourCount} hours and {secondCount} second"},"one":{"only":"{hourCount} hour","andMinutes":"{hourCount} hour and {minuteCount} minutes","andMinute":"{hourCount} hour and {minuteCount} minute","minutesAndSeconds":"{hourCount} hour, {minuteCount} minutes, and {secondCount} seconds","minutesAndSecond":"{hourCount} hour, {minuteCount} minutes, and {secondCount} second","minuteAndSeconds":"{hourCount} hour, {minuteCount} minute, and {secondCount} seconds","minuteAndSecond":"{hourCount} hour, {minuteCount} minute, and {secondCount} second","andSeconds":"{hourCount} hour and {secondCount} seconds","andSecond":"{hourCount} hour and {secondCount} second"}},"minutes":{"other":{"only":"{minuteCount} minutes","andSeconds":"{minuteCount} minutes and {secondCount} seconds","andSecond":"{minuteCount} minutes and {secondCount} second"},"one":{"only":"{minuteCount} minute","andSeconds":"{minuteCount} minute and {secondCount} seconds","andSecond":"{minuteCount} minute and {secondCount} second"}},"seconds":{"other":"{secondCount} seconds","one":"{secondCount} second"}}}}}');
const polarisTranslations = {
  Polaris
};
const polarisStyles = "/assets/styles-CV7GIAUv.css";
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const links$1 = () => [{ rel: "stylesheet", href: polarisStyles }];
const loader$5 = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return { errors, polarisTranslations };
};
const action$1 = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider, { i18n: loaderData.polarisTranslations, children: /* @__PURE__ */ jsx(Page, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Form, { method: "post", children: /* @__PURE__ */ jsxs(FormLayout, { children: [
    /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Log in" }),
    /* @__PURE__ */ jsx(
      TextField,
      {
        type: "text",
        name: "shop",
        label: "Shop domain",
        helpText: "example.myshopify.com",
        value: shop,
        onChange: setShop,
        autoComplete: "on",
        error: errors.shop
      }
    ),
    /* @__PURE__ */ jsx(Button, { submit: true, children: "Log in" })
  ] }) }) }) }) });
}
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: Auth,
  links: links$1,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_12o3y_1";
const heading = "_heading_12o3y_11";
const text = "_text_12o3y_12";
const content = "_content_12o3y_22";
const form = "_form_12o3y_27";
const label = "_label_12o3y_35";
const input = "_input_12o3y_43";
const button = "_button_12o3y_47";
const list = "_list_12o3y_51";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$4 = async ({ request }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};
function App$1() {
  const { showForm } = useLoaderData();
  return /* @__PURE__ */ jsx("div", { className: styles.index, children: /* @__PURE__ */ jsxs("div", { className: styles.content, children: [
    /* @__PURE__ */ jsx("h1", { className: styles.heading, children: "A short heading about [your app]" }),
    /* @__PURE__ */ jsx("p", { className: styles.text, children: "A tagline about [your app] that describes your value proposition." }),
    showForm && /* @__PURE__ */ jsxs(Form, { className: styles.form, method: "post", action: "/auth/login", children: [
      /* @__PURE__ */ jsxs("label", { className: styles.label, children: [
        /* @__PURE__ */ jsx("span", { children: "Shop domain" }),
        /* @__PURE__ */ jsx("input", { className: styles.input, type: "text", name: "shop" }),
        /* @__PURE__ */ jsx("span", { children: "e.g: my-shop-domain.myshopify.com" })
      ] }),
      /* @__PURE__ */ jsx("button", { className: styles.button, type: "submit", children: "Log in" })
    ] }),
    /* @__PURE__ */ jsxs("ul", { className: styles.list, children: [
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] }),
      /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: "Product feature" }),
        ". Some detail about your feature and its benefit to your customer."
      ] })
    ] })
  ] }) });
}
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: App$1,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const loader$3 = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const links = () => [{ rel: "stylesheet", href: polarisStyles }];
const loader$2 = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};
function App() {
  const { apiKey } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider$1, { isEmbeddedApp: true, apiKey, children: [
    /* @__PURE__ */ jsxs(NavMenu, { children: [
      /* @__PURE__ */ jsx(Link, { to: "/app", rel: "home", children: "Home" }),
      /* @__PURE__ */ jsx(Link, { to: "/app/product-bases", children: "Product Templates" })
    ] }),
    /* @__PURE__ */ jsx(Outlet, {})
  ] });
}
function ErrorBoundary() {
  return boundary.error(useRouteError());
}
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: App,
  headers,
  links,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const LAYER_COLORS = {
  text: { bg: "rgba(0, 122, 206, 0.15)", border: "#007ace", label: "Text" },
  image: { bg: "rgba(46, 160, 67, 0.15)", border: "#2ea043", label: "Image" },
  fixed_image: { bg: "rgba(163, 113, 247, 0.15)", border: "#a371f7", label: "Fixed" }
};
const HANDLE_SIZE = 8;
const MIN_SIZE_PCT = 5;
function LayerEditor({
  layers,
  onLayersChange,
  printArea,
  onPrintAreaChange,
  mockupImageUrl,
  fonts,
  productCategory,
  technique
}) {
  const canvasRef = useRef(null);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  const [dragMode, setDragMode] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragStartValues, setDragStartValues] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 450 });
  useEffect(() => {
    const measure = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useCallback(
    (px, axis) => {
      const dim = axis === "x" ? canvasSize.width : canvasSize.height;
      return dim > 0 ? px / dim * 100 : 0;
    },
    [canvasSize]
  );
  const layerToCanvas = useCallback(
    (layer) => ({
      x: printArea.x + layer.positionX / 100 * printArea.width,
      y: printArea.y + layer.positionY / 100 * printArea.height,
      w: layer.positionWidth / 100 * printArea.width,
      h: layer.positionHeight / 100 * printArea.height
    }),
    [printArea]
  );
  const canvasToLayer = useCallback(
    (canvasX, canvasY, canvasW, canvasH) => ({
      positionX: printArea.width > 0 ? (canvasX - printArea.x) / printArea.width * 100 : 0,
      positionY: printArea.height > 0 ? (canvasY - printArea.y) / printArea.height * 100 : 0,
      positionWidth: printArea.width > 0 ? canvasW / printArea.width * 100 : 0,
      positionHeight: printArea.height > 0 ? canvasH / printArea.height * 100 : 0
    }),
    [printArea]
  );
  const getMousePctFromEvent = useCallback(
    (e) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width * 100,
        y: (e.clientY - rect.top) / rect.height * 100
      };
    },
    []
  );
  const handleCanvasMouseDown = useCallback(
    (e) => {
      if (e.target === canvasRef.current || e.target.dataset.role === "canvas-bg") {
        setSelectedElement(null);
        setSelectedLayerIndex(null);
      }
    },
    []
  );
  const startDrag = useCallback(
    (e, mode2, startVals) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = getMousePctFromEvent(e);
      setDragMode(mode2);
      setDragStart(pos);
      setDragStartValues(startVals);
    },
    [getMousePctFromEvent]
  );
  const handleMouseMove = useCallback(
    (e) => {
      if (!dragMode) return;
      const pos = getMousePctFromEvent(e);
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      if (dragMode === "move-printarea") {
        const newX = Math.max(0, Math.min(100 - dragStartValues.w, dragStartValues.x + dx));
        const newY = Math.max(0, Math.min(100 - dragStartValues.h, dragStartValues.y + dy));
        onPrintAreaChange({ ...printArea, x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 });
      } else if (dragMode.startsWith("resize-printarea")) {
        const dir = dragMode.replace("resize-printarea-", "");
        let { x, y, w, h } = dragStartValues;
        if (dir.includes("e")) w = Math.max(MIN_SIZE_PCT, w + dx);
        if (dir.includes("w")) {
          w = Math.max(MIN_SIZE_PCT, w - dx);
          x = x + (dragStartValues.w - w);
        }
        if (dir.includes("s")) h = Math.max(MIN_SIZE_PCT, h + dy);
        if (dir.includes("n")) {
          h = Math.max(MIN_SIZE_PCT, h - dy);
          y = y + (dragStartValues.h - h);
        }
        x = Math.max(0, x);
        y = Math.max(0, y);
        w = Math.min(100 - x, w);
        h = Math.min(100 - y, h);
        onPrintAreaChange({
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          width: Math.round(w * 10) / 10,
          height: Math.round(h * 10) / 10
        });
      } else if (dragMode === "move-layer" && selectedLayerIndex !== null) {
        const canvasX = Math.max(printArea.x, Math.min(printArea.x + printArea.width - dragStartValues.w, dragStartValues.x + dx));
        const canvasY = Math.max(printArea.y, Math.min(printArea.y + printArea.height - dragStartValues.h, dragStartValues.y + dy));
        const layerPos = canvasToLayer(canvasX, canvasY, dragStartValues.w, dragStartValues.h);
        const updated = [...layers];
        updated[selectedLayerIndex] = {
          ...updated[selectedLayerIndex],
          positionX: Math.round(layerPos.positionX * 10) / 10,
          positionY: Math.round(layerPos.positionY * 10) / 10
        };
        onLayersChange(updated);
      } else if (dragMode.startsWith("resize-layer") && selectedLayerIndex !== null) {
        const dir = dragMode.replace("resize-layer-", "");
        let { x, y, w, h } = dragStartValues;
        if (dir.includes("e")) w = Math.max(MIN_SIZE_PCT * printArea.width / 100, w + dx);
        if (dir.includes("w")) {
          const newW = Math.max(MIN_SIZE_PCT * printArea.width / 100, w - dx);
          x = x + (w - newW);
          w = newW;
        }
        if (dir.includes("s")) h = Math.max(MIN_SIZE_PCT * printArea.height / 100, h + dy);
        if (dir.includes("n")) {
          const newH = Math.max(MIN_SIZE_PCT * printArea.height / 100, h - dy);
          y = y + (h - newH);
          h = newH;
        }
        x = Math.max(printArea.x, x);
        y = Math.max(printArea.y, y);
        w = Math.min(printArea.x + printArea.width - x, w);
        h = Math.min(printArea.y + printArea.height - y, h);
        const layerPos = canvasToLayer(x, y, w, h);
        const updated = [...layers];
        updated[selectedLayerIndex] = {
          ...updated[selectedLayerIndex],
          positionX: Math.round(Math.max(0, layerPos.positionX) * 10) / 10,
          positionY: Math.round(Math.max(0, layerPos.positionY) * 10) / 10,
          positionWidth: Math.round(Math.min(100, layerPos.positionWidth) * 10) / 10,
          positionHeight: Math.round(Math.min(100, layerPos.positionHeight) * 10) / 10
        };
        onLayersChange(updated);
      }
    },
    [dragMode, dragStart, dragStartValues, printArea, selectedLayerIndex, layers, getMousePctFromEvent, onPrintAreaChange, onLayersChange, canvasToLayer]
  );
  const handleMouseUp = useCallback(() => {
    setDragMode(null);
  }, []);
  useEffect(() => {
    if (dragMode) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragMode, handleMouseMove, handleMouseUp]);
  const renderResizeHandles = (prefix, bounds, onStart) => {
    const positions = [
      { key: "nw", left: 0, top: 0, cursor: "nw-resize" },
      { key: "ne", left: bounds.w, top: 0, cursor: "ne-resize" },
      { key: "sw", left: 0, top: bounds.h, cursor: "sw-resize" },
      { key: "se", left: bounds.w, top: bounds.h, cursor: "se-resize" },
      { key: "n", left: bounds.w / 2, top: 0, cursor: "n-resize" },
      { key: "s", left: bounds.w / 2, top: bounds.h, cursor: "s-resize" },
      { key: "w", left: 0, top: bounds.h / 2, cursor: "w-resize" },
      { key: "e", left: bounds.w, top: bounds.h / 2, cursor: "e-resize" }
    ];
    return positions.map((pos) => /* @__PURE__ */ jsx(
      "div",
      {
        onMouseDown: (e) => onStart(e, `${prefix}-${pos.key}`),
        style: {
          position: "absolute",
          left: `calc(${pos.left / bounds.w * 100}% - ${HANDLE_SIZE / 2}px)`,
          top: `calc(${pos.top / bounds.h * 100}% - ${HANDLE_SIZE / 2}px)`,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          backgroundColor: "#fff",
          border: "2px solid #007ace",
          borderRadius: 2,
          cursor: pos.cursor,
          zIndex: 100
        }
      },
      `${prefix}-handle-${pos.key}`
    ));
  };
  const addLayer = useCallback(
    (type) => {
      var _a2, _b;
      const defaults = {
        text: {
          layerType: "text",
          label: "Custom Text",
          customerEditable: true,
          maxChars: technique === "embroidery" && productCategory === "hat" ? 3 : 20,
          placeholder: technique === "embroidery" && productCategory === "hat" ? "ABC" : "Your Text",
          defaultFont: "script",
          defaultColor: "#000000",
          positionX: 10,
          positionY: 10,
          positionWidth: 80,
          positionHeight: 80
        },
        image: {
          layerType: "image",
          label: "Upload Image",
          customerEditable: true,
          positionX: 10,
          positionY: 10,
          positionWidth: 80,
          positionHeight: 80
        },
        fixed_image: {
          layerType: "fixed_image",
          label: "Frame",
          customerEditable: false,
          fixedImageUrl: "",
          positionX: 0,
          positionY: 0,
          positionWidth: 100,
          positionHeight: 100
        }
      };
      const offset = layers.length * 5;
      const newLayer = {
        ...defaults[type],
        positionX: (((_a2 = defaults[type]) == null ? void 0 : _a2.positionX) || 10) + offset,
        positionY: (((_b = defaults[type]) == null ? void 0 : _b.positionY) || 10) + offset
      };
      const updated = [...layers, newLayer];
      onLayersChange(updated);
      setSelectedLayerIndex(updated.length - 1);
      setSelectedElement("layer");
    },
    [layers, onLayersChange, technique, productCategory]
  );
  const removeLayer = useCallback(
    (index2) => {
      const updated = layers.filter((_, i) => i !== index2);
      onLayersChange(updated);
      if (selectedLayerIndex === index2) {
        setSelectedLayerIndex(null);
        setSelectedElement(null);
      } else if (selectedLayerIndex !== null && selectedLayerIndex > index2) {
        setSelectedLayerIndex(selectedLayerIndex - 1);
      }
    },
    [layers, onLayersChange, selectedLayerIndex]
  );
  const moveLayerOrder = useCallback(
    (index2, direction) => {
      const newIndex = direction === "up" ? index2 - 1 : index2 + 1;
      if (newIndex < 0 || newIndex >= layers.length) return;
      const updated = [...layers];
      [updated[index2], updated[newIndex]] = [updated[newIndex], updated[index2]];
      onLayersChange(updated);
      setSelectedLayerIndex(newIndex);
    },
    [layers, onLayersChange]
  );
  const updateLayer = useCallback(
    (index2, changes) => {
      const updated = [...layers];
      updated[index2] = { ...updated[index2], ...changes };
      onLayersChange(updated);
    },
    [layers, onLayersChange]
  );
  const selectedLayer = selectedLayerIndex !== null ? layers[selectedLayerIndex] : null;
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 16, minHeight: 500 }, children: [
    /* @__PURE__ */ jsx("div", { style: { flex: "1 1 60%", minWidth: 0 }, children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
      /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodySm", tone: "subdued", children: "Drag the print area (dashed blue) to position it on the mockup. Drag layers (colored rectangles) within the print area. Click to select, drag corners to resize." }),
      /* @__PURE__ */ jsxs(
        "div",
        {
          ref: canvasRef,
          "data-role": "canvas-bg",
          onMouseDown: handleCanvasMouseDown,
          style: {
            position: "relative",
            width: "100%",
            paddingBottom: "75%",
            // 4:3 aspect ratio
            backgroundColor: "#e8e8e8",
            borderRadius: 8,
            overflow: "hidden",
            cursor: dragMode ? "grabbing" : "default",
            userSelect: "none"
          },
          children: [
            mockupImageUrl && /* @__PURE__ */ jsx(
              "img",
              {
                src: mockupImageUrl,
                alt: "Mockup",
                "data-role": "canvas-bg",
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  pointerEvents: "none"
                }
              }
            ),
            !mockupImageUrl && /* @__PURE__ */ jsx(
              "div",
              {
                "data-role": "canvas-bg",
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  backgroundImage: "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)",
                  backgroundSize: "10% 10%"
                }
              }
            ),
            /* @__PURE__ */ jsxs(
              "div",
              {
                onMouseDown: (e) => {
                  e.stopPropagation();
                  setSelectedElement("printarea");
                  setSelectedLayerIndex(null);
                  startDrag(e, "move-printarea", {
                    x: printArea.x,
                    y: printArea.y,
                    w: printArea.width,
                    h: printArea.height
                  });
                },
                style: {
                  position: "absolute",
                  left: `${printArea.x}%`,
                  top: `${printArea.y}%`,
                  width: `${printArea.width}%`,
                  height: `${printArea.height}%`,
                  border: `2px dashed ${selectedElement === "printarea" ? "#005fcc" : "#007ace"}`,
                  backgroundColor: selectedElement === "printarea" ? "rgba(0, 122, 206, 0.08)" : "rgba(0, 122, 206, 0.04)",
                  cursor: dragMode === "move-printarea" ? "grabbing" : "move",
                  zIndex: 10,
                  boxSizing: "border-box"
                },
                children: [
                  /* @__PURE__ */ jsxs(
                    "div",
                    {
                      style: {
                        position: "absolute",
                        top: -20,
                        left: 0,
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#007ace",
                        whiteSpace: "nowrap",
                        pointerEvents: "none"
                      },
                      children: [
                        "Print Area (",
                        Math.round(printArea.width),
                        "% × ",
                        Math.round(printArea.height),
                        "%)"
                      ]
                    }
                  ),
                  selectedElement === "printarea" && renderResizeHandles(
                    "resize-printarea",
                    { w: 100, h: 100 },
                    (e, mode2) => startDrag(e, mode2, {
                      x: printArea.x,
                      y: printArea.y,
                      w: printArea.width,
                      h: printArea.height
                    })
                  ),
                  layers.map((layer, index2) => {
                    const colors = LAYER_COLORS[layer.layerType] || LAYER_COLORS.text;
                    const isSelected = selectedElement === "layer" && selectedLayerIndex === index2;
                    const canvasPos = layerToCanvas(layer);
                    const relLeft = printArea.width > 0 ? layer.positionX / 100 * 100 : 0;
                    const relTop = printArea.height > 0 ? layer.positionY / 100 * 100 : 0;
                    const relWidth = layer.positionWidth / 100 * 100;
                    const relHeight = layer.positionHeight / 100 * 100;
                    return /* @__PURE__ */ jsxs(
                      "div",
                      {
                        onMouseDown: (e) => {
                          e.stopPropagation();
                          setSelectedElement("layer");
                          setSelectedLayerIndex(index2);
                          startDrag(e, "move-layer", {
                            x: canvasPos.x,
                            y: canvasPos.y,
                            w: canvasPos.w,
                            h: canvasPos.h
                          });
                        },
                        style: {
                          position: "absolute",
                          left: `${relLeft}%`,
                          top: `${relTop}%`,
                          width: `${relWidth}%`,
                          height: `${relHeight}%`,
                          backgroundColor: isSelected ? colors.bg.replace("0.15", "0.25") : colors.bg,
                          border: `2px solid ${colors.border}`,
                          borderRadius: 4,
                          cursor: dragMode === "move-layer" && isSelected ? "grabbing" : "grab",
                          zIndex: 20 + index2,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          boxSizing: "border-box"
                        },
                        children: [
                          /* @__PURE__ */ jsx(
                            "div",
                            {
                              style: {
                                fontSize: 10,
                                fontWeight: 600,
                                color: colors.border,
                                textAlign: "center",
                                lineHeight: 1.2,
                                padding: "2px 4px",
                                pointerEvents: "none",
                                maxWidth: "100%",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              },
                              children: layer.label
                            }
                          ),
                          /* @__PURE__ */ jsxs(
                            "div",
                            {
                              style: {
                                fontSize: 8,
                                color: colors.border,
                                opacity: 0.7,
                                pointerEvents: "none"
                              },
                              children: [
                                colors.label,
                                " Layer ",
                                index2 + 1
                              ]
                            }
                          ),
                          layer.layerType === "text" && layer.placeholder && /* @__PURE__ */ jsx(
                            "div",
                            {
                              style: {
                                fontSize: 14,
                                fontStyle: "italic",
                                color: layer.defaultColor || "#666",
                                opacity: 0.5,
                                pointerEvents: "none",
                                marginTop: 2
                              },
                              children: layer.placeholder
                            }
                          ),
                          isSelected && renderResizeHandles(
                            "resize-layer",
                            { w: 100, h: 100 },
                            (e, mode2) => startDrag(e, mode2, {
                              x: canvasPos.x,
                              y: canvasPos.y,
                              w: canvasPos.w,
                              h: canvasPos.h
                            })
                          )
                        ]
                      },
                      index2
                    );
                  })
                ]
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
        /* @__PURE__ */ jsx(Button, { onClick: () => addLayer("text"), size: "slim", children: "+ Text Layer" }),
        /* @__PURE__ */ jsx(Button, { onClick: () => addLayer("image"), size: "slim", children: "+ Image Upload Layer" }),
        /* @__PURE__ */ jsx(Button, { onClick: () => addLayer("fixed_image"), size: "slim", children: "+ Fixed Image Layer" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("div", { style: { flex: "0 0 280px", minWidth: 280 }, children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
        /* @__PURE__ */ jsxs(Text, { as: "h3", variant: "headingSm", children: [
          "Layers (",
          layers.length,
          ")"
        ] }),
        layers.length === 0 && /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodySm", tone: "subdued", children: "Add a layer using the buttons below the canvas." }),
        layers.map((layer, index2) => {
          const colors = LAYER_COLORS[layer.layerType] || LAYER_COLORS.text;
          const isSelected = selectedElement === "layer" && selectedLayerIndex === index2;
          return /* @__PURE__ */ jsxs(
            "div",
            {
              onClick: () => {
                setSelectedElement("layer");
                setSelectedLayerIndex(index2);
              },
              style: {
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                border: isSelected ? `2px solid ${colors.border}` : "2px solid transparent",
                backgroundColor: isSelected ? colors.bg : "transparent",
                cursor: "pointer",
                transition: "all 0.15s"
              },
              children: [
                /* @__PURE__ */ jsx(
                  "div",
                  {
                    style: {
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      backgroundColor: colors.border,
                      flexShrink: 0
                    }
                  }
                ),
                /* @__PURE__ */ jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
                  /* @__PURE__ */ jsx("div", { style: { fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: layer.label }),
                  /* @__PURE__ */ jsx("div", { style: { fontSize: 10, color: "#666" }, children: colors.label })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 1 }, children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: (e) => {
                        e.stopPropagation();
                        moveLayerOrder(index2, "up");
                      },
                      disabled: index2 === 0,
                      style: {
                        background: "none",
                        border: "none",
                        cursor: index2 === 0 ? "default" : "pointer",
                        opacity: index2 === 0 ? 0.3 : 1,
                        fontSize: 10,
                        padding: "0 2px",
                        lineHeight: 1
                      },
                      children: "▲"
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: (e) => {
                        e.stopPropagation();
                        moveLayerOrder(index2, "down");
                      },
                      disabled: index2 === layers.length - 1,
                      style: {
                        background: "none",
                        border: "none",
                        cursor: index2 === layers.length - 1 ? "default" : "pointer",
                        opacity: index2 === layers.length - 1 ? 0.3 : 1,
                        fontSize: 10,
                        padding: "0 2px",
                        lineHeight: 1
                      },
                      children: "▼"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: (e) => {
                      e.stopPropagation();
                      removeLayer(index2);
                    },
                    style: {
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#d72c0d",
                      fontSize: 14,
                      padding: "0 4px",
                      lineHeight: 1
                    },
                    children: "✕"
                  }
                )
              ]
            },
            index2
          );
        })
      ] }) }),
      selectedElement === "printarea" && /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
        /* @__PURE__ */ jsx(Text, { as: "h3", variant: "headingSm", children: "Print Area" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "X %",
              type: "number",
              value: String(Math.round(printArea.x)),
              onChange: (val) => onPrintAreaChange({ ...printArea, x: parseFloat(val) || 0 }),
              autoComplete: "off",
              size: "slim"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Y %",
              type: "number",
              value: String(Math.round(printArea.y)),
              onChange: (val) => onPrintAreaChange({ ...printArea, y: parseFloat(val) || 0 }),
              autoComplete: "off",
              size: "slim"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Width %",
              type: "number",
              value: String(Math.round(printArea.width)),
              onChange: (val) => onPrintAreaChange({ ...printArea, width: parseFloat(val) || 10 }),
              autoComplete: "off",
              size: "slim"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Height %",
              type: "number",
              value: String(Math.round(printArea.height)),
              onChange: (val) => onPrintAreaChange({ ...printArea, height: parseFloat(val) || 10 }),
              autoComplete: "off",
              size: "slim"
            }
          )
        ] })
      ] }) }),
      selectedElement === "layer" && selectedLayer && selectedLayerIndex !== null && /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
        /* @__PURE__ */ jsx(Text, { as: "h3", variant: "headingSm", children: "Layer Properties" }),
        /* @__PURE__ */ jsx(
          Select,
          {
            label: "Type",
            options: [
              { label: "Text", value: "text" },
              { label: "Image Upload", value: "image" },
              { label: "Fixed Image", value: "fixed_image" }
            ],
            value: selectedLayer.layerType,
            onChange: (val) => updateLayer(selectedLayerIndex, { layerType: val })
          }
        ),
        /* @__PURE__ */ jsx(
          TextField,
          {
            label: "Label",
            value: selectedLayer.label,
            onChange: (val) => updateLayer(selectedLayerIndex, { label: val }),
            autoComplete: "off"
          }
        ),
        /* @__PURE__ */ jsx(
          Checkbox,
          {
            label: "Customer can edit",
            checked: selectedLayer.customerEditable,
            onChange: (val) => updateLayer(selectedLayerIndex, { customerEditable: val })
          }
        ),
        /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodySm", fontWeight: "semibold", children: "Position (% of print area)" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "X",
              type: "number",
              value: String(Math.round(selectedLayer.positionX)),
              onChange: (val) => updateLayer(selectedLayerIndex, { positionX: parseFloat(val) || 0 }),
              autoComplete: "off",
              size: "slim"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Y",
              type: "number",
              value: String(Math.round(selectedLayer.positionY)),
              onChange: (val) => updateLayer(selectedLayerIndex, { positionY: parseFloat(val) || 0 }),
              autoComplete: "off",
              size: "slim"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Width",
              type: "number",
              value: String(Math.round(selectedLayer.positionWidth)),
              onChange: (val) => updateLayer(selectedLayerIndex, { positionWidth: parseFloat(val) || 10 }),
              autoComplete: "off",
              size: "slim"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Height",
              type: "number",
              value: String(Math.round(selectedLayer.positionHeight)),
              onChange: (val) => updateLayer(selectedLayerIndex, { positionHeight: parseFloat(val) || 10 }),
              autoComplete: "off",
              size: "slim"
            }
          )
        ] }),
        selectedLayer.layerType === "text" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Divider, {}),
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodySm", fontWeight: "semibold", children: "Text Options" }),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Max characters",
              type: "number",
              value: String(selectedLayer.maxChars || 3),
              onChange: (val) => updateLayer(selectedLayerIndex, { maxChars: parseInt(val) || 3 }),
              autoComplete: "off"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Placeholder text",
              value: selectedLayer.placeholder || "",
              onChange: (val) => updateLayer(selectedLayerIndex, { placeholder: val }),
              autoComplete: "off"
            }
          ),
          /* @__PURE__ */ jsx(
            Select,
            {
              label: "Default font",
              options: fonts.map((f) => ({ label: f.displayName, value: f.key })),
              value: selectedLayer.defaultFont || "script",
              onChange: (val) => updateLayer(selectedLayerIndex, { defaultFont: val })
            }
          ),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodySm", children: "Default color" }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 }, children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "color",
                  value: selectedLayer.defaultColor || "#000000",
                  onChange: (e) => updateLayer(selectedLayerIndex, { defaultColor: e.target.value }),
                  style: { width: 32, height: 32, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }
                }
              ),
              /* @__PURE__ */ jsx("span", { style: { fontSize: 12, color: "#666" }, children: selectedLayer.defaultColor || "#000000" })
            ] })
          ] })
        ] }),
        selectedLayer.layerType === "fixed_image" && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Divider, {}),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Fixed Image URL",
              value: selectedLayer.fixedImageUrl || "",
              onChange: (val) => updateLayer(selectedLayerIndex, { fixedImageUrl: val }),
              autoComplete: "off",
              helpText: "URL to a fixed overlay image (e.g., frame, logo)"
            }
          )
        ] }),
        /* @__PURE__ */ jsx(Divider, {}),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "plain",
            tone: "critical",
            onClick: () => removeLayer(selectedLayerIndex),
            children: "Delete Layer"
          }
        )
      ] }) }),
      !selectedElement && layers.length > 0 && /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(BlockStack, { gap: "200", children: /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodySm", tone: "subdued", children: "Click the print area or a layer on the canvas to select and edit it." }) }) })
    ] }) })
  ] });
}
const loader$1 = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const templates = await prisma.productTemplate.findMany({
    where: { shop: session.shop },
    include: {
      layers: { orderBy: { sortOrder: "asc" } },
      mockupImages: { orderBy: { sortOrder: "asc" } }
    },
    orderBy: { createdAt: "desc" }
  });
  return json({
    templates,
    shop: session.shop,
    productBases: PRODUCT_BASES.map((pb) => ({
      slug: pb.slug,
      name: pb.name,
      brand: pb.brand,
      model: pb.model,
      category: pb.category,
      techniques: pb.techniques,
      variants: pb.variants.map((v) => ({ color: v.color, colorHex: v.colorHex }))
    })),
    threadColors: EMBROIDERY_THREAD_COLORS,
    fonts: AVAILABLE_FONTS
  });
};
const action = async ({ request }) => {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  try {
    if (intent === "create_template") {
      const productBaseSlug = formData.get("productBaseSlug");
      const rawProductId = formData.get("shopifyProductId");
      const shopifyProductId = rawProductId.startsWith("gid://") ? rawProductId : rawProductId.match(/^\d+$/) ? `gid://shopify/Product/${rawProductId}` : rawProductId;
      const productTitle = formData.get("productTitle");
      const productHandle = formData.get("productHandle");
      const technique = formData.get("technique");
      const placementKey = formData.get("placementKey");
      const enabledFonts = formData.get("enabledFonts");
      const enabledThreadColors = formData.get("enabledThreadColors");
      const enabledVariantColors = formData.get("enabledVariantColors");
      const printAreaX = parseFloat(formData.get("printAreaX")) || 25;
      const printAreaY = parseFloat(formData.get("printAreaY")) || 15;
      const printAreaWidth = parseFloat(formData.get("printAreaWidth")) || 50;
      const printAreaHeight = parseFloat(formData.get("printAreaHeight")) || 35;
      const layersJson = formData.get("layers");
      const layers = layersJson ? JSON.parse(layersJson) : [];
      try {
        await prisma.productTemplate.deleteMany({
          where: { shop: session.shop, shopifyProductId }
        });
      } catch (e) {
      }
      const template = await prisma.productTemplate.create({
        data: {
          shop: session.shop,
          shopifyProductId,
          productTitle,
          productHandle,
          productBaseSlug,
          technique,
          placementKey,
          enabledFonts,
          enabledThreadColors,
          enabledVariantColors,
          printAreaX,
          printAreaY,
          printAreaWidth,
          printAreaHeight,
          layers: {
            create: layers.map((layer, index2) => ({
              layerType: layer.layerType,
              label: layer.label,
              customerEditable: layer.customerEditable ?? true,
              positionX: layer.positionX ?? 10,
              positionY: layer.positionY ?? 10,
              positionWidth: layer.positionWidth ?? 80,
              positionHeight: layer.positionHeight ?? 80,
              sortOrder: index2,
              maxChars: layer.maxChars ?? null,
              placeholder: layer.placeholder ?? null,
              defaultFont: layer.defaultFont ?? "script",
              defaultColor: layer.defaultColor ?? "#000000",
              fixedImageUrl: layer.fixedImageUrl ?? null
            }))
          }
        }
      });
      const productBase = PRODUCT_BASES.find((pb) => pb.slug === productBaseSlug);
      if (productBase == null ? void 0 : productBase.defaultMockupUrl) {
        await prisma.mockupImage.create({
          data: {
            templateId: template.id,
            variantColor: "Default",
            variantColorHex: "#ffffff",
            imageUrl: productBase.defaultMockupUrl,
            isDefault: true
          }
        });
      }
      return json({ success: true, templateId: template.id });
    }
    if (intent === "delete_template") {
      const templateId = formData.get("templateId");
      try {
        await prisma.mockupImage.deleteMany({ where: { templateId } });
        await prisma.templateLayer.deleteMany({ where: { templateId } });
        await prisma.productTemplate.delete({ where: { id: templateId } });
      } catch (e) {
        console.error("Delete template error:", e.message);
        await prisma.productTemplate.deleteMany({ where: { id: templateId } });
      }
      return json({ success: true });
    }
    if (intent === "purge_all_templates") {
      await prisma.mockupImage.deleteMany({});
      await prisma.templateLayer.deleteMany({});
      await prisma.productTemplate.deleteMany({ where: { shop: session.shop } });
      return json({ success: true, message: "All templates purged" });
    }
    if (intent === "update_print_area") {
      const templateId = formData.get("templateId");
      const printAreaX = parseFloat(formData.get("printAreaX"));
      const printAreaY = parseFloat(formData.get("printAreaY"));
      const printAreaWidth = parseFloat(formData.get("printAreaWidth"));
      const printAreaHeight = parseFloat(formData.get("printAreaHeight"));
      await prisma.productTemplate.update({
        where: { id: templateId },
        data: { printAreaX, printAreaY, printAreaWidth, printAreaHeight }
      });
      return json({ success: true });
    }
    if (intent === "add_mockup") {
      const templateId = formData.get("templateId");
      const variantColor = formData.get("variantColor");
      const variantColorHex = formData.get("variantColorHex");
      const imageUrl = formData.get("imageUrl");
      const isDefault = formData.get("isDefault") === "true";
      await prisma.mockupImage.create({
        data: {
          templateId,
          variantColor,
          variantColorHex,
          imageUrl,
          isDefault
        }
      });
      return json({ success: true });
    }
    if (intent === "delete_mockup") {
      const mockupId = formData.get("mockupId");
      await prisma.mockupImage.delete({ where: { id: mockupId } });
      return json({ success: true });
    }
    if (intent === "upload_mockup_file") {
      const templateId = formData.get("templateId");
      const variantColor = formData.get("variantColor");
      const variantColorHex = formData.get("variantColorHex");
      const isDefault = formData.get("isDefault") === "true";
      const fileBase64 = formData.get("fileBase64");
      const fileName = formData.get("fileName");
      const fileSize = formData.get("fileSize");
      const mimeType = formData.get("mimeType");
      const stagedRes = await admin.graphql(
        `#graphql
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
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
        {
          variables: {
            input: [{
              filename: fileName,
              fileSize,
              mimeType,
              resource: "FILE",
              httpMethod: "POST"
            }]
          }
        }
      );
      const stagedData = await stagedRes.json();
      const target = (_c = (_b = (_a2 = stagedData.data) == null ? void 0 : _a2.stagedUploadsCreate) == null ? void 0 : _b.stagedTargets) == null ? void 0 : _c[0];
      if (!target) {
        const errors = (_e = (_d = stagedData.data) == null ? void 0 : _d.stagedUploadsCreate) == null ? void 0 : _e.userErrors;
        return json({ error: `Staged upload failed: ${JSON.stringify(errors)}` }, { status: 500 });
      }
      const uploadForm = new FormData();
      for (const param of target.parameters) {
        uploadForm.append(param.name, param.value);
      }
      const base64Data = fileBase64.split(",").pop() || fileBase64;
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      uploadForm.append("file", blob, fileName);
      const uploadRes = await fetch(target.url, {
        method: "POST",
        body: uploadForm
      });
      if (!uploadRes.ok) {
        return json({ error: `File upload failed: ${uploadRes.status} ${uploadRes.statusText}` }, { status: 500 });
      }
      const fileCreateRes = await admin.graphql(
        `#graphql
        mutation fileCreate($files: [FileCreateInput!]!) {
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
        {
          variables: {
            files: [{
              alt: `Mockup - ${variantColor}`,
              contentType: "IMAGE",
              originalSource: target.resourceUrl
            }]
          }
        }
      );
      const fileData = await fileCreateRes.json();
      const createdFile = (_h = (_g = (_f = fileData.data) == null ? void 0 : _f.fileCreate) == null ? void 0 : _g.files) == null ? void 0 : _h[0];
      const fileErrors = (_j = (_i = fileData.data) == null ? void 0 : _i.fileCreate) == null ? void 0 : _j.userErrors;
      if (fileErrors && fileErrors.length > 0) {
        return json({ error: `File create failed: ${JSON.stringify(fileErrors)}` }, { status: 500 });
      }
      const imageUrl = ((_k = createdFile == null ? void 0 : createdFile.image) == null ? void 0 : _k.url) || (createdFile == null ? void 0 : createdFile.url) || target.resourceUrl;
      await prisma.mockupImage.create({
        data: {
          templateId,
          variantColor,
          variantColorHex,
          imageUrl,
          isDefault
        }
      });
      return json({ success: true, imageUrl });
    }
    if (intent === "update_product_id") {
      const templateId = formData.get("templateId");
      const rawProductId = formData.get("shopifyProductId");
      const productTitle = formData.get("productTitle");
      const productHandle = formData.get("productHandle") || "";
      const shopifyProductId = rawProductId.startsWith("gid://") ? rawProductId : rawProductId.match(/^\d+$/) ? `gid://shopify/Product/${rawProductId}` : rawProductId;
      await prisma.productTemplate.update({
        where: { id: templateId },
        data: {
          shopifyProductId,
          ...productTitle ? { productTitle } : {},
          ...productHandle ? { productHandle } : {}
        }
      });
      return json({ success: true });
    }
    if (intent === "update_template") {
      const templateId = formData.get("templateId");
      const productBaseSlug = formData.get("productBaseSlug");
      const rawProductId = formData.get("shopifyProductId");
      const shopifyProductId = rawProductId.startsWith("gid://") ? rawProductId : rawProductId.match(/^\d+$/) ? `gid://shopify/Product/${rawProductId}` : rawProductId;
      const productTitle = formData.get("productTitle");
      const productHandle = formData.get("productHandle");
      const technique = formData.get("technique");
      const placementKey = formData.get("placementKey");
      const enabledFonts = formData.get("enabledFonts");
      const enabledThreadColors = formData.get("enabledThreadColors");
      const enabledVariantColors = formData.get("enabledVariantColors");
      const printAreaX = parseFloat(formData.get("printAreaX")) || 25;
      const printAreaY = parseFloat(formData.get("printAreaY")) || 15;
      const printAreaWidth = parseFloat(formData.get("printAreaWidth")) || 50;
      const printAreaHeight = parseFloat(formData.get("printAreaHeight")) || 35;
      const layersJson = formData.get("layers");
      const layers = layersJson ? JSON.parse(layersJson) : [];
      await prisma.productTemplate.update({
        where: { id: templateId },
        data: {
          shopifyProductId,
          productTitle,
          productHandle,
          productBaseSlug,
          technique,
          placementKey,
          enabledFonts,
          enabledThreadColors,
          enabledVariantColors,
          printAreaX,
          printAreaY,
          printAreaWidth,
          printAreaHeight
        }
      });
      await prisma.templateLayer.deleteMany({ where: { templateId } });
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        await prisma.templateLayer.create({
          data: {
            templateId,
            layerType: layer.layerType,
            label: layer.label,
            customerEditable: layer.customerEditable ?? true,
            positionX: layer.positionX ?? 10,
            positionY: layer.positionY ?? 10,
            positionWidth: layer.positionWidth ?? 80,
            positionHeight: layer.positionHeight ?? 80,
            sortOrder: i,
            maxChars: layer.maxChars ?? null,
            placeholder: layer.placeholder ?? null,
            defaultFont: layer.defaultFont ?? "script",
            defaultColor: layer.defaultColor ?? "#000000",
            fixedImageUrl: layer.fixedImageUrl ?? null
          }
        });
      }
      return json({ success: true, templateId });
    }
    if (intent === "toggle_active") {
      const templateId = formData.get("templateId");
      const template = await prisma.productTemplate.findUnique({ where: { id: templateId } });
      if (template) {
        await prisma.productTemplate.update({
          where: { id: templateId },
          data: { isActive: !template.isActive }
        });
      }
      return json({ success: true });
    }
    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (error) {
    console.error("Action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};
function ProductBasesPage() {
  const { templates, productBases, threadColors, fonts } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  const shopify2 = useAppBridge();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedBaseSlug, setSelectedBaseSlug] = useState("");
  const [selectedTechnique, setSelectedTechnique] = useState("");
  const [selectedPlacement, setSelectedPlacement] = useState("");
  const [layers, setLayers] = useState([]);
  const [previewVariantColor, setPreviewVariantColor] = useState("");
  const [enabledFontKeys, setEnabledFontKeys] = useState(["script", "block"]);
  const [enabledThreadColorHexes, setEnabledThreadColorHexes] = useState([]);
  const [enabledVariantColors, setEnabledVariantColors] = useState([]);
  const [printAreaX, setPrintAreaX] = useState(25);
  const [printAreaY, setPrintAreaY] = useState(15);
  const [printAreaWidth, setPrintAreaWidth] = useState(50);
  const [printAreaHeight, setPrintAreaHeight] = useState(35);
  const [shopifyProductId, setShopifyProductId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productHandle, setProductHandle] = useState("");
  const [showMockupModal, setShowMockupModal] = useState(false);
  const [mockupTemplateId, setMockupTemplateId] = useState("");
  const [mockupVariantColor, setMockupVariantColor] = useState("");
  const [mockupVariantColorHex, setMockupVariantColorHex] = useState("");
  const [mockupImageUrl, setMockupImageUrl] = useState("");
  const [mockupFile, setMockupFile] = useState(null);
  const [mockupUploadMode, setMockupUploadMode] = useState("file");
  const [isUploading, setIsUploading] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editProductTitle, setEditProductTitle] = useState("");
  const [editProductHandle, setEditProductHandle] = useState("");
  const selectedBase = productBases.find((pb) => pb.slug === selectedBaseSlug);
  const availableTechniques = (selectedBase == null ? void 0 : selectedBase.techniques) || [];
  const selectedBaseFromRegistry = PRODUCT_BASES.find((pb) => pb.slug === selectedBaseSlug);
  const availablePlacements = selectedBaseFromRegistry && selectedTechnique ? getPlacementsForTechnique(selectedBaseFromRegistry, selectedTechnique) : [];
  const selectedPlacementSpec = availablePlacements.find((p) => p.placementKey === selectedPlacement);
  const resetWizard = useCallback(() => {
    setWizardStep(1);
    setSelectedBaseSlug("");
    setSelectedTechnique("");
    setSelectedPlacement("");
    setLayers([]);
    setEnabledFontKeys(["script", "block"]);
    setEnabledThreadColorHexes([]);
    setEnabledVariantColors([]);
    setPrintAreaX(25);
    setPrintAreaY(15);
    setPrintAreaWidth(50);
    setPrintAreaHeight(35);
    setShopifyProductId("");
    setProductTitle("");
    setProductHandle("");
    setEditingTemplateId(null);
  }, []);
  const loadTemplateForEdit = useCallback((template) => {
    setEditingTemplateId(template.id);
    setSelectedBaseSlug(template.productBaseSlug);
    setSelectedTechnique(template.technique);
    setSelectedPlacement(template.placementKey);
    setLayers(template.layers.map((l) => ({
      layerType: l.layerType,
      label: l.label,
      customerEditable: l.customerEditable,
      positionX: l.positionX,
      positionY: l.positionY,
      positionWidth: l.positionWidth,
      positionHeight: l.positionHeight,
      maxChars: l.maxChars,
      placeholder: l.placeholder,
      defaultFont: l.defaultFont,
      defaultColor: l.defaultColor,
      fixedImageUrl: l.fixedImageUrl
    })));
    try {
      setEnabledFontKeys(JSON.parse(template.enabledFonts));
    } catch {
      setEnabledFontKeys(["script", "block"]);
    }
    try {
      const tc = JSON.parse(template.enabledThreadColors);
      setEnabledThreadColorHexes(tc);
    } catch {
      setEnabledThreadColorHexes([]);
    }
    try {
      const vc = JSON.parse(template.enabledVariantColors);
      setEnabledVariantColors(vc);
    } catch {
      setEnabledVariantColors([]);
    }
    const editBase = PRODUCT_BASES.find((pb) => pb.slug === template.productBaseSlug);
    const editPlacement = editBase == null ? void 0 : editBase.placements.find((p) => p.placementKey === template.placementKey);
    if (editPlacement) {
      setPrintAreaX(editPlacement.mockupPosition.x);
      setPrintAreaY(editPlacement.mockupPosition.y);
      setPrintAreaWidth(editPlacement.mockupPosition.width);
      setPrintAreaHeight(editPlacement.mockupPosition.height);
    } else {
      setPrintAreaX(template.printAreaX);
      setPrintAreaY(template.printAreaY);
      setPrintAreaWidth(template.printAreaWidth);
      setPrintAreaHeight(template.printAreaHeight);
    }
    setShopifyProductId(template.shopifyProductId);
    setProductTitle(template.productTitle);
    setProductHandle(template.productHandle || "");
    setWizardStep(1);
    setShowWizard(true);
  }, [templates]);
  useEffect(() => {
    if (selectedPlacementSpec && !editingTemplateId) {
      setPrintAreaX(selectedPlacementSpec.mockupPosition.x);
      setPrintAreaY(selectedPlacementSpec.mockupPosition.y);
      setPrintAreaWidth(selectedPlacementSpec.mockupPosition.width);
      setPrintAreaHeight(selectedPlacementSpec.mockupPosition.height);
    }
  }, [selectedPlacementSpec, editingTemplateId]);
  useEffect(() => {
    if (selectedTechnique && layers.length === 0 && !editingTemplateId) {
      if (selectedTechnique === "embroidery") {
        setLayers([{
          layerType: "text",
          label: "Monogram Text",
          customerEditable: true,
          maxChars: (selectedBase == null ? void 0 : selectedBase.category) === "hat" ? 3 : 20,
          placeholder: (selectedBase == null ? void 0 : selectedBase.category) === "hat" ? "ABC" : "Your Text",
          defaultFont: "script",
          defaultColor: "#000000",
          positionX: 10,
          positionY: 10,
          positionWidth: 80,
          positionHeight: 80
        }]);
      } else {
        setLayers([{
          layerType: "text",
          label: "Custom Text",
          customerEditable: true,
          maxChars: 30,
          placeholder: "Your Text Here",
          defaultFont: "block",
          defaultColor: "#000000",
          positionX: 10,
          positionY: 20,
          positionWidth: 80,
          positionHeight: 60
        }]);
      }
    }
  }, [selectedTechnique]);
  useEffect(() => {
    if (actionData && "success" in actionData && actionData.success && showWizard) {
      setShowWizard(false);
      resetWizard();
    }
  }, [actionData]);
  const handleSaveTemplate = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", editingTemplateId ? "update_template" : "create_template");
    if (editingTemplateId) {
      formData.set("templateId", editingTemplateId);
    }
    formData.set("productBaseSlug", selectedBaseSlug);
    formData.set("shopifyProductId", shopifyProductId);
    formData.set("productTitle", productTitle);
    formData.set("productHandle", productHandle);
    formData.set("technique", selectedTechnique);
    formData.set("placementKey", selectedPlacement);
    formData.set("enabledFonts", JSON.stringify(enabledFontKeys));
    formData.set("enabledThreadColors", JSON.stringify(enabledThreadColorHexes));
    formData.set("enabledVariantColors", JSON.stringify(enabledVariantColors));
    formData.set("printAreaX", String(printAreaX));
    formData.set("printAreaY", String(printAreaY));
    formData.set("printAreaWidth", String(printAreaWidth));
    formData.set("printAreaHeight", String(printAreaHeight));
    formData.set("layers", JSON.stringify(layers));
    submit(formData, { method: "post" });
  }, [editingTemplateId, selectedBaseSlug, shopifyProductId, productTitle, productHandle, selectedTechnique, selectedPlacement, enabledFontKeys, enabledThreadColorHexes, enabledVariantColors, printAreaX, printAreaY, printAreaWidth, printAreaHeight, layers, submit]);
  const handleDeleteTemplate = useCallback((templateId) => {
    if (!confirm("Delete this product template? This cannot be undone.")) return;
    const formData = new FormData();
    formData.set("intent", "delete_template");
    formData.set("templateId", templateId);
    submit(formData, { method: "post" });
  }, [submit]);
  const handlePurgeAllTemplates = useCallback(() => {
    if (!confirm("⚠️ PURGE ALL TEMPLATES? This will delete every template, layer, and mockup in the database. This cannot be undone!")) return;
    if (!confirm("Are you REALLY sure? Type OK to confirm.")) return;
    const formData = new FormData();
    formData.set("intent", "purge_all_templates");
    submit(formData, { method: "post" });
  }, [submit]);
  const handleToggleActive = useCallback((templateId) => {
    const formData = new FormData();
    formData.set("intent", "toggle_active");
    formData.set("templateId", templateId);
    submit(formData, { method: "post" });
  }, [submit]);
  const handleAddMockup = useCallback(async () => {
    if (mockupUploadMode === "file" && mockupFile) {
      setIsUploading(true);
      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(mockupFile);
        });
        const base64 = await base64Promise;
        const formData = new FormData();
        formData.set("intent", "upload_mockup_file");
        formData.set("templateId", mockupTemplateId);
        formData.set("variantColor", mockupVariantColor);
        formData.set("variantColorHex", mockupVariantColorHex);
        formData.set("isDefault", mockupVariantColor === "Default" ? "true" : "false");
        formData.set("fileBase64", base64);
        formData.set("fileName", mockupFile.name);
        formData.set("fileSize", String(mockupFile.size));
        formData.set("mimeType", mockupFile.type);
        submit(formData, { method: "post" });
      } catch (err) {
        console.error("File upload error:", err);
      } finally {
        setIsUploading(false);
      }
    } else {
      const formData = new FormData();
      formData.set("intent", "add_mockup");
      formData.set("templateId", mockupTemplateId);
      formData.set("variantColor", mockupVariantColor);
      formData.set("variantColorHex", mockupVariantColorHex);
      formData.set("imageUrl", mockupImageUrl);
      formData.set("isDefault", mockupVariantColor === "Default" ? "true" : "false");
      submit(formData, { method: "post" });
    }
    setShowMockupModal(false);
    setMockupImageUrl("");
    setMockupVariantColor("");
    setMockupFile(null);
  }, [mockupTemplateId, mockupVariantColor, mockupVariantColorHex, mockupImageUrl, mockupFile, mockupUploadMode, submit]);
  const handleUpdateProductId = useCallback(async () => {
    try {
      const selected = await shopify2.resourcePicker({
        type: "product",
        multiple: false,
        action: "select"
      });
      if (selected && selected.length > 0) {
        const product = selected[0];
        const formData = new FormData();
        formData.set("intent", "update_product_id");
        formData.set("templateId", editTemplateId);
        formData.set("shopifyProductId", product.id);
        formData.set("productTitle", product.title);
        formData.set("productHandle", product.handle || "");
        submit(formData, { method: "post" });
        setShowEditModal(false);
      }
    } catch (error) {
      console.error("Resource picker error:", error);
    }
  }, [shopify2, editTemplateId, submit]);
  const handleSaveProductId = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "update_product_id");
    formData.set("templateId", editTemplateId);
    formData.set("shopifyProductId", editProductId);
    formData.set("productTitle", editProductTitle);
    formData.set("productHandle", editProductHandle);
    submit(formData, { method: "post" });
    setShowEditModal(false);
  }, [editTemplateId, editProductId, editProductTitle, editProductHandle, submit]);
  const handleDeleteMockup = useCallback((mockupId) => {
    const formData = new FormData();
    formData.set("intent", "delete_mockup");
    formData.set("mockupId", mockupId);
    submit(formData, { method: "post" });
  }, [submit]);
  const renderStep1 = () => /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
    /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Step 1: Select Product Base" }),
    /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", tone: "subdued", children: "Choose the Printful product this template is for. Each base has pre-configured print specs, placements, and variant colors." }),
    /* @__PURE__ */ jsx(
      ChoiceList,
      {
        title: "Product Base",
        choices: productBases.map((pb) => ({
          label: `${pb.name} (${pb.brand} ${pb.model}) — ${pb.category}`,
          value: pb.slug,
          helpText: `${pb.variants.length} colors, ${pb.techniques.map((t) => t.displayName).join(", ")}`
        })),
        selected: selectedBaseSlug ? [selectedBaseSlug] : [],
        onChange: (val) => {
          setSelectedBaseSlug(val[0]);
          setSelectedTechnique("");
          setSelectedPlacement("");
          setLayers([]);
        }
      }
    )
  ] });
  const renderStep2 = () => /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
    /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Step 2: Choose Technique & Placement" }),
    /* @__PURE__ */ jsx(
      Select,
      {
        label: "Technique",
        options: [
          { label: "Select technique...", value: "" },
          ...availableTechniques.map((t) => ({
            label: `${t.displayName}${t.isDefault ? " (default)" : ""}`,
            value: t.key
          }))
        ],
        value: selectedTechnique,
        onChange: (val) => {
          setSelectedTechnique(val);
          setSelectedPlacement("");
          setLayers([]);
        }
      }
    ),
    selectedTechnique && /* @__PURE__ */ jsx(
      Select,
      {
        label: "Placement",
        options: [
          { label: "Select placement...", value: "" },
          ...availablePlacements.map((p) => ({
            label: `${p.displayName} (${p.maxAreaInches.width}" × ${p.maxAreaInches.height}" — ${p.fileSizePx.width}×${p.fileSizePx.height}px)`,
            value: p.placementKey
          }))
        ],
        value: selectedPlacement,
        onChange: setSelectedPlacement
      }
    ),
    selectedPlacementSpec && /* @__PURE__ */ jsx(Banner, { tone: "info", children: /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
      "Print file: ",
      selectedPlacementSpec.fileSizePx.width,
      " × ",
      selectedPlacementSpec.fileSizePx.height,
      "px at ",
      selectedPlacementSpec.dpi,
      " DPI (",
      selectedPlacementSpec.maxAreaInches.width,
      '" × ',
      selectedPlacementSpec.maxAreaInches.height,
      '")',
      selectedPlacementSpec.supports3dPuff && " — 3D Puff available"
    ] }) })
  ] });
  const editorMockupUrl = (() => {
    var _a2, _b;
    if (previewVariantColor && (selectedBaseFromRegistry == null ? void 0 : selectedBaseFromRegistry.variantMockups)) {
      const url = selectedBaseFromRegistry.variantMockups[previewVariantColor];
      if (url) return url;
    }
    if (editingTemplateId) {
      const tmpl = templates.find((t) => t.id === editingTemplateId);
      if ((_b = (_a2 = tmpl == null ? void 0 : tmpl.mockupImages) == null ? void 0 : _a2[0]) == null ? void 0 : _b.imageUrl) return tmpl.mockupImages[0].imageUrl;
    }
    return (selectedBaseFromRegistry == null ? void 0 : selectedBaseFromRegistry.defaultMockupUrl) || void 0;
  })();
  const renderStep3 = () => /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
    /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Step 3: Visual Layer Editor" }),
    /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", tone: "subdued", children: "Drag the print area to position it on the mockup. Add layers and drag them within the print area. Use the properties panel on the right to configure each layer." }),
    (selectedBaseFromRegistry == null ? void 0 : selectedBaseFromRegistry.variantMockups) && Object.keys(selectedBaseFromRegistry.variantMockups).length > 1 && /* @__PURE__ */ jsxs(InlineStack, { gap: "200", align: "start", blockAlign: "center", children: [
      /* @__PURE__ */ jsx(Text, { as: "span", variant: "bodyMd", fontWeight: "semibold", children: "Preview Color:" }),
      /* @__PURE__ */ jsxs(
        "select",
        {
          value: previewVariantColor,
          onChange: (e) => setPreviewVariantColor(e.target.value),
          style: {
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "14px",
            cursor: "pointer"
          },
          children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Default" }),
            Object.keys(selectedBaseFromRegistry.variantMockups).map((colorName) => /* @__PURE__ */ jsx("option", { value: colorName, children: colorName }, colorName))
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      LayerEditor,
      {
        layers,
        onLayersChange: (newLayers) => setLayers(newLayers),
        printArea: { x: printAreaX, y: printAreaY, width: printAreaWidth, height: printAreaHeight },
        onPrintAreaChange: (pa) => {
          setPrintAreaX(pa.x);
          setPrintAreaY(pa.y);
          setPrintAreaWidth(pa.width);
          setPrintAreaHeight(pa.height);
        },
        fonts: fonts.map((f) => ({ key: f.key, displayName: f.displayName })),
        productCategory: selectedBase == null ? void 0 : selectedBase.category,
        technique: selectedTechnique,
        mockupImageUrl: editorMockupUrl
      }
    )
  ] });
  const renderStep4 = () => /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
    /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Step 4: Fonts, Thread Colors & Variant Colors" }),
    /* @__PURE__ */ jsx(Text, { as: "h3", variant: "headingSm", children: "Enabled Fonts" }),
    /* @__PURE__ */ jsx(InlineStack, { gap: "200", wrap: true, children: fonts.map((f) => /* @__PURE__ */ jsx(
      Checkbox,
      {
        label: f.displayName,
        checked: enabledFontKeys.includes(f.key),
        onChange: (checked) => {
          if (checked) {
            setEnabledFontKeys([...enabledFontKeys, f.key]);
          } else {
            setEnabledFontKeys(enabledFontKeys.filter((k) => k !== f.key));
          }
        }
      },
      f.key
    )) }),
    selectedTechnique === "embroidery" && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Divider, {}),
      /* @__PURE__ */ jsx(Text, { as: "h3", variant: "headingSm", children: "Thread Colors (leave all unchecked = all 15 available)" }),
      /* @__PURE__ */ jsx(InlineStack, { gap: "200", wrap: true, children: threadColors.map((tc) => /* @__PURE__ */ jsx(
        Checkbox,
        {
          label: /* @__PURE__ */ jsxs(InlineStack, { gap: "100", blockAlign: "center", children: [
            /* @__PURE__ */ jsx("div", { style: {
              width: 16,
              height: 16,
              borderRadius: 3,
              backgroundColor: tc.hex,
              border: "1px solid #ccc",
              display: "inline-block"
            } }),
            /* @__PURE__ */ jsx("span", { children: tc.name })
          ] }),
          checked: enabledThreadColorHexes.includes(tc.hex),
          onChange: (checked) => {
            if (checked) {
              setEnabledThreadColorHexes([...enabledThreadColorHexes, tc.hex]);
            } else {
              setEnabledThreadColorHexes(enabledThreadColorHexes.filter((h) => h !== tc.hex));
            }
          }
        },
        tc.hex
      )) })
    ] }),
    /* @__PURE__ */ jsx(Divider, {}),
    /* @__PURE__ */ jsx(Text, { as: "h3", variant: "headingSm", children: "Variant Colors (leave all unchecked = all colors available)" }),
    /* @__PURE__ */ jsx(InlineStack, { gap: "200", wrap: true, children: selectedBase == null ? void 0 : selectedBase.variants.map((v) => /* @__PURE__ */ jsx(
      Checkbox,
      {
        label: /* @__PURE__ */ jsxs(InlineStack, { gap: "100", blockAlign: "center", children: [
          /* @__PURE__ */ jsx("div", { style: {
            width: 16,
            height: 16,
            borderRadius: 3,
            backgroundColor: v.colorHex,
            border: "1px solid #ccc",
            display: "inline-block"
          } }),
          /* @__PURE__ */ jsx("span", { children: v.color })
        ] }),
        checked: enabledVariantColors.includes(v.color),
        onChange: (checked) => {
          if (checked) {
            setEnabledVariantColors([...enabledVariantColors, v.color]);
          } else {
            setEnabledVariantColors(enabledVariantColors.filter((c) => c !== v.color));
          }
        }
      },
      v.color
    )) })
  ] });
  const handlePickProduct = useCallback(async () => {
    try {
      const selected = await shopify2.resourcePicker({
        type: "product",
        multiple: false,
        action: "select"
      });
      if (selected && selected.length > 0) {
        const product = selected[0];
        setShopifyProductId(product.id);
        setProductTitle(product.title);
        setProductHandle(product.handle || "");
      }
    } catch (error) {
      console.error("Resource picker error:", error);
    }
  }, [shopify2]);
  const renderStep6 = () => /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
    /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Step 6: Link Shopify Product" }),
    /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", tone: "subdued", children: "Select the Shopify product this template will be linked to. The product picker will set the correct product ID automatically." }),
    shopifyProductId ? /* @__PURE__ */ jsx(Banner, { tone: "success", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
      /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
        /* @__PURE__ */ jsx("strong", { children: "Selected:" }),
        " ",
        productTitle
      ] }),
      /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodySm", tone: "subdued", children: [
        "ID: ",
        shopifyProductId,
        productHandle ? ` — Handle: ${productHandle}` : ""
      ] })
    ] }) }) : null,
    /* @__PURE__ */ jsxs(InlineStack, { gap: "300", children: [
      /* @__PURE__ */ jsx(Button, { variant: "primary", onClick: handlePickProduct, children: shopifyProductId ? "Change Product" : "Select Product" }),
      shopifyProductId && /* @__PURE__ */ jsx(
        Button,
        {
          variant: "plain",
          tone: "critical",
          onClick: () => {
            setShopifyProductId("");
            setProductTitle("");
            setProductHandle("");
          },
          children: "Clear Selection"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(Divider, {}),
    /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodySm", tone: "subdued", children: "Or enter the product ID manually:" }),
    /* @__PURE__ */ jsxs(FormLayout, { children: [
      /* @__PURE__ */ jsx(
        TextField,
        {
          label: "Shopify Product ID",
          value: shopifyProductId,
          onChange: setShopifyProductId,
          autoComplete: "off",
          placeholder: "gid://shopify/Product/123456789 or just 123456789",
          helpText: "The GID or numeric product ID"
        }
      ),
      /* @__PURE__ */ jsx(
        TextField,
        {
          label: "Product Title",
          value: productTitle,
          onChange: setProductTitle,
          autoComplete: "off",
          placeholder: "Custom Monogram Hat"
        }
      ),
      /* @__PURE__ */ jsx(
        TextField,
        {
          label: "Product Handle (optional)",
          value: productHandle,
          onChange: setProductHandle,
          autoComplete: "off",
          placeholder: "custom-monogram-hat"
        }
      )
    ] })
  ] });
  const renderSummary = () => {
    const base = productBases.find((pb) => pb.slug === selectedBaseSlug);
    return /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
      editingTemplateId && /* @__PURE__ */ jsx(Banner, { tone: "warning", children: /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", children: 'You are editing an existing template. Clicking "Save Changes" will update it.' }) }),
      /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: editingTemplateId ? "Review & Save" : "Review & Create" }),
      /* @__PURE__ */ jsx(Box, { padding: "400", background: "bg-surface-secondary", borderRadius: "200", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Product Base:" }),
          " ",
          base == null ? void 0 : base.name,
          " (",
          base == null ? void 0 : base.brand,
          " ",
          base == null ? void 0 : base.model,
          ")"
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Technique:" }),
          " ",
          selectedTechnique
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Placement:" }),
          " ",
          selectedPlacement
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Layers:" }),
          " ",
          layers.length,
          " (",
          layers.map((l) => l.label).join(", "),
          ")"
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Fonts:" }),
          " ",
          enabledFontKeys.join(", ")
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Thread Colors:" }),
          " ",
          enabledThreadColorHexes.length || "All 15"
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Variant Colors:" }),
          " ",
          enabledVariantColors.length || "All"
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Print Area:" }),
          " x:",
          printAreaX,
          "% y:",
          printAreaY,
          "% w:",
          printAreaWidth,
          "% h:",
          printAreaHeight,
          "%"
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          /* @__PURE__ */ jsx("strong", { children: "Shopify Product:" }),
          " ",
          productTitle,
          " (",
          shopifyProductId,
          ")"
        ] })
      ] }) })
    ] });
  };
  const wizardSteps = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep6, renderSummary];
  const stepTitles = ["Product Base", "Technique", "Visual Editor", "Options", "Shopify Link", "Review"];
  const totalSteps = wizardSteps.length;
  const canAdvance = () => {
    switch (wizardStep) {
      case 1:
        return !!selectedBaseSlug;
      case 2:
        return !!selectedTechnique && !!selectedPlacement;
      case 3:
        return layers.length > 0;
      case 4:
        return enabledFontKeys.length > 0;
      case 5:
        return !!shopifyProductId && !!productTitle;
      case 6:
        return true;
      default:
        return false;
    }
  };
  const getBaseInfo = (slug) => {
    const base = productBases.find((pb) => pb.slug === slug);
    return base ? `${base.brand} ${base.model}` : slug;
  };
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsx(TitleBar, { title: "Product Templates" }),
    /* @__PURE__ */ jsx(Layout, { children: /* @__PURE__ */ jsxs(Layout.Section, { children: [
      actionData && "error" in actionData && /* @__PURE__ */ jsx(Banner, { tone: "critical", children: /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", children: actionData.error }) }),
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
        /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
          /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Product Templates" }),
          /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
            templates.length > 0 && /* @__PURE__ */ jsx(Button, { variant: "plain", tone: "critical", onClick: handlePurgeAllTemplates, children: "Purge All" }),
            /* @__PURE__ */ jsx(Button, { variant: "primary", onClick: () => {
              resetWizard();
              setShowWizard(true);
            }, children: "+ New Template" })
          ] })
        ] }),
        templates.length === 0 ? /* @__PURE__ */ jsx(
          EmptyState,
          {
            heading: "No product templates yet",
            image: "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png",
            children: /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", children: "Create a template to link a Shopify product to a Printful product base with customization options." })
          }
        ) : /* @__PURE__ */ jsx(
          IndexTable,
          {
            itemCount: templates.length,
            headings: [
              { title: "Product" },
              { title: "Base" },
              { title: "Technique" },
              { title: "Placement" },
              { title: "Layers" },
              { title: "Mockups" },
              { title: "Status" },
              { title: "Actions" }
            ],
            selectable: false,
            children: templates.map((template, index2) => /* @__PURE__ */ jsxs(IndexTable.Row, { id: template.id, position: index2, children: [
              /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { as: "span", variant: "bodyMd", fontWeight: "bold", children: template.productTitle }) }),
              /* @__PURE__ */ jsx(IndexTable.Cell, { children: getBaseInfo(template.productBaseSlug) }),
              /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Badge, { children: template.technique }) }),
              /* @__PURE__ */ jsx(IndexTable.Cell, { children: template.placementKey }),
              /* @__PURE__ */ jsxs(IndexTable.Cell, { children: [
                template.layers.length,
                " layer(s)"
              ] }),
              /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
                /* @__PURE__ */ jsxs(Text, { as: "span", variant: "bodyMd", children: [
                  template.mockupImages.length,
                  " image(s)"
                ] }),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "plain",
                    onClick: () => {
                      setMockupTemplateId(template.id);
                      setMockupVariantColor("Default");
                      setMockupVariantColorHex("#ffffff");
                      setMockupFile(null);
                      setMockupImageUrl("");
                      setMockupUploadMode("file");
                      setShowMockupModal(true);
                    },
                    children: "+ Add"
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsxs(InlineStack, { gap: "100", blockAlign: "center", children: [
                /* @__PURE__ */ jsx(Badge, { tone: template.isActive ? "success" : void 0, children: template.isActive ? "Active" : "Inactive" }),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "plain",
                    size: "slim",
                    onClick: () => handleToggleActive(template.id),
                    children: "Toggle"
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "plain",
                    onClick: () => loadTemplateForEdit(template),
                    children: "Edit"
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "plain",
                    onClick: () => {
                      setEditTemplateId(template.id);
                      setEditProductId(template.shopifyProductId);
                      setEditProductTitle(template.productTitle);
                      setEditProductHandle(template.productHandle || "");
                      setShowEditModal(true);
                    },
                    children: "Link"
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "plain",
                    tone: "critical",
                    onClick: () => handleDeleteTemplate(template.id),
                    children: "Delete"
                  }
                )
              ] }) })
            ] }, template.id))
          }
        ),
        templates.filter((t) => t.mockupImages.length > 0).map((template) => /* @__PURE__ */ jsx(Box, { padding: "400", background: "bg-surface-secondary", borderRadius: "200", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
          /* @__PURE__ */ jsxs(Text, { as: "h3", variant: "headingSm", children: [
            "Mockups: ",
            template.productTitle
          ] }),
          /* @__PURE__ */ jsx(InlineStack, { gap: "300", wrap: true, children: template.mockupImages.map((img) => /* @__PURE__ */ jsxs(BlockStack, { gap: "100", inlineAlign: "center", children: [
            /* @__PURE__ */ jsx(Thumbnail, { source: img.imageUrl, alt: img.variantColor, size: "large" }),
            /* @__PURE__ */ jsxs(InlineStack, { gap: "100", blockAlign: "center", children: [
              /* @__PURE__ */ jsx("div", { style: {
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: img.variantColorHex || "#ccc",
                border: "1px solid #999"
              } }),
              /* @__PURE__ */ jsx(Text, { as: "span", variant: "bodySm", children: img.variantColor })
            ] }),
            /* @__PURE__ */ jsx(Button, { variant: "plain", tone: "critical", onClick: () => handleDeleteMockup(img.id), children: "Remove" })
          ] }, img.id)) })
        ] }) }, template.id))
      ] }) })
    ] }) }),
    /* @__PURE__ */ jsx(
      Modal,
      {
        open: showWizard,
        onClose: () => setShowWizard(false),
        title: `${editingTemplateId ? "Edit" : "New"} Product Template — Step ${wizardStep} of ${totalSteps}: ${stepTitles[wizardStep - 1]}`,
        primaryAction: wizardStep === totalSteps ? { content: editingTemplateId ? "Save Changes" : "Create Template", onAction: handleSaveTemplate, loading: isLoading } : { content: "Next", onAction: () => setWizardStep(wizardStep + 1), disabled: !canAdvance() },
        secondaryActions: wizardStep > 1 ? [{ content: "Back", onAction: () => setWizardStep(wizardStep - 1) }] : [{ content: "Cancel", onAction: () => setShowWizard(false) }],
        size: "large",
        children: /* @__PURE__ */ jsx(Modal.Section, { children: wizardSteps[wizardStep - 1]() })
      }
    ),
    /* @__PURE__ */ jsx(
      Modal,
      {
        open: showMockupModal,
        onClose: () => setShowMockupModal(false),
        title: "Add Mockup Image",
        primaryAction: {
          content: isUploading ? "Uploading..." : "Add Mockup",
          onAction: handleAddMockup,
          disabled: !mockupVariantColor || (mockupUploadMode === "url" ? !mockupImageUrl : !mockupFile),
          loading: isLoading || isUploading
        },
        secondaryActions: [{ content: "Cancel", onAction: () => setShowMockupModal(false) }],
        children: /* @__PURE__ */ jsx(Modal.Section, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", tone: "subdued", children: "Add a blank mockup photo for a specific variant color. The monogram preview will be overlaid on this image." }),
          (() => {
            const template = templates.find((t) => t.id === mockupTemplateId);
            const base = template ? productBases.find((pb) => pb.slug === template.productBaseSlug) : null;
            const variantOptions = base ? [
              { label: "Default (fallback)", value: "Default" },
              ...base.variants.map((v) => ({ label: v.color, value: v.color }))
            ] : [{ label: "Default", value: "Default" }];
            return /* @__PURE__ */ jsx(
              Select,
              {
                label: "Variant Color",
                options: variantOptions,
                value: mockupVariantColor,
                onChange: (val) => {
                  setMockupVariantColor(val);
                  const variant = base == null ? void 0 : base.variants.find((v) => v.color === val);
                  setMockupVariantColorHex((variant == null ? void 0 : variant.colorHex) || "#ffffff");
                }
              }
            );
          })(),
          /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                variant: mockupUploadMode === "file" ? "primary" : "plain",
                onClick: () => setMockupUploadMode("file"),
                children: "Upload File"
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                variant: mockupUploadMode === "url" ? "primary" : "plain",
                onClick: () => setMockupUploadMode("url"),
                children: "Paste URL"
              }
            )
          ] }),
          mockupUploadMode === "file" ? /* @__PURE__ */ jsx(
            DropZone,
            {
              accept: "image/*",
              type: "image",
              onDrop: (_dropFiles, acceptedFiles) => {
                if (acceptedFiles.length > 0) {
                  setMockupFile(acceptedFiles[0]);
                }
              },
              children: mockupFile ? /* @__PURE__ */ jsx(Box, { padding: "400", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", inlineAlign: "center", children: [
                /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
                  mockupFile.name,
                  " (",
                  (mockupFile.size / 1024).toFixed(1),
                  " KB)"
                ] }),
                /* @__PURE__ */ jsx(Button, { variant: "plain", onClick: () => setMockupFile(null), children: "Remove" })
              ] }) }) : /* @__PURE__ */ jsx(DropZone.FileUpload, { actionHint: "Accepts PNG, JPG images" })
            }
          ) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(
              TextField,
              {
                label: "Mockup Image URL",
                value: mockupImageUrl,
                onChange: setMockupImageUrl,
                autoComplete: "off",
                placeholder: "https://cdn.shopify.com/... or any public image URL",
                helpText: "Paste a direct URL to the blank mockup image."
              }
            ),
            mockupImageUrl && /* @__PURE__ */ jsx(Box, { padding: "200", children: /* @__PURE__ */ jsx(
              "img",
              {
                src: mockupImageUrl,
                alt: "Preview",
                style: { maxWidth: "100%", maxHeight: 200, borderRadius: 8 }
              }
            ) })
          ] })
        ] }) })
      }
    ),
    /* @__PURE__ */ jsx(
      Modal,
      {
        open: showEditModal,
        onClose: () => setShowEditModal(false),
        title: "Edit Template Product Link",
        primaryAction: {
          content: "Pick Product",
          onAction: handleUpdateProductId,
          loading: isLoading
        },
        secondaryActions: [
          {
            content: "Save Manual ID",
            onAction: handleSaveProductId,
            disabled: !editProductId
          },
          { content: "Cancel", onAction: () => setShowEditModal(false) }
        ],
        children: /* @__PURE__ */ jsx(Modal.Section, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
          /* @__PURE__ */ jsx(Banner, { tone: "info", children: /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", children: 'Click "Pick Product" to use the Shopify product picker, or manually edit the ID below and click "Save Manual ID".' }) }),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Shopify Product ID",
              value: editProductId,
              onChange: setEditProductId,
              autoComplete: "off",
              helpText: "GID format (gid://shopify/Product/...) or numeric ID"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Product Title",
              value: editProductTitle,
              onChange: setEditProductTitle,
              autoComplete: "off"
            }
          ),
          /* @__PURE__ */ jsx(
            TextField,
            {
              label: "Product Handle",
              value: editProductHandle,
              onChange: setEditProductHandle,
              autoComplete: "off"
            }
          )
        ] }) })
      }
    )
  ] });
}
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: ProductBasesPage,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
function AdditionalPage() {
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsx(TitleBar, { title: "Additional page" }),
    /* @__PURE__ */ jsxs(Layout, { children: [
      /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          "The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using",
          " ",
          /* @__PURE__ */ jsx(
            Link$1,
            {
              url: "https://shopify.dev/docs/apps/tools/app-bridge",
              target: "_blank",
              removeUnderline: true,
              children: "App Bridge"
            }
          ),
          "."
        ] }),
        /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodyMd", children: [
          "To create your own page and have it show up in the app navigation, add a page inside ",
          /* @__PURE__ */ jsx(Code, { children: "app/routes" }),
          ", and a link to it in the ",
          /* @__PURE__ */ jsx(Code, { children: "<NavMenu>" }),
          " component found in ",
          /* @__PURE__ */ jsx(Code, { children: "app/routes/app.jsx" }),
          "."
        ] })
      ] }) }) }),
      /* @__PURE__ */ jsx(Layout.Section, { variant: "oneThird", children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
        /* @__PURE__ */ jsx(Text, { as: "h2", variant: "headingMd", children: "Resources" }),
        /* @__PURE__ */ jsx(List, { children: /* @__PURE__ */ jsx(List.Item, { children: /* @__PURE__ */ jsx(
          Link$1,
          {
            url: "https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav",
            target: "_blank",
            removeUnderline: true,
            children: "App nav best practices"
          }
        ) }) })
      ] }) }) })
    ] })
  ] });
}
function Code({ children }) {
  return /* @__PURE__ */ jsx(
    Box,
    {
      as: "span",
      padding: "025",
      paddingInlineStart: "100",
      paddingInlineEnd: "100",
      background: "bg-surface-active",
      borderWidth: "025",
      borderColor: "border",
      borderRadius: "100",
      children: /* @__PURE__ */ jsx("code", { children })
    }
  );
}
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: AdditionalPage
}, Symbol.toStringTag, { value: "Module" }));
const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const orders = await prisma.personalizationOrder.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    completed: orders.filter((o) => o.status === "completed").length,
    failed: orders.filter((o) => o.status === "failed").length,
    processing: orders.filter(
      (o) => ["generating", "uploading", "submitting"].includes(o.status)
    ).length
  };
  return json({ orders, stats });
};
function statusBadge(status) {
  switch (status) {
    case "pending":
      return /* @__PURE__ */ jsx(Badge, { tone: "attention", children: "Pending" });
    case "generating":
      return /* @__PURE__ */ jsx(Badge, { tone: "info", children: "Generating" });
    case "uploading":
      return /* @__PURE__ */ jsx(Badge, { tone: "info", children: "Uploading" });
    case "submitting":
      return /* @__PURE__ */ jsx(Badge, { tone: "info", children: "Submitting" });
    case "completed":
      return /* @__PURE__ */ jsx(Badge, { tone: "success", children: "Completed" });
    case "failed":
      return /* @__PURE__ */ jsx(Badge, { tone: "critical", children: "Failed" });
    default:
      return /* @__PURE__ */ jsx(Badge, { children: status });
  }
}
function threadColorSwatch(color) {
  return /* @__PURE__ */ jsx(Tooltip, { content: color, children: /* @__PURE__ */ jsx(
    "div",
    {
      style: {
        width: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: color,
        border: "1px solid #ccc",
        display: "inline-block"
      }
    }
  ) });
}
function Index() {
  const { orders, stats } = useLoaderData();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (stats.processing > 0 || stats.pending > 0) {
      const interval = setInterval(() => {
        revalidator.revalidate();
      }, 1e4);
      return () => clearInterval(interval);
    }
  }, [stats.processing, stats.pending, revalidator]);
  const resourceName = {
    singular: "personalization order",
    plural: "personalization orders"
  };
  const rowMarkup = orders.map((order, index2) => /* @__PURE__ */ jsxs(IndexTable.Row, { id: order.id, position: index2, children: [
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "bold", as: "span", children: order.shopifyOrderName }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", as: "span", children: order.monogramText }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", as: "span", children: order.monogramStyle }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsxs(InlineStack, { gap: "200", blockAlign: "center", children: [
      threadColorSwatch(order.threadColor),
      /* @__PURE__ */ jsx(Text, { variant: "bodyMd", as: "span", children: order.threadColor })
    ] }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: statusBadge(order.status) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", as: "span", children: order.printfulOrderId ? `#${order.printfulOrderId}` : "-" }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", as: "span", children: order.errorMessage || "-" }) }),
    /* @__PURE__ */ jsx(IndexTable.Cell, { children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", as: "span", children: new Date(order.createdAt).toLocaleString() }) })
  ] }, order.id));
  return /* @__PURE__ */ jsxs(Page, { children: [
    /* @__PURE__ */ jsx(TitleBar, { title: "Printful Custom - Personalization Orders" }),
    /* @__PURE__ */ jsx(BlockStack, { gap: "500", children: /* @__PURE__ */ jsxs(Layout, { children: [
      /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsxs(InlineStack, { gap: "400", wrap: true, children: [
        /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", tone: "subdued", children: "Total Orders" }),
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "headingLg", children: stats.total })
        ] }) }),
        /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", tone: "subdued", children: "Completed" }),
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "headingLg", tone: "success", children: stats.completed })
        ] }) }),
        /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", tone: "subdued", children: "Processing" }),
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "headingLg", children: stats.processing + stats.pending })
        ] }) }),
        /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodyMd", tone: "subdued", children: "Failed" }),
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "headingLg", tone: "critical", children: stats.failed })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: orders.length === 0 ? /* @__PURE__ */ jsx(
        EmptyState,
        {
          heading: "No personalization orders yet",
          image: "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png",
          children: /* @__PURE__ */ jsx("p", { children: "When customers place orders with monogram personalization, they will appear here. The app will automatically generate print files and submit them to Printful." })
        }
      ) : /* @__PURE__ */ jsx(
        IndexTable,
        {
          resourceName,
          itemCount: orders.length,
          headings: [
            { title: "Order" },
            { title: "Monogram" },
            { title: "Style" },
            { title: "Thread Color" },
            { title: "Status" },
            { title: "Printful Order" },
            { title: "Error" },
            { title: "Created" }
          ],
          selectable: false,
          children: rowMarkup
        }
      ) }) })
    ] }) })
  ] });
}
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Index,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-D8gXOalM.js", "imports": ["/assets/index-BXFZJKZ8.js", "/assets/components-CTSN4E9F.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/root-CKC1ALrE.js", "imports": ["/assets/index-BXFZJKZ8.js", "/assets/components-CTSN4E9F.js"], "css": [] }, "routes/api.register-printful-webhook": { "id": "routes/api.register-printful-webhook", "parentId": "root", "path": "api/register-printful-webhook", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.register-printful-webhook-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.test-printful-upload": { "id": "routes/api.test-printful-upload", "parentId": "root", "path": "api/test-printful-upload", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.test-printful-upload-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.orders.create": { "id": "routes/webhooks.orders.create", "parentId": "root", "path": "webhooks/orders/create", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.orders.create-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.printful-webhook": { "id": "routes/api.printful-webhook", "parentId": "root", "path": "api/printful-webhook", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.printful-webhook-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.debug-templates": { "id": "routes/api.debug-templates", "parentId": "root", "path": "api/debug-templates", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.debug-templates-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.print-files.$id": { "id": "routes/api.print-files.$id", "parentId": "root", "path": "api/print-files/:id", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.print-files._id-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.debug-orders": { "id": "routes/api.debug-orders", "parentId": "root", "path": "api/debug-orders", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.debug-orders-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.product-base": { "id": "routes/api.product-base", "parentId": "root", "path": "api/product-base", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.product-base-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.preview": { "id": "routes/api.preview", "parentId": "root", "path": "api/preview", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.preview-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/route-DfJNNr_j.js", "imports": ["/assets/index-BXFZJKZ8.js", "/assets/styles-vE5xW-ud.js", "/assets/components-CTSN4E9F.js", "/assets/Page-CF-lTqsZ.js", "/assets/FormLayout-1iHUuPJS.js", "/assets/context-Dsk7sDT6.js", "/assets/context-Eka27zlm.js"], "css": [] }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/route-ChqqY-B4.js", "imports": ["/assets/index-BXFZJKZ8.js", "/assets/components-CTSN4E9F.js"], "css": ["/assets/route-Xpdx9QZl.css"] }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": true, "module": "/assets/app-C7MbXDGK.js", "imports": ["/assets/index-BXFZJKZ8.js", "/assets/components-CTSN4E9F.js", "/assets/styles-vE5xW-ud.js", "/assets/context-Dsk7sDT6.js", "/assets/context-Eka27zlm.js"], "css": [] }, "routes/app.product-bases": { "id": "routes/app.product-bases", "parentId": "routes/app", "path": "product-bases", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.product-bases-CLTG-Z4B.js", "imports": ["/assets/index-BXFZJKZ8.js", "/assets/Page-CF-lTqsZ.js", "/assets/IndexTable-ZjKDyBoR.js", "/assets/components-CTSN4E9F.js", "/assets/TitleBar-DOWhmfL8.js", "/assets/banner-context-RZ1829w2.js", "/assets/context-Dsk7sDT6.js", "/assets/context-Eka27zlm.js", "/assets/FormLayout-1iHUuPJS.js"], "css": [] }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.additional-BxAv_Ty-.js", "imports": ["/assets/index-BXFZJKZ8.js", "/assets/Page-CF-lTqsZ.js", "/assets/TitleBar-DOWhmfL8.js", "/assets/banner-context-RZ1829w2.js", "/assets/context-Dsk7sDT6.js"], "css": [] }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app._index-DTn5B-un.js", "imports": ["/assets/index-BXFZJKZ8.js", "/assets/components-CTSN4E9F.js", "/assets/IndexTable-ZjKDyBoR.js", "/assets/Page-CF-lTqsZ.js", "/assets/TitleBar-DOWhmfL8.js", "/assets/context-Dsk7sDT6.js"], "css": [] } }, "url": "/assets/manifest-e35aacbb.js", "version": "e35aacbb" };
const mode = "production";
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "v3_fetcherPersist": true, "v3_relativeSplatPath": true, "v3_throwAbortReason": true, "v3_routeConfig": true, "v3_singleFetch": false, "v3_lazyRouteDiscovery": true, "unstable_optimizeDeps": false };
const isSpaMode = false;
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/api.register-printful-webhook": {
    id: "routes/api.register-printful-webhook",
    parentId: "root",
    path: "api/register-printful-webhook",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/api.test-printful-upload": {
    id: "routes/api.test-printful-upload",
    parentId: "root",
    path: "api/test-printful-upload",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/webhooks.orders.create": {
    id: "routes/webhooks.orders.create",
    parentId: "root",
    path: "webhooks/orders/create",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/api.printful-webhook": {
    id: "routes/api.printful-webhook",
    parentId: "root",
    path: "api/printful-webhook",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/api.debug-templates": {
    id: "routes/api.debug-templates",
    parentId: "root",
    path: "api/debug-templates",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/api.print-files.$id": {
    id: "routes/api.print-files.$id",
    parentId: "root",
    path: "api/print-files/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/api.debug-orders": {
    id: "routes/api.debug-orders",
    parentId: "root",
    path: "api/debug-orders",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/api.product-base": {
    id: "routes/api.product-base",
    parentId: "root",
    path: "api/product-base",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/api.preview": {
    id: "routes/api.preview",
    parentId: "root",
    path: "api/preview",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route13
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/app.product-bases": {
    id: "routes/app.product-bases",
    parentId: "routes/app",
    path: "product-bases",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route18
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  mode,
  publicPath,
  routes
};
