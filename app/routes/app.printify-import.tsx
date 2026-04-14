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
  Checkbox,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState, useCallback, useEffect, useRef } from "react";

const PRINTIFY_TOKEN = process.env.PRINTIFY_TOKEN || "";
const PRINTIFY_API = "https://api.printify.com/v1";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Load existing product bases to check for duplicates
  const existingBases = await db.productBaseDef.findMany({
    where: { shop: session.shop },
    select: { slug: true, printifyBlueprintId: true },
  });

  return json({ shop: session.shop, existingBases });
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "import_blueprint") {
      const blueprintId = parseInt(formData.get("blueprintId") as string);
      const providerId = parseInt(formData.get("providerId") as string);
      const blueprintTitle = formData.get("blueprintTitle") as string;
      const blueprintBrand = formData.get("blueprintBrand") as string;
      const blueprintModel = formData.get("blueprintModel") as string;
      const blueprintImages = formData.get("blueprintImages") as string;
      const category = formData.get("category") as string;
      const variantsJson = formData.get("variants") as string;
      const providerTitle = formData.get("providerTitle") as string;

      // Generate slug
      const slug = `${blueprintBrand}-${blueprintModel}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Check for existing
      const existing = await db.productBaseDef.findUnique({
        where: { shop_slug: { shop: session.shop, slug } },
      });

      if (existing) {
        return json({ error: `Product base "${slug}" already exists. Delete it first to re-import.` }, { status: 400 });
      }

      // Parse variants
      const variants: Array<{
        id: number;
        title: string;
        options: Record<string, string>;
      }> = JSON.parse(variantsJson);

      // Create the product base
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
          techniques: JSON.stringify([
            { key: "dtg", displayName: "DTG Print", isDefault: true },
          ]),
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

      // Create variants — group by color (take first size as reference)
      const colorMap = new Map<string, typeof variants[0]>();
      for (const v of variants) {
        const color = v.options?.color || v.title?.split(" / ")?.[0] || v.title;
        if (!colorMap.has(color)) {
          colorMap.set(color, v);
        }
      }

      // Also create all size variants for sized products
      const hasSize = variants.some((v) => v.options?.size);

      if (hasSize) {
        // For sized products, create one entry per color (reference only)
        for (const [color, v] of colorMap) {
          await db.productBaseVariant.create({
            data: {
              productBaseId: base.id,
              color,
              colorHex: "#ffffff", // Will need to be set manually or via color mapping
              size: v.options?.size || null,
              printifyVariantId: v.id,
            },
          });
        }
      } else {
        // For one-size products, create all variants
        for (const v of variants) {
          const color = v.options?.color || v.title;
          await db.productBaseVariant.create({
            data: {
              productBaseId: base.id,
              color,
              colorHex: "#ffffff",
              printifyVariantId: v.id,
            },
          });
        }
      }

      return json({
        success: true,
        message: `Imported "${blueprintTitle}" with ${hasSize ? colorMap.size : variants.length} variants`,
        baseId: base.id,
      });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (error: any) {
    console.error("[printify-import] Error:", error);
    return json({ error: error.message }, { status: 500 });
  }
};

// ─── Blueprint Search Component ──────────────────────────────────────────────
function BlueprintSearch({
  onSelect,
}: {
  onSelect: (bp: any) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [allBlueprints, setAllBlueprints] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Load all blueprints once
  const loadBlueprints = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res = await fetch("/api/printify-catalog?action=blueprints");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAllBlueprints(data);
          setLoaded(true);
        }
      }
    } catch (err) {
      console.error("Failed to load blueprints:", err);
    }
    setLoading(false);
  }, [loaded]);

  // Filter on query change
  useEffect(() => {
    if (!loaded) return;
    if (!query.trim()) {
      setResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = query.toLowerCase();
      const filtered = allBlueprints.filter(
        (bp) =>
          bp.title?.toLowerCase().includes(q) ||
          bp.brand?.toLowerCase().includes(q) ||
          bp.model?.toLowerCase().includes(q) ||
          String(bp.id).includes(q)
      );
      setResults(filtered.slice(0, 20)); // Show max 20
    }, 200);
  }, [query, allBlueprints, loaded]);

  return (
    <BlockStack gap="300">
      <TextField
        label="Search Printify Catalog"
        value={query}
        onChange={(val) => setQuery(val)}
        onFocus={loadBlueprints}
        placeholder="Type to search (e.g., 'tote bag', 'comfort colors', 'bella canvas')..."
        autoComplete="off"
        connectedRight={
          loading ? <Spinner size="small" /> : undefined
        }
      />

      {!loaded && !loading && (
        <Text as="p" variant="bodySm" tone="subdued">
          Click the search field to load the Printify catalog (1300+ products)
        </Text>
      )}

      {loaded && query && results.length === 0 && (
        <Text as="p" variant="bodySm" tone="subdued">
          No results for "{query}"
        </Text>
      )}

      {results.length > 0 && (
        <div style={{ maxHeight: "400px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
          {results.map((bp) => (
            <div
              key={bp.id}
              onClick={() => onSelect(bp)}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #eee",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
            >
              {bp.images?.[0] && (
                <img
                  src={bp.images[0]}
                  alt={bp.title}
                  style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "4px" }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14px" }}>{bp.title}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  {bp.brand} · {bp.model} · ID #{bp.id}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </BlockStack>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PrintifyImportPage() {
  const { existingBases } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";

  // Selected blueprint
  const [selectedBlueprint, setSelectedBlueprint] = useState<any>(null);

  // Providers & variants
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [variants, setVariants] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);

  // Category
  const [category, setCategory] = useState("accessory");

  // Check if already imported
  const isAlreadyImported = selectedBlueprint
    ? existingBases.some((b) => b.printifyBlueprintId === selectedBlueprint.id)
    : false;

  // When a blueprint is selected, load its providers
  const handleSelectBlueprint = useCallback(async (bp: any) => {
    setSelectedBlueprint(bp);
    setProviders([]);
    setSelectedProviderId("");
    setVariants([]);
    setLoadingProviders(true);

    // Auto-detect category from title
    const title = bp.title?.toLowerCase() || "";
    if (title.includes("tote") || title.includes("bag") || title.includes("pouch")) {
      setCategory("bag");
    } else if (title.includes("hat") || title.includes("cap") || title.includes("beanie")) {
      setCategory("hat");
    } else if (title.includes("shirt") || title.includes("tee")) {
      setCategory("shirt");
    } else if (title.includes("hoodie") || title.includes("sweatshirt")) {
      setCategory("hoodie");
    } else {
      setCategory("accessory");
    }

    try {
      const res = await fetch(`/api/printify-catalog?action=providers&id=${bp.id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setProviders(data);
          if (data.length === 1) {
            setSelectedProviderId(String(data[0].id));
          }
        }
      }
    } catch (err) {
      console.error("Failed to load providers:", err);
    }
    setLoadingProviders(false);
  }, []);

  // When a provider is selected, load variants
  useEffect(() => {
    if (!selectedBlueprint || !selectedProviderId) return;

    const loadVariants = async () => {
      setLoadingVariants(true);
      try {
        const res = await fetch(
          `/api/printify-catalog?action=variants&blueprint_id=${selectedBlueprint.id}&provider_id=${selectedProviderId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.variants) {
            setVariants(data.variants);
          } else if (Array.isArray(data)) {
            setVariants(data);
          }
        }
      } catch (err) {
        console.error("Failed to load variants:", err);
      }
      setLoadingVariants(false);
    };

    loadVariants();
  }, [selectedBlueprint, selectedProviderId]);

  // Import the blueprint
  const handleImport = useCallback(() => {
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

  // Unique colors from variants
  const uniqueColors = new Set(
    variants.map((v) => v.options?.color || v.title?.split(" / ")?.[0] || v.title)
  );

  return (
    <Page>
      <TitleBar title="Import from Printify" />

      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Search */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Search Printify Catalog</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Search for a product in the Printify catalog to import it as a product base.
                  This will create the product base configuration with all variants and provider mappings.
                </Text>
                <BlueprintSearch onSelect={handleSelectBlueprint} />
              </BlockStack>
            </Card>

            {/* Selected Blueprint Details */}
            {selectedBlueprint && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="400" blockAlign="start">
                    {selectedBlueprint.images?.[0] && (
                      <img
                        src={selectedBlueprint.images[0]}
                        alt={selectedBlueprint.title}
                        style={{
                          width: "120px",
                          height: "120px",
                          objectFit: "contain",
                          borderRadius: "8px",
                          border: "1px solid #eee",
                        }}
                      />
                    )}
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingLg">{selectedBlueprint.title}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {selectedBlueprint.brand} · {selectedBlueprint.model} · Blueprint #{selectedBlueprint.id}
                      </Text>
                      {isAlreadyImported && (
                        <Badge tone="warning">Already imported</Badge>
                      )}
                    </BlockStack>
                  </InlineStack>

                  <Divider />

                  {/* Category */}
                  <Select
                    label="Product Category"
                    options={[
                      { label: "Shirt", value: "shirt" },
                      { label: "Hoodie", value: "hoodie" },
                      { label: "Hat", value: "hat" },
                      { label: "Bag", value: "bag" },
                      { label: "Accessory", value: "accessory" },
                    ]}
                    value={category}
                    onChange={setCategory}
                  />

                  <Divider />

                  {/* Print Provider Selection */}
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">Print Provider</Text>
                    {loadingProviders ? (
                      <InlineStack gap="200" blockAlign="center">
                        <Spinner size="small" />
                        <Text as="p" variant="bodySm">Loading providers...</Text>
                      </InlineStack>
                    ) : providers.length === 0 ? (
                      <Banner tone="warning">
                        <p>No print providers found for this blueprint.</p>
                      </Banner>
                    ) : (
                      <Select
                        label="Select a print provider"
                        options={[
                          { label: "Choose a provider...", value: "" },
                          ...providers.map((p) => ({
                            label: `${p.title} (#${p.id})`,
                            value: String(p.id),
                          })),
                        ]}
                        value={selectedProviderId}
                        onChange={setSelectedProviderId}
                      />
                    )}
                  </BlockStack>

                  {/* Variants Preview */}
                  {selectedProviderId && (
                    <>
                      <Divider />
                      <BlockStack gap="200">
                        <Text as="h3" variant="headingMd">Variants</Text>
                        {loadingVariants ? (
                          <InlineStack gap="200" blockAlign="center">
                            <Spinner size="small" />
                            <Text as="p" variant="bodySm">Loading variants...</Text>
                          </InlineStack>
                        ) : variants.length === 0 ? (
                          <Text as="p" variant="bodySm" tone="subdued">No variants found</Text>
                        ) : (
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm">
                              {variants.length} total variants · {uniqueColors.size} unique colors
                            </Text>
                            <InlineStack gap="200" wrap>
                              {Array.from(uniqueColors).slice(0, 30).map((color) => (
                                <Badge key={color}>{color}</Badge>
                              ))}
                              {uniqueColors.size > 30 && (
                                <Badge tone="info">{`+${uniqueColors.size - 30} more`}</Badge>
                              )}
                            </InlineStack>
                          </BlockStack>
                        )}
                      </BlockStack>
                    </>
                  )}

                  {/* Import Button */}
                  {selectedProviderId && variants.length > 0 && (
                    <>
                      <Divider />
                      <InlineStack align="end">
                        <Button
                          variant="primary"
                          onClick={handleImport}
                          loading={isSubmitting}
                          disabled={isAlreadyImported}
                        >
                          {isAlreadyImported ? "Already Imported" : `Import as Product Base`}
                        </Button>
                      </InlineStack>
                    </>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* Action Result */}
            {actionData && "error" in actionData && (
              <Banner tone="critical">
                <p>{(actionData as any).error}</p>
              </Banner>
            )}
            {actionData && "success" in actionData && (
              <Banner tone="success">
                <p>{(actionData as any).message}</p>
                <p>Go to the <a href="/app/mockup-manager">Mockup Manager</a> to upload mockup images and set print areas.</p>
              </Banner>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
