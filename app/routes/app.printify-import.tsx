/**
 * Import Product Base from Printify or Printful catalog.
 * Tabbed interface: Printify | Printful
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  TextField,
  Banner,
  Spinner,
  Thumbnail,
  Badge,
  Divider,
  Select,
  Box,
  Tabs,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState, useCallback, useEffect, useRef } from "react";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const existingBases = await db.productBaseDef.findMany({
    where: { shop: session.shop },
    select: { slug: true, printifyBlueprintId: true, printfulProductId: true },
  });
  return json({ shop: session.shop, existingBases });
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    // ── Printify Import ──────────────────────────────────────────────────────
    if (intent === "import_blueprint") {
      const blueprintId = parseInt(formData.get("blueprintId") as string);
      const providerId = parseInt(formData.get("providerId") as string);
      const blueprintTitle = formData.get("blueprintTitle") as string;
      const blueprintBrand = (formData.get("blueprintBrand") as string) || "";
      const blueprintModel = (formData.get("blueprintModel") as string) || blueprintTitle;
      const blueprintImages = formData.get("blueprintImages") as string;
      const category = formData.get("category") as string;
      const variantsJson = formData.get("variants") as string;
      const providerTitle = formData.get("providerTitle") as string;

      const slug = `printify-${blueprintBrand || blueprintTitle}-${blueprintModel}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);

      const existing = await db.productBaseDef.findUnique({
        where: { shop_slug: { shop: session.shop, slug } },
      });
      if (existing) {
        return json({ error: `Product base "${slug}" already exists. Delete it first to re-import.` }, { status: 400 });
      }

      const variants: Array<{ id: number; title: string; options: Record<string, string> }> =
        JSON.parse(variantsJson);

      const base = await db.productBaseDef.create({
        data: {
          shop: session.shop,
          slug,
          name: blueprintTitle,
          brand: blueprintBrand,
          model: blueprintModel,
          category,
          fulfillmentProvider: "printify",
          printifyBlueprintId: blueprintId,
          printifyProviderId: providerId,
          techniques: JSON.stringify([{ key: "dtg", displayName: "DTG Print", isDefault: true }]),
          placements: JSON.stringify([
            {
              placementKey: "front",
              displayName: "Front",
              technique: "dtg",
              maxAreaInches: { width: 10, height: 12 },
              fileSizePx: { width: 3000, height: 3600 },
              dpi: 300,
              mockupPosition: { x: 15, y: 20, width: 70, height: 65 },
            },
          ]),
          catalogImages: blueprintImages || "[]",
          description: `${blueprintBrand} ${blueprintModel} — ${blueprintTitle}. Provider: ${providerTitle} (#${providerId})`,
        },
      });

      const colorMap = new Map<string, typeof variants[0]>();
      for (const v of variants) {
        const color = v.options?.color || v.title?.split(" / ")?.[0] || v.title;
        if (!colorMap.has(color)) colorMap.set(color, v);
      }
      const hasSize = variants.some((v) => v.options?.size);
      if (hasSize) {
        for (const [color, v] of colorMap) {
          await db.productBaseVariant.create({
            data: { productBaseId: base.id, color, colorHex: "#ffffff", size: v.options?.size || null, printifyVariantId: v.id },
          });
        }
      } else {
        for (const v of variants) {
          const color = v.options?.color || v.title;
          await db.productBaseVariant.create({
            data: { productBaseId: base.id, color, colorHex: "#ffffff", printifyVariantId: v.id },
          });
        }
      }

      return json({
        success: true,
        message: `Imported "${blueprintTitle}" from Printify with ${hasSize ? colorMap.size : variants.length} variants`,
        baseId: base.id,
      });
    }

    // ── Printful Import ──────────────────────────────────────────────────────
    if (intent === "import_printful") {
      const productId = parseInt(formData.get("productId") as string);
      const productTitle = formData.get("productTitle") as string;
      const productBrand = (formData.get("productBrand") as string) || "";
      const productModel = (formData.get("productModel") as string) || productTitle;
      const productImage = (formData.get("productImage") as string) || "";
      const category = formData.get("category") as string;
      const variantsJson = formData.get("variants") as string;

      const slug = `printful-${productBrand || productTitle}-${productModel}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);

      const existing = await db.productBaseDef.findUnique({
        where: { shop_slug: { shop: session.shop, slug } },
      });
      if (existing) {
        return json({ error: `Product base "${slug}" already exists. Delete it first to re-import.` }, { status: 400 });
      }

      const variants: Array<{ id: number; name: string; color: string; colorCode: string; size: string | null; image: string }> =
        JSON.parse(variantsJson);

      const base = await db.productBaseDef.create({
        data: {
          shop: session.shop,
          slug,
          name: productTitle,
          brand: productBrand,
          model: productModel,
          category,
          fulfillmentProvider: "printful",
          printfulProductId: productId,
          techniques: JSON.stringify([{ key: "dtg", displayName: "DTG Print", isDefault: true }]),
          placements: JSON.stringify([
            {
              placementKey: "front",
              displayName: "Front",
              technique: "dtg",
              maxAreaInches: { width: 10, height: 12 },
              fileSizePx: { width: 3000, height: 3600 },
              dpi: 300,
              mockupPosition: { x: 15, y: 20, width: 70, height: 65 },
            },
          ]),
          catalogImages: productImage ? JSON.stringify([productImage]) : "[]",
          description: `${productBrand} ${productModel} — ${productTitle}. Fulfilled via Printful (#${productId})`,
          defaultMockupUrl: productImage || null,
        },
      });

      // Group by color
      const colorMap = new Map<string, typeof variants[0]>();
      for (const v of variants) {
        if (!colorMap.has(v.color)) colorMap.set(v.color, v);
      }

      for (const [color, v] of colorMap) {
        await db.productBaseVariant.create({
          data: {
            productBaseId: base.id,
            color,
            colorHex: v.colorCode || "#ffffff",
            mockupImageUrl: v.image || null,
            printfulVariantId: v.id,
          },
        });
      }

      return json({
        success: true,
        message: `Imported "${productTitle}" from Printful with ${colorMap.size} color variants`,
        baseId: base.id,
      });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (error: any) {
    console.error("[import] Error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

// ─── Printify Search Component ────────────────────────────────────────────────
function PrintifySearch({ onSelect }: { onSelect: (bp: any) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [allBlueprints, setAllBlueprints] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const loadBlueprints = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch("/api/printify-catalog?action=blueprints");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) { setAllBlueprints(data); setLoaded(true); }
      }
    } catch (err) { console.error("Failed to load blueprints:", err); }
    setLoading(false);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (!query.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = query.toLowerCase();
      setResults(allBlueprints.filter(
        (bp) => bp.title?.toLowerCase().includes(q) || bp.brand?.toLowerCase().includes(q) ||
          bp.model?.toLowerCase().includes(q) || String(bp.id).includes(q)
      ).slice(0, 20));
    }, 200);
  }, [query, allBlueprints, loaded]);

  return (
    <BlockStack gap="300">
      <TextField
        label="Search Printify Catalog"
        value={query}
        onChange={setQuery}
        onFocus={loadBlueprints}
        placeholder="e.g. 'tote bag', 'mug', 'bella canvas'..."
        autoComplete="off"
        connectedRight={loading ? <Spinner size="small" /> : undefined}
      />
      {!loaded && !loading && (
        <Text as="p" variant="bodySm" tone="subdued">Click the search field to load the Printify catalog (1300+ products)</Text>
      )}
      {loaded && query && results.length === 0 && (
        <Text as="p" variant="bodySm" tone="subdued">No results for "{query}"</Text>
      )}
      {results.length > 0 && (
        <div style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
          {results.map((bp) => (
            <div key={bp.id} onClick={() => onSelect(bp)}
              style={{ padding: "12px 16px", borderBottom: "1px solid #eee", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
            >
              {bp.images?.[0] && <img src={bp.images[0]} alt={bp.title} style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "4px" }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{bp.title}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>{bp.brand} · {bp.model} · ID #{bp.id}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </BlockStack>
  );
}

// ─── Printful Search Component ────────────────────────────────────────────────
function PrintfulSearch({ onSelect }: { onSelect: (product: any) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const loadProducts = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch("/api/printful-catalog?action=products");
      if (res.ok) {
        const data = await res.json();
        if (data.products) { setAllProducts(data.products); setLoaded(true); }
      }
    } catch (err) { console.error("Failed to load Printful products:", err); }
    setLoading(false);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (!query.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = query.toLowerCase();
      setResults(allProducts.filter(
        (p) => p.title?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q) ||
          p.model?.toLowerCase().includes(q) || p.type?.toLowerCase().includes(q) ||
          p.typeName?.toLowerCase().includes(q) || String(p.id).includes(q)
      ).slice(0, 20));
    }, 200);
  }, [query, allProducts, loaded]);

  return (
    <BlockStack gap="300">
      <TextField
        label="Search Printful Catalog"
        value={query}
        onChange={setQuery}
        onFocus={loadProducts}
        placeholder="e.g. 'mug', 'tote', 'gildan'..."
        autoComplete="off"
        connectedRight={loading ? <Spinner size="small" /> : undefined}
      />
      {!loaded && !loading && (
        <Text as="p" variant="bodySm" tone="subdued">Click the search field to load the Printful catalog</Text>
      )}
      {loaded && query && results.length === 0 && (
        <Text as="p" variant="bodySm" tone="subdued">No results for "{query}"</Text>
      )}
      {results.length > 0 && (
        <div style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
          {results.map((p) => (
            <div key={p.id} onClick={() => onSelect(p)}
              style={{ padding: "12px 16px", borderBottom: "1px solid #eee", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
            >
              {p.image && <img src={p.image} alt={p.title} style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "4px" }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{p.title}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>{p.brand || "Printful"} · ID #{p.id}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </BlockStack>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ImportPage() {
  const { existingBases } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  const [selectedTab, setSelectedTab] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Printify state ──
  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [variants, setVariants] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [category, setCategory] = useState("accessory");

  // ── Printful state ──
  const [selectedPFProduct, setSelectedPFProduct] = useState<any>(null);
  const [pfVariants, setPfVariants] = useState<any[]>([]);
  const [loadingPfVariants, setLoadingPfVariants] = useState(false);
  const [pfCategory, setPfCategory] = useState("accessory");

  const categoryOptions = [
    { label: "Shirt", value: "shirt" },
    { label: "Hoodie", value: "hoodie" },
    { label: "Hat", value: "hat" },
    { label: "Bag", value: "bag" },
    { label: "Accessory", value: "accessory" },
    { label: "Mug", value: "mug" },
    { label: "Other", value: "other" },
  ];

  const autoCategory = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes("tote") || t.includes("bag") || t.includes("pouch")) return "bag";
    if (t.includes("hat") || t.includes("cap") || t.includes("beanie")) return "hat";
    if (t.includes("shirt") || t.includes("tee")) return "shirt";
    if (t.includes("hoodie") || t.includes("sweatshirt")) return "hoodie";
    if (t.includes("mug") || t.includes("cup")) return "mug";
    return "accessory";
  };

  // ── Printify handlers ──
  const handleSelectBlueprint = useCallback(async (bp: any) => {
    setSelectedBlueprint(bp);
    setProviders([]);
    setSelectedProviderId("");
    setVariants([]);
    setLoadingProviders(true);
    setCategory(autoCategory(bp.title || ""));
    try {
      const res = await fetch(`/api/printify-catalog?action=providers&id=${bp.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setProviders(data);
          if (data.length === 1) setSelectedProviderId(String(data[0].id));
        }
      }
    } catch (err) { console.error("Failed to load providers:", err); }
    setLoadingProviders(false);
  }, []);

  useEffect(() => {
    if (!selectedBlueprint || !selectedProviderId) return;
    const load = async () => {
      setLoadingVariants(true);
      try {
        const res = await fetch(`/api/printify-catalog?action=variants&blueprint_id=${selectedBlueprint.id}&provider_id=${selectedProviderId}`);
        if (res.ok) {
          const data = await res.json();
          setVariants(data.variants || (Array.isArray(data) ? data : []));
        }
      } catch (err) { console.error("Failed to load variants:", err); }
      setLoadingVariants(false);
    };
    load();
  }, [selectedBlueprint, selectedProviderId]);

  const handleImportPrintify = useCallback(() => {
    if (!selectedBlueprint || !selectedProviderId) return;
    const provider = providers.find((p) => String(p.id) === selectedProviderId);
    const fd = new FormData();
    fd.set("intent", "import_blueprint");
    fd.set("blueprintId", String(selectedBlueprint.id));
    fd.set("providerId", selectedProviderId);
    fd.set("blueprintTitle", selectedBlueprint.title);
    fd.set("blueprintBrand", selectedBlueprint.brand || "");
    fd.set("blueprintModel", selectedBlueprint.model || "");
    fd.set("blueprintImages", JSON.stringify(selectedBlueprint.images || []));
    fd.set("category", category);
    fd.set("variants", JSON.stringify(variants));
    fd.set("providerTitle", provider?.title || "");
    submit(fd, { method: "post" });
  }, [selectedBlueprint, selectedProviderId, providers, variants, category, submit]);

  // ── Printful handlers ──
  const handleSelectPFProduct = useCallback(async (product: any) => {
    setSelectedPFProduct(product);
    setPfVariants([]);
    setLoadingPfVariants(true);
    setPfCategory(autoCategory(product.title || ""));
    try {
      const res = await fetch(`/api/printful-catalog?action=variants&productId=${product.id}`);
      if (res.ok) {
        const data = await res.json();
        setPfVariants(data.variants || []);
      }
    } catch (err) { console.error("Failed to load Printful variants:", err); }
    setLoadingPfVariants(false);
  }, []);

  const handleImportPrintful = useCallback(() => {
    if (!selectedPFProduct) return;
    const fd = new FormData();
    fd.set("intent", "import_printful");
    fd.set("productId", String(selectedPFProduct.id));
    fd.set("productTitle", selectedPFProduct.title);
    fd.set("productBrand", selectedPFProduct.brand || "");
    fd.set("productModel", selectedPFProduct.model || selectedPFProduct.title);
    fd.set("productImage", selectedPFProduct.image || "");
    fd.set("category", pfCategory);
    fd.set("variants", JSON.stringify(pfVariants));
    submit(fd, { method: "post" });
  }, [selectedPFProduct, pfVariants, pfCategory, submit]);

  const isAlreadyImportedPrintify = selectedBlueprint
    ? existingBases.some((b) => b.printifyBlueprintId === selectedBlueprint.id)
    : false;

  const isAlreadyImportedPrintful = selectedPFProduct
    ? existingBases.some((b) => b.printfulProductId === selectedPFProduct.id)
    : false;

  const uniqueColors = new Set(
    variants.map((v) => v.options?.color || v.title?.split(" / ")?.[0] || v.title)
  );

  const tabs = [
    { id: "printify", content: "Printify" },
    { id: "printful", content: "Printful" },
  ];

  return (
    <Page>
      <TitleBar title="Import Product Base" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData && "error" in actionData && (
              <Banner tone="critical"><p>{actionData.error}</p></Banner>
            )}
            {actionData && "success" in actionData && actionData.success && (
              <Banner tone="success"><p>{"message" in actionData ? String(actionData.message) : "Imported successfully!"}</p></Banner>
            )}

            <Card>
              {!mounted ? (
                <Box padding="400"><Spinner size="small" /></Box>
              ) : (
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <Box padding="400">
                  {/* ── Printify Tab ── */}
                  {selectedTab === 0 && (
                    <BlockStack gap="400">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Search the Printify catalog (1,300+ products) and import as a product base with all variant mappings.
                      </Text>
                      <PrintifySearch onSelect={handleSelectBlueprint} />

                      {selectedBlueprint && (
                        <>
                          <Divider />
                          <InlineStack gap="400" blockAlign="start">
                            {selectedBlueprint.images?.[0] && (
                              <img src={selectedBlueprint.images[0]} alt={selectedBlueprint.title}
                                style={{ width: "100px", height: "100px", objectFit: "contain", borderRadius: "8px", border: "1px solid #eee" }} />
                            )}
                            <BlockStack gap="200">
                              <Text as="h2" variant="headingLg">{selectedBlueprint.title}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {selectedBlueprint.brand} · {selectedBlueprint.model} · Blueprint #{selectedBlueprint.id}
                              </Text>
                              {isAlreadyImportedPrintify && <Badge tone="warning">Already imported</Badge>}
                            </BlockStack>
                          </InlineStack>

                          <Select label="Product Category" options={categoryOptions} value={category} onChange={setCategory} />

                          <BlockStack gap="200">
                            <Text as="h3" variant="headingMd">Print Provider</Text>
                            {loadingProviders ? (
                              <InlineStack gap="200" blockAlign="center"><Spinner size="small" /><Text as="p" variant="bodySm">Loading providers...</Text></InlineStack>
                            ) : providers.length === 0 ? (
                              <Banner tone="warning"><p>No print providers found for this blueprint.</p></Banner>
                            ) : (
                              <Select
                                label="Select a print provider"
                                options={[{ label: "Choose a provider...", value: "" }, ...providers.map((p) => ({ label: `${p.title} (#${p.id})`, value: String(p.id) }))]}
                                value={selectedProviderId}
                                onChange={setSelectedProviderId}
                              />
                            )}
                          </BlockStack>

                          {selectedProviderId && (
                            <BlockStack gap="200">
                              <Text as="h3" variant="headingMd">Variants</Text>
                              {loadingVariants ? (
                                <InlineStack gap="200" blockAlign="center"><Spinner size="small" /><Text as="p" variant="bodySm">Loading variants...</Text></InlineStack>
                              ) : (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {variants.length} total variants · {uniqueColors.size} unique colors
                                </Text>
                              )}
                              <InlineStack gap="200" wrap>
                                {Array.from(uniqueColors).slice(0, 12).map((color) => (
                                  <Badge key={String(color)}>{String(color)}</Badge>
                                ))}
                                {uniqueColors.size > 12 && <Badge tone="info">{`+${uniqueColors.size - 12} more`}</Badge>}
                              </InlineStack>
                            </BlockStack>
                          )}

                          <Button
                            variant="primary"
                            onClick={handleImportPrintify}
                            disabled={!selectedProviderId || isSubmitting || variants.length === 0}
                            loading={isSubmitting}
                          >
                            Import as Product Base
                          </Button>
                        </>
                      )}
                    </BlockStack>
                  )}

                  {/* ── Printful Tab ── */}
                  {selectedTab === 1 && (
                    <BlockStack gap="400">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Search the Printful catalog and import as a product base with all variant mappings.
                      </Text>
                      <PrintfulSearch onSelect={handleSelectPFProduct} />

                      {selectedPFProduct && (
                        <>
                          <Divider />
                          <InlineStack gap="400" blockAlign="start">
                            {selectedPFProduct.image && (
                              <img src={selectedPFProduct.image} alt={selectedPFProduct.title}
                                style={{ width: "100px", height: "100px", objectFit: "contain", borderRadius: "8px", border: "1px solid #eee" }} />
                            )}
                            <BlockStack gap="200">
                              <Text as="h2" variant="headingLg">{selectedPFProduct.title}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {selectedPFProduct.brand || "Printful"} · ID #{selectedPFProduct.id}
                              </Text>
                              {isAlreadyImportedPrintful && <Badge tone="warning">Already imported</Badge>}
                            </BlockStack>
                          </InlineStack>

                          <Select label="Product Category" options={categoryOptions} value={pfCategory} onChange={setPfCategory} />

                          <BlockStack gap="200">
                            <Text as="h3" variant="headingMd">Variants</Text>
                            {loadingPfVariants ? (
                              <InlineStack gap="200" blockAlign="center"><Spinner size="small" /><Text as="p" variant="bodySm">Loading variants...</Text></InlineStack>
                            ) : pfVariants.length > 0 ? (
                              <>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {pfVariants.length} unique colors
                                </Text>
                                <InlineStack gap="200" wrap>
                                  {pfVariants.slice(0, 12).map((v) => (
                                    <Badge key={v.id}>{v.color}</Badge>
                                  ))}
                                  {pfVariants.length > 12 && <Badge tone="info">{`+${pfVariants.length - 12} more`}</Badge>}
                                </InlineStack>
                              </>
                            ) : (
                              <Text as="p" variant="bodySm" tone="subdued">Select a product to see variants</Text>
                            )}
                          </BlockStack>

                          <Button
                            variant="primary"
                            onClick={handleImportPrintful}
                            disabled={isSubmitting || pfVariants.length === 0}
                            loading={isSubmitting}
                          >
                            Import as Product Base
                          </Button>
                        </>
                      )}
                    </BlockStack>
                  )}
                </Box>
              </Tabs>
              )}
            </Card>

            {/* Existing bases summary */}
            {existingBases.length > 0 && (
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">Imported Product Bases ({existingBases.length})</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Manage these in the Mockup Manager to upload mockup images and set print areas.
                  </Text>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
