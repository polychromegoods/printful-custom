import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useActionData,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  EmptyState,
  IndexTable,
  Thumbnail,
  Badge,
  Modal,
  TextField,
  FormLayout,
  Banner,
  Box,
  Divider,
  Select,
  ChoiceList,
  Checkbox,
  RangeSlider,
  Tag,
  InlineGrid,
  Spinner,
  DropZone,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState, useCallback, useEffect } from "react";
import {
  PRODUCT_BASES,
  EMBROIDERY_THREAD_COLORS,
  AVAILABLE_FONTS,
  getPlacementsForTechnique,
} from "../config/product-bases";
import type { ProductBase, TechniqueKey, PrintAreaSpec } from "../config/product-bases";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const templates = await db.productTemplate.findMany({
    where: { shop: session.shop },
    include: {
      layers: { orderBy: { sortOrder: "asc" } },
      mockupImages: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
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
      variants: pb.variants.map((v) => ({ color: v.color, colorHex: v.colorHex })),
    })),
    threadColors: EMBROIDERY_THREAD_COLORS,
    fonts: AVAILABLE_FONTS,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "create_template") {
      const productBaseSlug = formData.get("productBaseSlug") as string;
      const rawProductId = formData.get("shopifyProductId") as string;
      // Normalize to GID format
      const shopifyProductId = rawProductId.startsWith("gid://")
        ? rawProductId
        : rawProductId.match(/^\d+$/)
          ? `gid://shopify/Product/${rawProductId}`
          : rawProductId;
      const productTitle = formData.get("productTitle") as string;
      const productHandle = formData.get("productHandle") as string;
      const technique = formData.get("technique") as string;
      const placementKey = formData.get("placementKey") as string;
      const enabledFonts = formData.get("enabledFonts") as string;
      const enabledThreadColors = formData.get("enabledThreadColors") as string;
      const enabledVariantColors = formData.get("enabledVariantColors") as string;
      const printAreaX = parseFloat(formData.get("printAreaX") as string) || 25;
      const printAreaY = parseFloat(formData.get("printAreaY") as string) || 15;
      const printAreaWidth = parseFloat(formData.get("printAreaWidth") as string) || 50;
      const printAreaHeight = parseFloat(formData.get("printAreaHeight") as string) || 35;

      // Parse layers
      const layersJson = formData.get("layers") as string;
      const layers = layersJson ? JSON.parse(layersJson) : [];

      const template = await db.productTemplate.create({
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
            create: layers.map((layer: any, index: number) => ({
              layerType: layer.layerType,
              label: layer.label,
              customerEditable: layer.customerEditable ?? true,
              positionX: layer.positionX ?? 10,
              positionY: layer.positionY ?? 10,
              positionWidth: layer.positionWidth ?? 80,
              positionHeight: layer.positionHeight ?? 80,
              sortOrder: index,
              maxChars: layer.maxChars ?? null,
              placeholder: layer.placeholder ?? null,
              defaultFont: layer.defaultFont ?? "script",
              defaultColor: layer.defaultColor ?? "#000000",
              fixedImageUrl: layer.fixedImageUrl ?? null,
            })),
          },
        },
      });

      return json({ success: true, templateId: template.id });
    }

    if (intent === "delete_template") {
      const templateId = formData.get("templateId") as string;
      await db.productTemplate.delete({ where: { id: templateId } });
      return json({ success: true });
    }

    if (intent === "update_print_area") {
      const templateId = formData.get("templateId") as string;
      const printAreaX = parseFloat(formData.get("printAreaX") as string);
      const printAreaY = parseFloat(formData.get("printAreaY") as string);
      const printAreaWidth = parseFloat(formData.get("printAreaWidth") as string);
      const printAreaHeight = parseFloat(formData.get("printAreaHeight") as string);

      await db.productTemplate.update({
        where: { id: templateId },
        data: { printAreaX, printAreaY, printAreaWidth, printAreaHeight },
      });

      return json({ success: true });
    }

    if (intent === "add_mockup") {
      const templateId = formData.get("templateId") as string;
      const variantColor = formData.get("variantColor") as string;
      const variantColorHex = formData.get("variantColorHex") as string;
      const imageUrl = formData.get("imageUrl") as string;
      const isDefault = formData.get("isDefault") === "true";

      await db.mockupImage.create({
        data: {
          templateId,
          variantColor,
          variantColorHex,
          imageUrl,
          isDefault,
        },
      });

      return json({ success: true });
    }

    if (intent === "delete_mockup") {
      const mockupId = formData.get("mockupId") as string;
      await db.mockupImage.delete({ where: { id: mockupId } });
      return json({ success: true });
    }

    if (intent === "upload_mockup_file") {
      const templateId = formData.get("templateId") as string;
      const variantColor = formData.get("variantColor") as string;
      const variantColorHex = formData.get("variantColorHex") as string;
      const isDefault = formData.get("isDefault") === "true";
      const fileBase64 = formData.get("fileBase64") as string;
      const fileName = formData.get("fileName") as string;
      const fileSize = formData.get("fileSize") as string;
      const mimeType = formData.get("mimeType") as string;

      // Step 1: Create staged upload target
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
        const errors = stagedData.data?.stagedUploadsCreate?.userErrors;
        return json({ error: `Staged upload failed: ${JSON.stringify(errors)}` }, { status: 500 });
      }

      // Step 2: Upload the file to the staged target
      const uploadForm = new FormData();
      for (const param of target.parameters) {
        uploadForm.append(param.name, param.value);
      }

      // Convert base64 to a Blob
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
        return json({ error: `File upload failed: ${uploadRes.status} ${uploadRes.statusText}` }, { status: 500 });
      }

      // Step 3: Create the file in Shopify using the resourceUrl
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
              originalSource: target.resourceUrl,
            }],
          },
        }
      );

      const fileData = await fileCreateRes.json();
      const createdFile = fileData.data?.fileCreate?.files?.[0];
      const fileErrors = fileData.data?.fileCreate?.userErrors;

      if (fileErrors && fileErrors.length > 0) {
        return json({ error: `File create failed: ${JSON.stringify(fileErrors)}` }, { status: 500 });
      }

      // The image URL may not be immediately available (Shopify processes it async)
      // Use the resourceUrl as a fallback
      const imageUrl = createdFile?.image?.url || createdFile?.url || target.resourceUrl;

      // Step 4: Create the MockupImage record
      await db.mockupImage.create({
        data: {
          templateId,
          variantColor,
          variantColorHex,
          imageUrl,
          isDefault,
        },
      });

      return json({ success: true, imageUrl });
    }

    if (intent === "update_product_id") {
      const templateId = formData.get("templateId") as string;
      const rawProductId = formData.get("shopifyProductId") as string;
      const productTitle = formData.get("productTitle") as string;
      const productHandle = formData.get("productHandle") as string || "";

      // Normalize to GID format
      const shopifyProductId = rawProductId.startsWith("gid://")
        ? rawProductId
        : rawProductId.match(/^\d+$/)
          ? `gid://shopify/Product/${rawProductId}`
          : rawProductId;

      await db.productTemplate.update({
        where: { id: templateId },
        data: {
          shopifyProductId,
          ...(productTitle ? { productTitle } : {}),
          ...(productHandle ? { productHandle } : {}),
        },
      });

      return json({ success: true });
    }

    if (intent === "toggle_active") {
      const templateId = formData.get("templateId") as string;
      const template = await db.productTemplate.findUnique({ where: { id: templateId } });
      if (template) {
        await db.productTemplate.update({
          where: { id: templateId },
          data: { isActive: !template.isActive },
        });
      }
      return json({ success: true });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (error: any) {
    console.error("Action error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function ProductBasesPage() {
  const { templates, productBases, threadColors, fonts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";
  const shopify = useAppBridge();

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  // Step 1: Select product base
  const [selectedBaseSlug, setSelectedBaseSlug] = useState("");

  // Step 2: Choose technique & placement
  const [selectedTechnique, setSelectedTechnique] = useState("");
  const [selectedPlacement, setSelectedPlacement] = useState("");

  // Step 3: Configure layers
  const [layers, setLayers] = useState<any[]>([]);

  // Step 4: Fonts, colors, variants
  const [enabledFontKeys, setEnabledFontKeys] = useState<string[]>(["script", "block"]);
  const [enabledThreadColorHexes, setEnabledThreadColorHexes] = useState<string[]>([]);
  const [enabledVariantColors, setEnabledVariantColors] = useState<string[]>([]);

  // Step 5: Print area position
  const [printAreaX, setPrintAreaX] = useState(25);
  const [printAreaY, setPrintAreaY] = useState(15);
  const [printAreaWidth, setPrintAreaWidth] = useState(50);
  const [printAreaHeight, setPrintAreaHeight] = useState(35);

  // Step 6: Shopify product link
  const [shopifyProductId, setShopifyProductId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productHandle, setProductHandle] = useState("");

  // Mockup modal
  const [showMockupModal, setShowMockupModal] = useState(false);
  const [mockupTemplateId, setMockupTemplateId] = useState("");
  const [mockupVariantColor, setMockupVariantColor] = useState("");
  const [mockupVariantColorHex, setMockupVariantColorHex] = useState("");
  const [mockupImageUrl, setMockupImageUrl] = useState("");
  const [mockupFile, setMockupFile] = useState<File | null>(null);
  const [mockupUploadMode, setMockupUploadMode] = useState<"url" | "file">("file");
  const [isUploading, setIsUploading] = useState(false);

  // Edit product ID modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editProductTitle, setEditProductTitle] = useState("");
  const [editProductHandle, setEditProductHandle] = useState("");

  // Derived state
  const selectedBase = productBases.find((pb) => pb.slug === selectedBaseSlug);
  const availableTechniques = selectedBase?.techniques || [];
  const selectedBaseFromRegistry = PRODUCT_BASES.find((pb) => pb.slug === selectedBaseSlug);
  const availablePlacements = selectedBaseFromRegistry && selectedTechnique
    ? getPlacementsForTechnique(selectedBaseFromRegistry, selectedTechnique as TechniqueKey)
    : [];
  const selectedPlacementSpec = availablePlacements.find((p) => p.placementKey === selectedPlacement);

  // Reset wizard
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
  }, []);

  // When base changes, set defaults
  useEffect(() => {
    if (selectedPlacementSpec) {
      setPrintAreaX(selectedPlacementSpec.mockupPosition.x);
      setPrintAreaY(selectedPlacementSpec.mockupPosition.y);
      setPrintAreaWidth(selectedPlacementSpec.mockupPosition.width);
      setPrintAreaHeight(selectedPlacementSpec.mockupPosition.height);
    }
  }, [selectedPlacementSpec]);

  // When technique changes, add default layer
  useEffect(() => {
    if (selectedTechnique && layers.length === 0) {
      if (selectedTechnique === "embroidery") {
        setLayers([{
          layerType: "text",
          label: "Monogram Text",
          customerEditable: true,
          maxChars: selectedBase?.category === "hat" ? 3 : 20,
          placeholder: selectedBase?.category === "hat" ? "ABC" : "Your Text",
          defaultFont: "script",
          defaultColor: "#000000",
          positionX: 10, positionY: 10, positionWidth: 80, positionHeight: 80,
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
          positionX: 10, positionY: 20, positionWidth: 80, positionHeight: 60,
        }]);
      }
    }
  }, [selectedTechnique]);

  // Close wizard on success
  useEffect(() => {
    if (actionData && 'success' in actionData && actionData.success && showWizard) {
      setShowWizard(false);
      resetWizard();
    }
  }, [actionData]);

  const handleCreateTemplate = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "create_template");
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
  }, [selectedBaseSlug, shopifyProductId, productTitle, productHandle, selectedTechnique, selectedPlacement, enabledFontKeys, enabledThreadColorHexes, enabledVariantColors, printAreaX, printAreaY, printAreaWidth, printAreaHeight, layers, submit]);

  const handleDeleteTemplate = useCallback((templateId: string) => {
    if (!confirm("Delete this product template? This cannot be undone.")) return;
    const formData = new FormData();
    formData.set("intent", "delete_template");
    formData.set("templateId", templateId);
    submit(formData, { method: "post" });
  }, [submit]);

  const handleToggleActive = useCallback((templateId: string) => {
    const formData = new FormData();
    formData.set("intent", "toggle_active");
    formData.set("templateId", templateId);
    submit(formData, { method: "post" });
  }, [submit]);

  const handleAddMockup = useCallback(async () => {
    if (mockupUploadMode === "file" && mockupFile) {
      // Upload file via base64
      setIsUploading(true);
      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
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
      // Use URL directly
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
    // Try Resource Picker first
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: false,
        action: "select",
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
  }, [shopify, editTemplateId, submit]);

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

  const handleDeleteMockup = useCallback((mockupId: string) => {
    const formData = new FormData();
    formData.set("intent", "delete_mockup");
    formData.set("mockupId", mockupId);
    submit(formData, { method: "post" });
  }, [submit]);

  // ─── Render Wizard Steps ────────────────────────────────────────────────

  const renderStep1 = () => (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">Step 1: Select Product Base</Text>
      <Text as="p" variant="bodyMd" tone="subdued">
        Choose the Printful product this template is for. Each base has pre-configured
        print specs, placements, and variant colors.
      </Text>
      <ChoiceList
        title="Product Base"
        choices={productBases.map((pb) => ({
          label: `${pb.name} (${pb.brand} ${pb.model}) — ${pb.category}`,
          value: pb.slug,
          helpText: `${pb.variants.length} colors, ${pb.techniques.map((t) => t.displayName).join(", ")}`,
        }))}
        selected={selectedBaseSlug ? [selectedBaseSlug] : []}
        onChange={(val) => {
          setSelectedBaseSlug(val[0]);
          setSelectedTechnique("");
          setSelectedPlacement("");
          setLayers([]);
        }}
      />
    </BlockStack>
  );

  const renderStep2 = () => (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">Step 2: Choose Technique & Placement</Text>
      <Select
        label="Technique"
        options={[
          { label: "Select technique...", value: "" },
          ...availableTechniques.map((t) => ({
            label: `${t.displayName}${t.isDefault ? " (default)" : ""}`,
            value: t.key,
          })),
        ]}
        value={selectedTechnique}
        onChange={(val) => {
          setSelectedTechnique(val);
          setSelectedPlacement("");
          setLayers([]);
        }}
      />
      {selectedTechnique && (
        <Select
          label="Placement"
          options={[
            { label: "Select placement...", value: "" },
            ...availablePlacements.map((p) => ({
              label: `${p.displayName} (${p.maxAreaInches.width}" × ${p.maxAreaInches.height}" — ${p.fileSizePx.width}×${p.fileSizePx.height}px)`,
              value: p.placementKey,
            })),
          ]}
          value={selectedPlacement}
          onChange={setSelectedPlacement}
        />
      )}
      {selectedPlacementSpec && (
        <Banner tone="info">
          <Text as="p" variant="bodyMd">
            Print file: {selectedPlacementSpec.fileSizePx.width} × {selectedPlacementSpec.fileSizePx.height}px
            at {selectedPlacementSpec.dpi} DPI
            ({selectedPlacementSpec.maxAreaInches.width}" × {selectedPlacementSpec.maxAreaInches.height}")
            {selectedPlacementSpec.supports3dPuff && " — 3D Puff available"}
          </Text>
        </Banner>
      )}
    </BlockStack>
  );

  const renderStep3 = () => (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">Step 3: Configure Layers</Text>
      <Text as="p" variant="bodyMd" tone="subdued">
        Layers are the customizable elements. They are composited in order to create the final print file.
      </Text>
      {layers.map((layer, index) => (
        <Card key={index}>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingSm">Layer {index + 1}: {layer.label}</Text>
              <Button
                variant="plain"
                tone="critical"
                onClick={() => setLayers(layers.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </InlineStack>
            <InlineGrid columns={2} gap="300">
              <Select
                label="Type"
                options={[
                  { label: "Text", value: "text" },
                  { label: "Image Upload", value: "image" },
                  { label: "Fixed Image", value: "fixed_image" },
                ]}
                value={layer.layerType}
                onChange={(val) => {
                  const updated = [...layers];
                  updated[index] = { ...updated[index], layerType: val };
                  setLayers(updated);
                }}
              />
              <TextField
                label="Label"
                value={layer.label}
                onChange={(val) => {
                  const updated = [...layers];
                  updated[index] = { ...updated[index], label: val };
                  setLayers(updated);
                }}
                autoComplete="off"
              />
            </InlineGrid>
            <Checkbox
              label="Customer can edit this layer"
              checked={layer.customerEditable}
              onChange={(val) => {
                const updated = [...layers];
                updated[index] = { ...updated[index], customerEditable: val };
                setLayers(updated);
              }}
            />
            {layer.layerType === "text" && (
              <InlineGrid columns={3} gap="300">
                <TextField
                  label="Max characters"
                  type="number"
                  value={String(layer.maxChars || 3)}
                  onChange={(val) => {
                    const updated = [...layers];
                    updated[index] = { ...updated[index], maxChars: parseInt(val) || 3 };
                    setLayers(updated);
                  }}
                  autoComplete="off"
                />
                <TextField
                  label="Placeholder"
                  value={layer.placeholder || ""}
                  onChange={(val) => {
                    const updated = [...layers];
                    updated[index] = { ...updated[index], placeholder: val };
                    setLayers(updated);
                  }}
                  autoComplete="off"
                />
                <Select
                  label="Default Font"
                  options={fonts.map((f) => ({ label: f.displayName, value: f.key }))}
                  value={layer.defaultFont || "script"}
                  onChange={(val) => {
                    const updated = [...layers];
                    updated[index] = { ...updated[index], defaultFont: val };
                    setLayers(updated);
                  }}
                />
              </InlineGrid>
            )}
            {layer.layerType === "fixed_image" && (
              <TextField
                label="Fixed Image URL"
                value={layer.fixedImageUrl || ""}
                onChange={(val) => {
                  const updated = [...layers];
                  updated[index] = { ...updated[index], fixedImageUrl: val };
                  setLayers(updated);
                }}
                autoComplete="off"
                helpText="URL to a fixed image (e.g., a frame or logo) that cannot be changed by the customer"
              />
            )}
          </BlockStack>
        </Card>
      ))}
      <InlineStack gap="200">
        <Button onClick={() => setLayers([...layers, {
          layerType: "text", label: "Custom Text", customerEditable: true,
          maxChars: 20, placeholder: "Your Text", defaultFont: "script", defaultColor: "#000000",
          positionX: 10, positionY: 10, positionWidth: 80, positionHeight: 80,
        }])}>
          + Add Text Layer
        </Button>
        <Button onClick={() => setLayers([...layers, {
          layerType: "image", label: "Upload Image", customerEditable: true,
          positionX: 10, positionY: 10, positionWidth: 80, positionHeight: 80,
        }])}>
          + Add Image Upload Layer
        </Button>
        <Button onClick={() => setLayers([...layers, {
          layerType: "fixed_image", label: "Frame", customerEditable: false,
          fixedImageUrl: "", positionX: 0, positionY: 0, positionWidth: 100, positionHeight: 100,
        }])}>
          + Add Fixed Image Layer
        </Button>
      </InlineStack>
    </BlockStack>
  );

  const renderStep4 = () => (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">Step 4: Fonts, Thread Colors & Variant Colors</Text>

      <Text as="h3" variant="headingSm">Enabled Fonts</Text>
      <InlineStack gap="200" wrap>
        {fonts.map((f) => (
          <Checkbox
            key={f.key}
            label={f.displayName}
            checked={enabledFontKeys.includes(f.key)}
            onChange={(checked) => {
              if (checked) {
                setEnabledFontKeys([...enabledFontKeys, f.key]);
              } else {
                setEnabledFontKeys(enabledFontKeys.filter((k) => k !== f.key));
              }
            }}
          />
        ))}
      </InlineStack>

      {(selectedTechnique === "embroidery") && (
        <>
          <Divider />
          <Text as="h3" variant="headingSm">
            Thread Colors (leave all unchecked = all 15 available)
          </Text>
          <InlineStack gap="200" wrap>
            {threadColors.map((tc) => (
              <Checkbox
                key={tc.hex}
                label={
                  <InlineStack gap="100" blockAlign="center">
                    <div style={{
                      width: 16, height: 16, borderRadius: 3,
                      backgroundColor: tc.hex,
                      border: "1px solid #ccc",
                      display: "inline-block",
                    }} />
                    <span>{tc.name}</span>
                  </InlineStack>
                }
                checked={enabledThreadColorHexes.includes(tc.hex)}
                onChange={(checked) => {
                  if (checked) {
                    setEnabledThreadColorHexes([...enabledThreadColorHexes, tc.hex]);
                  } else {
                    setEnabledThreadColorHexes(enabledThreadColorHexes.filter((h) => h !== tc.hex));
                  }
                }}
              />
            ))}
          </InlineStack>
        </>
      )}

      <Divider />
      <Text as="h3" variant="headingSm">
        Variant Colors (leave all unchecked = all colors available)
      </Text>
      <InlineStack gap="200" wrap>
        {selectedBase?.variants.map((v) => (
          <Checkbox
            key={v.color}
            label={
              <InlineStack gap="100" blockAlign="center">
                <div style={{
                  width: 16, height: 16, borderRadius: 3,
                  backgroundColor: v.colorHex,
                  border: "1px solid #ccc",
                  display: "inline-block",
                }} />
                <span>{v.color}</span>
              </InlineStack>
            }
            checked={enabledVariantColors.includes(v.color)}
            onChange={(checked) => {
              if (checked) {
                setEnabledVariantColors([...enabledVariantColors, v.color]);
              } else {
                setEnabledVariantColors(enabledVariantColors.filter((c) => c !== v.color));
              }
            }}
          />
        ))}
      </InlineStack>
    </BlockStack>
  );

  const renderStep5 = () => (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">Step 5: Print Area Position</Text>
      <Text as="p" variant="bodyMd" tone="subdued">
        Adjust where the personalization appears on the mockup preview image.
        Values are percentages of the mockup image dimensions.
      </Text>
      <InlineGrid columns={2} gap="400">
        <RangeSlider
          label={`X Position: ${printAreaX}%`}
          value={printAreaX}
          min={0} max={80} step={1}
          onChange={(val) => setPrintAreaX(val as number)}
          output
        />
        <RangeSlider
          label={`Y Position: ${printAreaY}%`}
          value={printAreaY}
          min={0} max={80} step={1}
          onChange={(val) => setPrintAreaY(val as number)}
          output
        />
        <RangeSlider
          label={`Width: ${printAreaWidth}%`}
          value={printAreaWidth}
          min={10} max={100} step={1}
          onChange={(val) => setPrintAreaWidth(val as number)}
          output
        />
        <RangeSlider
          label={`Height: ${printAreaHeight}%`}
          value={printAreaHeight}
          min={5} max={100} step={1}
          onChange={(val) => setPrintAreaHeight(val as number)}
          output
        />
      </InlineGrid>
      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
        <div style={{ position: "relative", width: "100%", paddingBottom: "75%", backgroundColor: "#e5e5e5", borderRadius: 8, overflow: "hidden" }}>
          <div style={{
            position: "absolute",
            left: `${printAreaX}%`,
            top: `${printAreaY}%`,
            width: `${printAreaWidth}%`,
            height: `${printAreaHeight}%`,
            border: "2px dashed #007ace",
            backgroundColor: "rgba(0, 122, 206, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "#007ace",
          }}>
            Print Area
          </div>
        </div>
      </Box>
    </BlockStack>
  );

  const handlePickProduct = useCallback(async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: false,
        action: "select",
      });
      if (selected && selected.length > 0) {
        const product = selected[0];
        setShopifyProductId(product.id); // GID format: gid://shopify/Product/...
        setProductTitle(product.title);
        setProductHandle(product.handle || "");
      }
    } catch (error) {
      console.error("Resource picker error:", error);
    }
  }, [shopify]);

  const renderStep6 = () => (
    <BlockStack gap="400">
      <Text as="h2" variant="headingMd">Step 6: Link Shopify Product</Text>
      <Text as="p" variant="bodyMd" tone="subdued">
        Select the Shopify product this template will be linked to.
        The product picker will set the correct product ID automatically.
      </Text>

      {shopifyProductId ? (
        <Banner tone="success">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              <strong>Selected:</strong> {productTitle}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              ID: {shopifyProductId}
              {productHandle ? ` — Handle: ${productHandle}` : ""}
            </Text>
          </BlockStack>
        </Banner>
      ) : null}

      <InlineStack gap="300">
        <Button variant="primary" onClick={handlePickProduct}>
          {shopifyProductId ? "Change Product" : "Select Product"}
        </Button>
        {shopifyProductId && (
          <Button
            variant="plain"
            tone="critical"
            onClick={() => {
              setShopifyProductId("");
              setProductTitle("");
              setProductHandle("");
            }}
          >
            Clear Selection
          </Button>
        )}
      </InlineStack>

      <Divider />
      <Text as="p" variant="bodySm" tone="subdued">
        Or enter the product ID manually:
      </Text>
      <FormLayout>
        <TextField
          label="Shopify Product ID"
          value={shopifyProductId}
          onChange={setShopifyProductId}
          autoComplete="off"
          placeholder="gid://shopify/Product/123456789 or just 123456789"
          helpText="The GID or numeric product ID"
        />
        <TextField
          label="Product Title"
          value={productTitle}
          onChange={setProductTitle}
          autoComplete="off"
          placeholder="Custom Monogram Hat"
        />
        <TextField
          label="Product Handle (optional)"
          value={productHandle}
          onChange={setProductHandle}
          autoComplete="off"
          placeholder="custom-monogram-hat"
        />
      </FormLayout>
    </BlockStack>
  );

  // ─── Summary before create ──────────────────────────────────────────────
  const renderSummary = () => {
    const base = productBases.find((pb) => pb.slug === selectedBaseSlug);
    return (
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">Review & Create</Text>
        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd"><strong>Product Base:</strong> {base?.name} ({base?.brand} {base?.model})</Text>
            <Text as="p" variant="bodyMd"><strong>Technique:</strong> {selectedTechnique}</Text>
            <Text as="p" variant="bodyMd"><strong>Placement:</strong> {selectedPlacement}</Text>
            <Text as="p" variant="bodyMd"><strong>Layers:</strong> {layers.length} ({layers.map((l) => l.label).join(", ")})</Text>
            <Text as="p" variant="bodyMd"><strong>Fonts:</strong> {enabledFontKeys.join(", ")}</Text>
            <Text as="p" variant="bodyMd"><strong>Thread Colors:</strong> {enabledThreadColorHexes.length || "All 15"}</Text>
            <Text as="p" variant="bodyMd"><strong>Variant Colors:</strong> {enabledVariantColors.length || "All"}</Text>
            <Text as="p" variant="bodyMd"><strong>Print Area:</strong> x:{printAreaX}% y:{printAreaY}% w:{printAreaWidth}% h:{printAreaHeight}%</Text>
            <Text as="p" variant="bodyMd"><strong>Shopify Product:</strong> {productTitle} ({shopifyProductId})</Text>
          </BlockStack>
        </Box>
      </BlockStack>
    );
  };

  const wizardSteps = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6, renderSummary];
  const stepTitles = ["Product Base", "Technique", "Layers", "Options", "Print Area", "Shopify Link", "Review"];
  const totalSteps = wizardSteps.length;

  const canAdvance = () => {
    switch (wizardStep) {
      case 1: return !!selectedBaseSlug;
      case 2: return !!selectedTechnique && !!selectedPlacement;
      case 3: return layers.length > 0;
      case 4: return enabledFontKeys.length > 0;
      case 5: return true;
      case 6: return !!shopifyProductId && !!productTitle;
      case 7: return true;
      default: return false;
    }
  };

  // ─── Template list ──────────────────────────────────────────────────────

  const getBaseInfo = (slug: string) => {
    const base = productBases.find((pb) => pb.slug === slug);
    return base ? `${base.brand} ${base.model}` : slug;
  };

  return (
    <Page>
      <TitleBar title="Product Templates" />
      <Layout>
        <Layout.Section>
          {actionData && 'error' in actionData && (
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">{actionData.error}</Text>
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Product Templates</Text>
                <Button variant="primary" onClick={() => { resetWizard(); setShowWizard(true); }}>
                  + New Template
                </Button>
              </InlineStack>

              {templates.length === 0 ? (
                <EmptyState
                  heading="No product templates yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p" variant="bodyMd">
                    Create a template to link a Shopify product to a Printful product base
                    with customization options.
                  </Text>
                </EmptyState>
              ) : (
                <IndexTable
                  itemCount={templates.length}
                  headings={[
                    { title: "Product" },
                    { title: "Base" },
                    { title: "Technique" },
                    { title: "Placement" },
                    { title: "Layers" },
                    { title: "Mockups" },
                    { title: "Status" },
                    { title: "Actions" },
                  ]}
                  selectable={false}
                >
                  {templates.map((template, index) => (
                    <IndexTable.Row key={template.id} id={template.id} position={index}>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodyMd" fontWeight="bold">
                          {template.productTitle}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{getBaseInfo(template.productBaseSlug)}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge>{template.technique}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{template.placementKey}</IndexTable.Cell>
                      <IndexTable.Cell>{template.layers.length} layer(s)</IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          <Text as="span" variant="bodyMd">
                            {template.mockupImages.length} image(s)
                          </Text>
                          <Button
                            variant="plain"
                            onClick={() => {
                              setMockupTemplateId(template.id);
                              setShowMockupModal(true);
                            }}
                          >
                            + Add
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="100" blockAlign="center">
                          <Badge tone={template.isActive ? "success" : undefined}>
                            {template.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            variant="plain"
                            size="slim"
                            onClick={() => handleToggleActive(template.id)}
                          >
                            Toggle
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          <Button
                            variant="plain"
                            onClick={() => {
                              setEditTemplateId(template.id);
                              setEditProductId(template.shopifyProductId);
                              setEditProductTitle(template.productTitle);
                              setEditProductHandle(template.productHandle || "");
                              setShowEditModal(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="plain"
                            tone="critical"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}

              {/* Show mockup images for each template */}
              {templates.filter((t) => t.mockupImages.length > 0).map((template) => (
                <Box key={template.id} padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      Mockups: {template.productTitle}
                    </Text>
                    <InlineStack gap="300" wrap>
                      {template.mockupImages.map((img) => (
                        <BlockStack key={img.id} gap="100" inlineAlign="center">
                          <Thumbnail source={img.imageUrl} alt={img.variantColor} size="large" />
                          <InlineStack gap="100" blockAlign="center">
                            <div style={{
                              width: 12, height: 12, borderRadius: 2,
                              backgroundColor: img.variantColorHex || "#ccc",
                              border: "1px solid #999",
                            }} />
                            <Text as="span" variant="bodySm">{img.variantColor}</Text>
                          </InlineStack>
                          <Button variant="plain" tone="critical" onClick={() => handleDeleteMockup(img.id)}>
                            Remove
                          </Button>
                        </BlockStack>
                      ))}
                    </InlineStack>
                  </BlockStack>
                </Box>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* ─── Create Template Wizard Modal ─── */}
      <Modal
        open={showWizard}
        onClose={() => setShowWizard(false)}
        title={`New Product Template — Step ${wizardStep} of ${totalSteps}: ${stepTitles[wizardStep - 1]}`}
        primaryAction={
          wizardStep === totalSteps
            ? { content: "Create Template", onAction: handleCreateTemplate, loading: isLoading }
            : { content: "Next", onAction: () => setWizardStep(wizardStep + 1), disabled: !canAdvance() }
        }
        secondaryActions={
          wizardStep > 1
            ? [{ content: "Back", onAction: () => setWizardStep(wizardStep - 1) }]
            : [{ content: "Cancel", onAction: () => setShowWizard(false) }]
        }
        size="large"
      >
        <Modal.Section>
          {wizardSteps[wizardStep - 1]()}
        </Modal.Section>
      </Modal>

      {/* ─── Add Mockup Image Modal ─── */}
      <Modal
        open={showMockupModal}
        onClose={() => setShowMockupModal(false)}
        title="Add Mockup Image"
        primaryAction={{
          content: isUploading ? "Uploading..." : "Add Mockup",
          onAction: handleAddMockup,
          disabled: !mockupVariantColor || (mockupUploadMode === "url" ? !mockupImageUrl : !mockupFile),
          loading: isLoading || isUploading,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowMockupModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" variant="bodyMd" tone="subdued">
              Add a blank mockup photo for a specific variant color.
              The monogram preview will be overlaid on this image.
            </Text>
            {(() => {
              const template = templates.find((t) => t.id === mockupTemplateId);
              const base = template ? productBases.find((pb) => pb.slug === template.productBaseSlug) : null;
              const variantOptions = base
                ? [
                    { label: "Default (fallback)", value: "Default" },
                    ...base.variants.map((v) => ({ label: v.color, value: v.color })),
                  ]
                : [{ label: "Default", value: "Default" }];

              return (
                <Select
                  label="Variant Color"
                  options={variantOptions}
                  value={mockupVariantColor}
                  onChange={(val) => {
                    setMockupVariantColor(val);
                    const variant = base?.variants.find((v) => v.color === val);
                    setMockupVariantColorHex(variant?.colorHex || "#ffffff");
                  }}
                />
              );
            })()}

            <InlineStack gap="200">
              <Button
                variant={mockupUploadMode === "file" ? "primary" : "plain"}
                onClick={() => setMockupUploadMode("file")}
              >
                Upload File
              </Button>
              <Button
                variant={mockupUploadMode === "url" ? "primary" : "plain"}
                onClick={() => setMockupUploadMode("url")}
              >
                Paste URL
              </Button>
            </InlineStack>

            {mockupUploadMode === "file" ? (
              <DropZone
                accept="image/*"
                type="image"
                onDrop={(_dropFiles, acceptedFiles) => {
                  if (acceptedFiles.length > 0) {
                    setMockupFile(acceptedFiles[0]);
                  }
                }}
              >
                {mockupFile ? (
                  <Box padding="400">
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="p" variant="bodyMd">
                        {mockupFile.name} ({(mockupFile.size / 1024).toFixed(1)} KB)
                      </Text>
                      <Button variant="plain" onClick={() => setMockupFile(null)}>
                        Remove
                      </Button>
                    </BlockStack>
                  </Box>
                ) : (
                  <DropZone.FileUpload actionHint="Accepts PNG, JPG images" />
                )}
              </DropZone>
            ) : (
              <>
                <TextField
                  label="Mockup Image URL"
                  value={mockupImageUrl}
                  onChange={setMockupImageUrl}
                  autoComplete="off"
                  placeholder="https://cdn.shopify.com/... or any public image URL"
                  helpText="Paste a direct URL to the blank mockup image."
                />
                {mockupImageUrl && (
                  <Box padding="200">
                    <img
                      src={mockupImageUrl}
                      alt="Preview"
                      style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }}
                    />
                  </Box>
                )}
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ─── Edit Product ID Modal ─── */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Template Product Link"
        primaryAction={{
          content: "Pick Product",
          onAction: handleUpdateProductId,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: "Save Manual ID",
            onAction: handleSaveProductId,
            disabled: !editProductId,
          },
          { content: "Cancel", onAction: () => setShowEditModal(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <Text as="p" variant="bodyMd">
                Click "Pick Product" to use the Shopify product picker, or manually edit the ID below and click "Save Manual ID".
              </Text>
            </Banner>
            <TextField
              label="Shopify Product ID"
              value={editProductId}
              onChange={setEditProductId}
              autoComplete="off"
              helpText="GID format (gid://shopify/Product/...) or numeric ID"
            />
            <TextField
              label="Product Title"
              value={editProductTitle}
              onChange={setEditProductTitle}
              autoComplete="off"
            />
            <TextField
              label="Product Handle"
              value={editProductHandle}
              onChange={setEditProductHandle}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
