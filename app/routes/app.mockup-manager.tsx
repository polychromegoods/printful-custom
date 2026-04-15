import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useActionData,
  useRevalidator,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  IndexTable,
  Thumbnail,
  Badge,
  Modal,
  TextField,
  FormLayout,
  Banner,
  Box,
  Select,
  DropZone,
  Spinner,
  Divider,
  EmptyState,
  Tag,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState, useCallback, useRef, useEffect, type ChangeEvent } from "react";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const productBases = await db.productBaseDef.findMany({
    where: { shop: session.shop },
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ productBases, shop: session.shop });
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    // ── Update default print area for a product base ──
    if (intent === "update_print_area") {
      const baseId = formData.get("baseId") as string;
      const x = parseFloat(formData.get("x") as string);
      const y = parseFloat(formData.get("y") as string);
      const w = parseFloat(formData.get("w") as string);
      const h = parseFloat(formData.get("h") as string);

      await db.productBaseDef.update({
        where: { id: baseId },
        data: {
          defaultPrintAreaX: x,
          defaultPrintAreaY: y,
          defaultPrintAreaWidth: w,
          defaultPrintAreaHeight: h,
        },
      });
      return json({ success: true });
    }

    // ── Update variant print area override ──
    if (intent === "update_variant_print_area") {
      const variantId = formData.get("variantId") as string;
      const x = parseFloat(formData.get("x") as string);
      const y = parseFloat(formData.get("y") as string);
      const w = parseFloat(formData.get("w") as string);
      const h = parseFloat(formData.get("h") as string);

      await db.productBaseVariant.update({
        where: { id: variantId },
        data: {
          printAreaX: x,
          printAreaY: y,
          printAreaWidth: w,
          printAreaHeight: h,
        },
      });
      return json({ success: true });
    }

    // ── Upload mockup image for a variant ──
    if (intent === "upload_variant_mockup") {
      const variantId = formData.get("variantId") as string;
      const baseId = formData.get("baseId") as string;
      const fileBase64 = formData.get("fileBase64") as string;
      const fileName = formData.get("fileName") as string;
      const fileSize = formData.get("fileSize") as string;
      const mimeType = formData.get("mimeType") as string;
      const setAsDefault = formData.get("setAsDefault") === "true";

      // Upload to Shopify Files via staged upload
      const stagedRes = await admin.graphql(
        `#graphql
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters { name value }
            }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: [{
              filename: fileName,
              fileSize: fileSize,
              mimeType: mimeType,
              resource: "FILE",
              httpMethod: "POST",
            }],
          },
        }
      );

      const stagedData = await stagedRes.json();
      const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];

      if (!target) {
        return json({ error: "Staged upload failed" }, { status: 500 });
      }

      // Upload the file
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
        body: uploadForm,
      });

      if (!uploadRes.ok) {
        return json({ error: `Upload failed: ${uploadRes.status}` }, { status: 500 });
      }

      // Create file in Shopify
      const fileCreateRes = await admin.graphql(
        `#graphql
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              ... on MediaImage { image { url } }
              ... on GenericFile { url }
            }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            files: [{
              alt: `Mockup - ${variantId}`,
              contentType: "IMAGE",
              originalSource: target.resourceUrl,
            }],
          },
        }
      );

      const fileData = await fileCreateRes.json();
      const createdFile = fileData.data?.fileCreate?.files?.[0];
      const imageUrl = createdFile?.image?.url || createdFile?.url || target.resourceUrl;

      // Update the variant
      await db.productBaseVariant.update({
        where: { id: variantId },
        data: { mockupImageUrl: imageUrl },
      });

      // If set as default, also update the product base
      if (setAsDefault) {
        await db.productBaseDef.update({
          where: { id: baseId },
          data: { defaultMockupUrl: imageUrl },
        });
      }

      return json({ success: true, imageUrl });
    }

    // ── Set mockup from URL ──
    if (intent === "set_variant_mockup_url") {
      const variantId = formData.get("variantId") as string;
      const baseId = formData.get("baseId") as string;
      const imageUrl = formData.get("imageUrl") as string;
      const setAsDefault = formData.get("setAsDefault") === "true";

      await db.productBaseVariant.update({
        where: { id: variantId },
        data: { mockupImageUrl: imageUrl },
      });

      if (setAsDefault) {
        await db.productBaseDef.update({
          where: { id: baseId },
          data: { defaultMockupUrl: imageUrl },
        });
      }

      return json({ success: true });
    }

    // ── Upload default mockup for a product base (no variants needed) ──
    if (intent === "upload_base_mockup") {
      const baseId = formData.get("baseId") as string;
      const fileBase64 = formData.get("fileBase64") as string;
      const fileName = formData.get("fileName") as string;
      const fileSize = formData.get("fileSize") as string;
      const mimeType = formData.get("mimeType") as string;

      // Upload to Shopify Files via staged upload
      const stagedRes = await admin.graphql(
        `#graphql
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters { name value }
            }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: [{
              filename: fileName,
              fileSize: fileSize,
              mimeType: mimeType,
              resource: "FILE",
              httpMethod: "POST",
            }],
          },
        }
      );

      const stagedData = await stagedRes.json();
      const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];
      if (!target) {
        return json({ error: "Staged upload failed" }, { status: 500 });
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

      const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
      if (!uploadRes.ok) {
        return json({ error: `Upload failed: ${uploadRes.status}` }, { status: 500 });
      }

      const fileCreateRes = await admin.graphql(
        `#graphql
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              ... on MediaImage { image { url } }
              ... on GenericFile { url }
            }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            files: [{
              alt: `Base mockup - ${baseId}`,
              contentType: "IMAGE",
              originalSource: target.resourceUrl,
            }],
          },
        }
      );

      const fileData = await fileCreateRes.json();
      const createdFile = fileData.data?.fileCreate?.files?.[0];
      const imageUrl = createdFile?.image?.url || createdFile?.url || target.resourceUrl;

      await db.productBaseDef.update({
        where: { id: baseId },
        data: { defaultMockupUrl: imageUrl },
      });

      return json({ success: true, imageUrl });
    }

    // ── Delete a product base ──
    if (intent === "delete_base") {
      const baseId = formData.get("baseId") as string;
      await db.productBaseVariant.deleteMany({ where: { productBaseId: baseId } });
      await db.productBaseDef.delete({ where: { id: baseId } });
      return json({ success: true });
    }

    // ── Create product base manually ──
    if (intent === "create_base") {
      const slug = formData.get("slug") as string;
      const name = formData.get("name") as string;
      const brand = formData.get("brand") as string;
      const modelName = formData.get("model") as string;
      const category = formData.get("category") as string;
      const fulfillmentProvider = formData.get("fulfillmentProvider") as string;
      const printifyBlueprintId = parseInt(formData.get("printifyBlueprintId") as string) || null;
      const printifyProviderId = parseInt(formData.get("printifyProviderId") as string) || null;

      const base = await db.productBaseDef.create({
        data: {
          shop: session.shop,
          slug,
          name,
          brand,
          model: modelName,
          category,
          fulfillmentProvider,
          printifyBlueprintId,
          printifyProviderId,
        },
      });

      return json({ success: true, baseId: base.id });
    }

    // ── Add variant to product base ──
    if (intent === "add_variant") {
      const baseId = formData.get("baseId") as string;
      const color = formData.get("color") as string;
      const colorHex = formData.get("colorHex") as string;
      const size = formData.get("size") as string || null;
      const printifyVariantId = parseInt(formData.get("printifyVariantId") as string) || null;

      await db.productBaseVariant.create({
        data: {
          productBaseId: baseId,
          color,
          colorHex,
          size,
          printifyVariantId,
        },
      });

      return json({ success: true });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (error: any) {
    console.error("[mockup-manager] Action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

// ─── Print Area Visual Editor Component ─────────────────────────────────────
function PrintAreaEditor({
  mockupUrl,
  printArea,
  onPrintAreaChange,
  width = 400,
  printFileAspectRatio,
}: {
  mockupUrl: string;
  printArea: { x: number; y: number; w: number; h: number };
  onPrintAreaChange: (pa: { x: number; y: number; w: number; h: number }) => void;
  width?: number;
  printFileAspectRatio?: number; // width / height of the print file
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ w: width, h: width });

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const aspect = img.naturalWidth / img.naturalHeight;
    const h = width / aspect;
    setImgSize({ w: width, h });
  }, [width]);

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: "drag" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getRelativePos(e);
    setDragStart(pos);
    if (mode === "drag") setDragging(true);
    else setResizing(true);
  }, [getRelativePos]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging && !resizing) return;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;

      if (dragging) {
        const newX = Math.max(0, Math.min(100 - printArea.w, printArea.x + dx));
        const newY = Math.max(0, Math.min(100 - printArea.h, printArea.y + dy));
        onPrintAreaChange({ ...printArea, x: newX, y: newY });
        setDragStart({ x, y });
      } else if (resizing) {
        // If we have a print file aspect ratio, lock the resize to that ratio
        // The ratio is in print-file space (width/height), but we need to account
        // for the mockup image's own aspect ratio on screen.
        // Since print area is in % of the mockup image, and the mockup image
        // may not be square, we need to convert.
        if (printFileAspectRatio && printFileAspectRatio > 0) {
          // Use the larger delta to drive the resize
          const newW = Math.max(10, Math.min(100 - printArea.x, printArea.w + dx));
          // Convert: print area % width maps to actual pixels differently than % height
          // because the mockup image has its own aspect ratio.
          // We need: (newW% * imgWidth) / (newH% * imgHeight) = printFileAspectRatio
          // So: newH% = (newW% * imgWidth) / (printFileAspectRatio * imgHeight)
          // In terms of the container: imgAspect = imgWidth / imgHeight
          // So: newH% = (newW% * imgAspect) / printFileAspectRatio
          const containerAspect = containerRef.current
            ? containerRef.current.offsetWidth / containerRef.current.offsetHeight
            : 1;
          const newH = (newW * containerAspect) / printFileAspectRatio;
          const clampedH = Math.max(10, Math.min(100 - printArea.y, newH));
          onPrintAreaChange({ ...printArea, w: newW, h: clampedH });
        } else {
          const newW = Math.max(10, Math.min(100 - printArea.x, printArea.w + dx));
          const newH = Math.max(10, Math.min(100 - printArea.y, printArea.h + dy));
          onPrintAreaChange({ ...printArea, w: newW, h: newH });
        }
        setDragStart({ x, y });
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
      setResizing(false);
    };

    if (dragging || resizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, resizing, dragStart, printArea, onPrintAreaChange]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: `${width}px`,
        maxWidth: "100%",
        background: "#f0f0f0",
        borderRadius: "8px",
        overflow: "hidden",
        cursor: dragging ? "grabbing" : "default",
        userSelect: "none",
      }}
    >
      {mockupUrl ? (
        <img
          src={mockupUrl}
          alt="Product mockup"
          onLoad={handleImageLoad}
          style={{ width: "100%", display: "block" }}
          draggable={false}
        />
      ) : (
        <div style={{
          width: "100%",
          height: "300px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: "14px",
        }}>
          No mockup image — upload one below
        </div>
      )}

      {/* Print area overlay */}
      <div
        onMouseDown={(e) => handleMouseDown(e, "drag")}
        style={{
          position: "absolute",
          left: `${printArea.x}%`,
          top: `${printArea.y}%`,
          width: `${printArea.w}%`,
          height: `${printArea.h}%`,
          border: "2px dashed rgba(255, 0, 0, 0.7)",
          backgroundColor: "rgba(255, 0, 0, 0.08)",
          cursor: dragging ? "grabbing" : "grab",
          boxSizing: "border-box",
        }}
      >
        {/* Label */}
        <div style={{
          position: "absolute",
          top: "-20px",
          left: "0",
          fontSize: "11px",
          color: "red",
          fontWeight: "bold",
          whiteSpace: "nowrap",
          background: "rgba(255,255,255,0.8)",
          padding: "1px 4px",
          borderRadius: "2px",
        }}>
          Print Area
        </div>

        {/* Resize handle (bottom-right) */}
        <div
          onMouseDown={(e) => handleMouseDown(e, "resize")}
          style={{
            position: "absolute",
            right: "-5px",
            bottom: "-5px",
            width: "10px",
            height: "10px",
            backgroundColor: "red",
            cursor: "nwse-resize",
            borderRadius: "2px",
          }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function MockupManagerPage() {
  const { productBases } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  // Selected product base for editing
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  // Print area state
  const [printArea, setPrintArea] = useState({ x: 20, y: 20, w: 60, h: 60 });

  // Upload state
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);
  const [uploadingBase, setUploadingBase] = useState(false);

  const selectedBase = productBases.find((b) => b.id === selectedBaseId);
  const selectedVariant = selectedBase?.variants.find((v) => v.id === selectedVariantId);

  // When selecting a base, load its print area
  const handleSelectBase = useCallback((baseId: string) => {
    const base = productBases.find((b) => b.id === baseId);
    if (base) {
      setSelectedBaseId(baseId);
      setPrintArea({
        x: base.defaultPrintAreaX,
        y: base.defaultPrintAreaY,
        w: base.defaultPrintAreaWidth,
        h: base.defaultPrintAreaHeight,
      });
      // Select first variant if available
      if (base.variants.length > 0) {
        setSelectedVariantId(base.variants[0].id);
        // If variant has print area override, use it
        const v = base.variants[0];
        if (v.printAreaX != null) {
          setPrintArea({
            x: v.printAreaX!,
            y: v.printAreaY!,
            w: v.printAreaWidth!,
            h: v.printAreaHeight!,
          });
        }
      } else {
        setSelectedVariantId(null);
      }
    }
  }, [productBases]);

  // When selecting a variant, load its print area
  const handleSelectVariant = useCallback((variantId: string) => {
    setSelectedVariantId(variantId);
    const variant = selectedBase?.variants.find((v) => v.id === variantId);
    if (variant) {
      if (variant.printAreaX != null) {
        setPrintArea({
          x: variant.printAreaX!,
          y: variant.printAreaY!,
          w: variant.printAreaWidth!,
          h: variant.printAreaHeight!,
        });
      } else if (selectedBase) {
        setPrintArea({
          x: selectedBase.defaultPrintAreaX,
          y: selectedBase.defaultPrintAreaY,
          w: selectedBase.defaultPrintAreaWidth,
          h: selectedBase.defaultPrintAreaHeight,
        });
      }
    }
  }, [selectedBase]);

  // Save print area
  const handleSavePrintArea = useCallback(() => {
    if (selectedVariantId) {
      const fd = new FormData();
      fd.set("intent", "update_variant_print_area");
      fd.set("variantId", selectedVariantId);
      fd.set("x", String(Math.round(printArea.x * 10) / 10));
      fd.set("y", String(Math.round(printArea.y * 10) / 10));
      fd.set("w", String(Math.round(printArea.w * 10) / 10));
      fd.set("h", String(Math.round(printArea.h * 10) / 10));
      submit(fd, { method: "post" });
    } else if (selectedBaseId) {
      const fd = new FormData();
      fd.set("intent", "update_print_area");
      fd.set("baseId", selectedBaseId);
      fd.set("x", String(Math.round(printArea.x * 10) / 10));
      fd.set("y", String(Math.round(printArea.y * 10) / 10));
      fd.set("w", String(Math.round(printArea.w * 10) / 10));
      fd.set("h", String(Math.round(printArea.h * 10) / 10));
      submit(fd, { method: "post" });
    }
  }, [selectedBaseId, selectedVariantId, printArea, submit]);

  // Handle mockup file upload
  const handleMockupUpload = useCallback(async (variantId: string, file: File) => {
    setUploadingVariantId(variantId);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const fd = new FormData();
      fd.set("intent", "upload_variant_mockup");
      fd.set("variantId", variantId);
      fd.set("baseId", selectedBaseId || "");
      fd.set("fileBase64", base64);
      fd.set("fileName", file.name);
      fd.set("fileSize", String(file.size));
      fd.set("mimeType", file.type);
      fd.set("setAsDefault", selectedBase?.variants[0]?.id === variantId ? "true" : "false");
      submit(fd, { method: "post" });
      setUploadingVariantId(null);
    };
    reader.readAsDataURL(file);
  }, [selectedBaseId, selectedBase, submit]);

  // Delete product base
  const handleDeleteBase = useCallback((baseId: string) => {
    if (confirm("Delete this product base and all its variants?")) {
      const fd = new FormData();
      fd.set("intent", "delete_base");
      fd.set("baseId", baseId);
      submit(fd, { method: "post" });
      if (selectedBaseId === baseId) {
        setSelectedBaseId(null);
        setSelectedVariantId(null);
      }
    }
  }, [selectedBaseId, submit]);

  // Handle base-level default mockup upload
  const handleBaseMockupUpload = useCallback(async (file: File) => {
    if (!selectedBaseId) return;
    setUploadingBase(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const fd = new FormData();
      fd.set("intent", "upload_base_mockup");
      fd.set("baseId", selectedBaseId);
      fd.set("fileBase64", base64);
      fd.set("fileName", file.name);
      fd.set("fileSize", String(file.size));
      fd.set("mimeType", file.type);
      submit(fd, { method: "post" });
      setUploadingBase(false);
    };
    reader.readAsDataURL(file);
  }, [selectedBaseId, submit]);

  // Current mockup URL
  const currentMockupUrl = selectedVariant?.mockupImageUrl
    || selectedBase?.defaultMockupUrl
    || "";

  return (
    <Page>
      <TitleBar title="Mockup & Print Area Manager" />

      <Layout>
        {/* Left: Product base list */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Product Bases</Text>

              {productBases.length === 0 ? (
                <Banner tone="info">
                  <p>No product bases yet. Import from Printify catalog or create one manually.</p>
                </Banner>
              ) : (
                <BlockStack gap="200">
                  {productBases.map((base) => (
                    <div
                      key={base.id}
                      onClick={() => handleSelectBase(base.id)}
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        border: selectedBaseId === base.id ? "2px solid #333" : "1px solid #ddd",
                        cursor: "pointer",
                        background: selectedBaseId === base.id ? "#f5f5f5" : "white",
                      }}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="bold">{base.name}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {base.brand} {base.model} · {base.variants.length} variants
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200">
                          <Badge tone={base.fulfillmentProvider === "printify" ? "info" : "success"}>
                            {base.fulfillmentProvider}
                          </Badge>
                          <Button
                            variant="plain"
                            tone="critical"
                            onClick={() => {
                              handleDeleteBase(base.id);
                            }}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Right: Editor */}
        <Layout.Section>
          {selectedBase ? (
            <BlockStack gap="400">
              {/* Mockup & Print Area */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      {selectedBase.name} — Print Area
                    </Text>
                    <Button
                      variant="primary"
                      onClick={handleSavePrintArea}
                      loading={isLoading}
                    >
                      Save Print Area
                    </Button>
                  </InlineStack>

                  <Text as="p" variant="bodySm" tone="subdued">
                    Drag the red rectangle to position the print area. Drag the bottom-right corner to resize.
                  </Text>

                  {/* Base default mockup upload */}
                  <InlineStack gap="300" blockAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {selectedBase?.defaultMockupUrl ? "Default mockup:" : "No default mockup yet —"}
                    </Text>
                    <label style={{
                      cursor: "pointer",
                      padding: "6px 14px",
                      background: uploadingBase ? "#e0e0e0" : "#333",
                      color: "white",
                      borderRadius: "6px",
                      fontSize: "13px",
                      fontWeight: 500,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}>
                      {uploadingBase ? <Spinner size="small" /> : null}
                      {selectedBase?.defaultMockupUrl ? "Replace Mockup" : "Upload Mockup"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const file = e.target.files?.[0];
                          if (file) handleBaseMockupUpload(file);
                        }}
                      />
                    </label>
                    {selectedBase?.defaultMockupUrl && (
                      <Thumbnail source={selectedBase.defaultMockupUrl} alt="Default mockup" size="small" />
                    )}
                  </InlineStack>

                  <PrintAreaEditor
                    mockupUrl={currentMockupUrl}
                    printArea={printArea}
                    onPrintAreaChange={setPrintArea}
                    width={450}
                    printFileAspectRatio={
                      selectedBase.printFileWidth && selectedBase.printFileHeight
                        ? selectedBase.printFileWidth / selectedBase.printFileHeight
                        : undefined
                    }
                  />

                  <InlineStack gap="300">
                    <Text as="p" variant="bodySm">
                      X: {printArea.x.toFixed(1)}% · Y: {printArea.y.toFixed(1)}% ·
                      W: {printArea.w.toFixed(1)}% · H: {printArea.h.toFixed(1)}%
                    </Text>
                  </InlineStack>
                  {selectedBase.printFileWidth && selectedBase.printFileHeight && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Print file: {selectedBase.printFileWidth} × {selectedBase.printFileHeight}px — aspect ratio locked
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* Variant Mockups */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Variant Mockups</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Upload a mockup image for each color variant. The print area position can be fine-tuned per variant.
                  </Text>

                  {selectedBase.variants.length === 0 ? (
                    <Banner tone="warning">
                      <p>No variants configured. Add variants via Printify Import or manually.</p>
                    </Banner>
                  ) : (
                    <BlockStack gap="300">
                      {selectedBase.variants.map((variant) => (
                        <div
                          key={variant.id}
                          onClick={() => handleSelectVariant(variant.id)}
                          style={{
                            padding: "12px",
                            borderRadius: "8px",
                            border: selectedVariantId === variant.id ? "2px solid #333" : "1px solid #eee",
                            cursor: "pointer",
                            background: selectedVariantId === variant.id ? "#f9f9f9" : "white",
                          }}
                        >
                          <InlineStack gap="300" blockAlign="center">
                            {/* Color swatch */}
                            <div style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              backgroundColor: variant.colorHex,
                              border: "1px solid #ccc",
                              flexShrink: 0,
                            }} />

                            {/* Variant info */}
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                {variant.color}
                                {variant.size ? ` (${variant.size})` : ""}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {variant.mockupImageUrl ? "Has mockup" : "No mockup"}
                                {variant.printifyVariantId ? ` · Printify #${variant.printifyVariantId}` : ""}
                              </Text>
                            </BlockStack>

                            {/* Thumbnail */}
                            {variant.mockupImageUrl && (
                              <Thumbnail
                                source={variant.mockupImageUrl}
                                alt={variant.color}
                                size="small"
                              />
                            )}

                            {/* Upload button */}
                            <div style={{ marginLeft: "auto" }}>
                              <label style={{
                                cursor: "pointer",
                                padding: "6px 12px",
                                background: "#f0f0f0",
                                borderRadius: "6px",
                                fontSize: "13px",
                              }}>
                                {uploadingVariantId === variant.id ? (
                                  <Spinner size="small" />
                                ) : (
                                  variant.mockupImageUrl ? "Replace" : "Upload"
                                )}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleMockupUpload(variant.id, file);
                                  }}
                                />
                              </label>
                            </div>
                          </InlineStack>
                        </div>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Base Info */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Product Base Info</Text>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm"><strong>Slug:</strong> {selectedBase.slug}</Text>
                    <Text as="p" variant="bodySm"><strong>Brand:</strong> {selectedBase.brand}</Text>
                    <Text as="p" variant="bodySm"><strong>Model:</strong> {selectedBase.model}</Text>
                    <Text as="p" variant="bodySm"><strong>Category:</strong> {selectedBase.category}</Text>
                    <Text as="p" variant="bodySm"><strong>Provider:</strong> {selectedBase.fulfillmentProvider}</Text>
                    {selectedBase.printifyBlueprintId && (
                      <Text as="p" variant="bodySm"><strong>Printify Blueprint:</strong> #{selectedBase.printifyBlueprintId}</Text>
                    )}
                    {selectedBase.printifyProviderId && (
                      <Text as="p" variant="bodySm"><strong>Printify Provider:</strong> #{selectedBase.printifyProviderId}</Text>
                    )}
                    <Text as="p" variant="bodySm">
                      <strong>Print File:</strong> {selectedBase.printFileWidth}x{selectedBase.printFileHeight}px @ {selectedBase.printFileDpi}dpi
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          ) : (
            <Card>
              <EmptyState
                heading="Select a product base"
                image=""
              >
                <p>Choose a product base from the list to manage its mockup images and print area positioning.</p>
                <p>To add new product bases, use the <strong>Printify Import</strong> page.</p>
              </EmptyState>
            </Card>
          )}
        </Layout.Section>
      </Layout>

      {actionData && "error" in actionData && (
        <div style={{ marginTop: "16px" }}>
          <Banner tone="critical">
            <p>{(actionData as any).error}</p>
          </Banner>
        </div>
      )}

      {actionData && "success" in actionData && (
        <div style={{ marginTop: "16px" }}>
          <Banner tone="success" onDismiss={() => {}}>
            <p>Saved successfully!</p>
          </Banner>
        </div>
      )}
    </Page>
  );
}
