import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/node";
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
  RangeSlider,
  DropZone,
  Spinner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState, useCallback, useEffect } from "react";

// ─── Loader: fetch all product bases for this shop ───
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const productBases = await db.productBase.findMany({
    where: { shop: session.shop },
    include: { images: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  return json({ productBases, shop: session.shop });
};

// ─── Action: handle create, update, delete, upload ───
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Check if this is a multipart upload
  const contentType = request.headers.get("content-type") || "";
  let formData: FormData;

  if (contentType.includes("multipart/form-data")) {
    const uploadHandler = unstable_createMemoryUploadHandler({
      maxPartSize: 20_000_000, // 20MB
    });
    formData = await unstable_parseMultipartFormData(request, uploadHandler);
  } else {
    formData = await request.formData();
  }

  const intent = formData.get("intent") as string;

  try {
    // ── Create / Update product base ──
    if (intent === "upsert") {
      const shopifyProductId = formData.get("shopifyProductId") as string;
      const productTitle = formData.get("productTitle") as string;
      const productHandle = formData.get("productHandle") as string;
      const printAreaX = parseFloat(formData.get("printAreaX") as string) || 25;
      const printAreaY = parseFloat(formData.get("printAreaY") as string) || 15;
      const printAreaWidth = parseFloat(formData.get("printAreaWidth") as string) || 50;
      const printAreaHeight = parseFloat(formData.get("printAreaHeight") as string) || 35;

      const productBase = await db.productBase.upsert({
        where: {
          shop_shopifyProductId: {
            shop: session.shop,
            shopifyProductId,
          },
        },
        update: {
          productTitle,
          productHandle,
          printAreaX,
          printAreaY,
          printAreaWidth,
          printAreaHeight,
          updatedAt: new Date(),
        },
        create: {
          shop: session.shop,
          shopifyProductId,
          productTitle,
          productHandle: productHandle || undefined,
          printAreaX,
          printAreaY,
          printAreaWidth,
          printAreaHeight,
        },
      });

      return json({ success: true, productBase, message: "Product base saved." });
    }

    // ── Upload image (handles entire flow server-side) ──
    if (intent === "uploadImage") {
      const productBaseId = formData.get("productBaseId") as string;
      const shopifyVariantId = formData.get("shopifyVariantId") as string | null;
      const variantTitle = formData.get("variantTitle") as string | null;
      const file = formData.get("file") as File;

      if (!file || !(file instanceof File)) {
        return json({ success: false, error: "No file provided" });
      }

      // Step 1: Create staged upload target
      const stagedResponse = await admin.graphql(
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
            input: [
              {
                filename: file.name,
                mimeType: file.type || "image/png",
                resource: "FILE",
                fileSize: file.size.toString(),
                httpMethod: "POST",
              },
            ],
          },
        }
      );

      const stagedJson = await stagedResponse.json();
      const targets = stagedJson.data?.stagedUploadsCreate?.stagedTargets;
      const stagedErrors = stagedJson.data?.stagedUploadsCreate?.userErrors;

      if (stagedErrors && stagedErrors.length > 0) {
        return json({ success: false, error: `Staged upload error: ${stagedErrors[0].message}` });
      }

      const target = targets?.[0];
      if (!target) {
        return json({ success: false, error: "No staged upload target returned" });
      }

      // Step 2: Upload file to the staged URL
      const uploadFormData = new FormData();
      target.parameters.forEach((param: { name: string; value: string }) => {
        uploadFormData.append(param.name, param.value);
      });

      // Convert the File to a Blob for server-side fetch
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const blob = new Blob([fileBuffer], { type: file.type || "image/png" });
      uploadFormData.append("file", blob, file.name);

      const uploadResponse = await fetch(target.url, {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        return json({ success: false, error: `Upload to S3 failed: ${uploadResponse.statusText}` });
      }

      // Step 3: Create file in Shopify
      const createResponse = await admin.graphql(
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
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            files: [
              {
                originalSource: target.resourceUrl,
                alt: file.name,
                contentType: "IMAGE",
              },
            ],
          },
        }
      );

      const createJson = await createResponse.json();
      const files = createJson.data?.fileCreate?.files;
      const createErrors = createJson.data?.fileCreate?.userErrors;

      if (createErrors && createErrors.length > 0) {
        return json({ success: false, error: `File create error: ${createErrors[0].message}` });
      }

      const fileId = files?.[0]?.id;
      let imageUrl = files?.[0]?.image?.url;

      // Step 4: Poll for the image URL if not immediately available
      if (!imageUrl && fileId) {
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));

          const pollResponse = await admin.graphql(
            `#graphql
            query getFile($id: ID!) {
              node(id: $id) {
                ... on MediaImage {
                  id
                  image {
                    url
                  }
                  fileStatus
                }
              }
            }`,
            { variables: { id: fileId } }
          );

          const pollJson = await pollResponse.json();
          const node = pollJson.data?.node;

          if (node?.image?.url) {
            imageUrl = node.image.url;
            break;
          }
          if (node?.fileStatus === "FAILED") {
            return json({ success: false, error: "Shopify file processing failed" });
          }
        }
      }

      if (!imageUrl) {
        return json({ success: false, error: "Timed out waiting for image URL from Shopify" });
      }

      // Step 5: Save the image record in our database
      const image = await db.productBaseImage.create({
        data: {
          productBaseId,
          shopifyVariantId: shopifyVariantId || null,
          variantTitle: variantTitle || "Default",
          imageUrl,
        },
      });

      // Reload the product base to return updated data
      const updatedBase = await db.productBase.findUnique({
        where: { id: productBaseId },
        include: { images: { orderBy: { sortOrder: "asc" } } },
      });

      return json({ success: true, image, updatedBase, message: "Image uploaded successfully!" });
    }

    // ── Remove variant image ──
    if (intent === "removeImage") {
      const imageId = formData.get("imageId") as string;
      await db.productBaseImage.delete({ where: { id: imageId } });
      return json({ success: true, message: "Image removed." });
    }

    // ── Delete product base ──
    if (intent === "delete") {
      const productBaseId = formData.get("productBaseId") as string;
      await db.productBase.delete({ where: { id: productBaseId } });
      return json({ success: true, message: "Product base deleted." });
    }

    // ── Fetch products for picker ──
    if (intent === "fetchProducts") {
      const response = await admin.graphql(
        `#graphql
        query getProducts {
          products(first: 50, sortKey: TITLE) {
            edges {
              node {
                id
                title
                handle
                featuredImage {
                  url
                }
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      selectedOptions {
                        name
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }`
      );

      const responseJson = await response.json();
      const products = responseJson.data?.products?.edges?.map(
        (e: any) => e.node
      );

      return json({ success: true, products });
    }

    return json({ success: false, error: "Unknown intent" });
  } catch (error: any) {
    console.error("Product base action error:", error);
    return json({ success: false, error: error.message });
  }
};

// ─── Component ───
export default function ProductBases() {
  const { productBases: initialBases } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  // Keep a local copy of product bases that updates from action data
  const [productBases, setProductBases] = useState(initialBases);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedBase, setSelectedBase] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Print area settings
  const [printAreaX, setPrintAreaX] = useState(25);
  const [printAreaY, setPrintAreaY] = useState(15);
  const [printAreaWidth, setPrintAreaWidth] = useState(50);
  const [printAreaHeight, setPrintAreaHeight] = useState(35);

  // Image upload
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedVariantTitle, setSelectedVariantTitle] = useState("Default");

  // Sync product bases from loader
  useEffect(() => {
    setProductBases(initialBases);
  }, [initialBases]);

  // Update from action data
  useEffect(() => {
    if (actionData && "products" in actionData && actionData.products) {
      setProducts(actionData.products as any[]);
    }
    if (actionData && "updatedBase" in actionData && actionData.updatedBase) {
      // Update the local product bases list with the updated base
      setProductBases((prev: any[]) =>
        prev.map((b: any) =>
          b.id === (actionData as any).updatedBase.id ? (actionData as any).updatedBase : b
        )
      );
      // Also update selectedBase if it's the same
      if (selectedBase?.id === (actionData as any).updatedBase.id) {
        setSelectedBase((actionData as any).updatedBase);
      }
      setUploadingImage(false);
    }
    if (actionData && "message" in actionData && actionData.message) {
      // Upload completed
      setUploadingImage(false);
    }
    if (actionData && "error" in actionData && actionData.error) {
      setUploadingImage(false);
    }
  }, [actionData, selectedBase]);

  // Fetch products when create modal opens
  const handleOpenCreate = useCallback(() => {
    setSelectedBase(null);
    setShowCreateModal(true);
    const formData = new FormData();
    formData.set("intent", "fetchProducts");
    submit(formData, { method: "post" });
  }, [submit]);

  // Handle product selection
  const handleSelectProduct = useCallback((product: any) => {
    setSelectedProduct(product);
    setPrintAreaX(25);
    setPrintAreaY(15);
    setPrintAreaWidth(50);
    setPrintAreaHeight(35);
  }, []);

  // Save product base
  const handleSaveBase = useCallback(() => {
    if (!selectedProduct) return;
    const formData = new FormData();
    formData.set("intent", "upsert");
    formData.set("shopifyProductId", selectedProduct.id);
    formData.set("productTitle", selectedProduct.title);
    formData.set("productHandle", selectedProduct.handle || "");
    formData.set("printAreaX", printAreaX.toString());
    formData.set("printAreaY", printAreaY.toString());
    formData.set("printAreaWidth", printAreaWidth.toString());
    formData.set("printAreaHeight", printAreaHeight.toString());
    submit(formData, { method: "post" });
    setShowCreateModal(false);
    setSelectedProduct(null);
  }, [selectedProduct, printAreaX, printAreaY, printAreaWidth, printAreaHeight, submit]);

  // Open image management for a product base
  const handleManageImages = useCallback((base: any) => {
    setSelectedBase(base);
    setShowImageModal(true);
    setSelectedVariantId("");
    setSelectedVariantTitle("Default");
  }, []);

  // Delete a product base
  const handleDeleteBase = useCallback(
    (baseId: string) => {
      if (!confirm("Delete this product base and all its images?")) return;
      const formData = new FormData();
      formData.set("intent", "delete");
      formData.set("productBaseId", baseId);
      submit(formData, { method: "post" });
    },
    [submit]
  );

  // Handle image file drop/upload — now sends file directly to server action
  const handleDropZoneDrop = useCallback(
    (_dropFiles: File[], acceptedFiles: File[]) => {
      if (!selectedBase || acceptedFiles.length === 0) return;
      setUploadingImage(true);

      const file = acceptedFiles[0];
      const formData = new FormData();
      formData.set("intent", "uploadImage");
      formData.set("productBaseId", selectedBase.id);
      formData.set("shopifyVariantId", selectedVariantId);
      formData.set("variantTitle", selectedVariantTitle || "Default");
      formData.set("file", file);

      submit(formData, {
        method: "post",
        encType: "multipart/form-data",
      });
    },
    [selectedBase, selectedVariantId, selectedVariantTitle, submit]
  );

  // Remove an image
  const handleRemoveImage = useCallback(
    (imageId: string) => {
      const formData = new FormData();
      formData.set("intent", "removeImage");
      formData.set("imageId", imageId);
      submit(formData, { method: "post" });
    },
    [submit]
  );

  // Edit print area for existing base
  const handleEditPrintArea = useCallback((base: any) => {
    setSelectedBase(base);
    setSelectedProduct({
      id: base.shopifyProductId,
      title: base.productTitle,
      handle: base.productHandle,
      featuredImage: base.images.length > 0 ? { url: base.images[0].imageUrl } : null,
    });
    setPrintAreaX(base.printAreaX);
    setPrintAreaY(base.printAreaY);
    setPrintAreaWidth(base.printAreaWidth);
    setPrintAreaHeight(base.printAreaHeight);
    setShowCreateModal(true);
  }, []);

  const resourceName = {
    singular: "product base",
    plural: "product bases",
  };

  const rowMarkup = productBases.map((base: any, index: number) => (
    <IndexTable.Row id={base.id} key={base.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {base.productTitle}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          {base.images.length > 0 ? (
            base.images.slice(0, 4).map((img: any) => (
              <Thumbnail
                key={img.id}
                source={img.imageUrl}
                alt={img.variantTitle || "Base"}
                size="small"
              />
            ))
          ) : (
            <Text as="span" tone="subdued">No images</Text>
          )}
          {base.images.length > 4 && (
            <Text as="span" tone="subdued">+{base.images.length - 4}</Text>
          )}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span">{base.images.length} variant(s)</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={base.isActive ? "success" : undefined}>
          {base.isActive ? "Active" : "Inactive"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button size="slim" onClick={() => handleManageImages(base)}>
            Images
          </Button>
          <Button size="slim" onClick={() => handleEditPrintArea(base)}>
            Print Area
          </Button>
          <Button
            size="slim"
            tone="critical"
            onClick={() => handleDeleteBase(base.id)}
          >
            Delete
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page>
      <TitleBar title="Product Bases" />
      <BlockStack gap="500">
        {actionData && "error" in actionData && actionData.error && (
          <Banner tone="critical">
            <p>{actionData.error as string}</p>
          </Banner>
        )}

        {actionData && "message" in actionData && actionData.message && (
          <Banner tone="success" onDismiss={() => {}}>
            <p>{actionData.message as string}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Product Bases
                  </Text>
                  <Button variant="primary" onClick={handleOpenCreate}>
                    Add Product Base
                  </Button>
                </InlineStack>

                <Text as="p" tone="subdued">
                  Upload blank mockup photos for each product variant. These
                  images are used as the base for the live monogram preview on
                  the storefront.
                </Text>

                {productBases.length === 0 ? (
                  <EmptyState
                    heading="No product bases yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    action={{
                      content: "Add Product Base",
                      onAction: handleOpenCreate,
                    }}
                  >
                    <p>
                      Add a product base to start configuring personalization
                      previews. Upload blank mockup photos for each color
                      variant and define where the monogram should appear.
                    </p>
                  </EmptyState>
                ) : (
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={productBases.length}
                    headings={[
                      { title: "Product" },
                      { title: "Mockup Images" },
                      { title: "Variants" },
                      { title: "Status" },
                      { title: "Actions" },
                    ]}
                    selectable={false}
                  >
                    {rowMarkup}
                  </IndexTable>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* ── Create / Edit Product Base Modal ── */}
      {showCreateModal && (
        <Modal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedProduct(null);
            setSelectedBase(null);
          }}
          title={selectedBase ? "Edit Print Area" : "Add Product Base"}
          primaryAction={{
            content: "Save",
            onAction: handleSaveBase,
            disabled: !selectedProduct,
            loading: isLoading,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setShowCreateModal(false);
                setSelectedProduct(null);
                setSelectedBase(null);
              },
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {!selectedBase && (
                <>
                  <Text as="h3" variant="headingSm">
                    Select a Product
                  </Text>
                  {products.length === 0 ? (
                    <InlineStack align="center">
                      <Spinner size="small" />
                      <Text as="span">Loading products...</Text>
                    </InlineStack>
                  ) : (
                    <BlockStack gap="200">
                      {products.map((product: any) => (
                        <div
                          key={product.id}
                          onClick={() => handleSelectProduct(product)}
                          style={{
                            padding: "12px",
                            border:
                              selectedProduct?.id === product.id
                                ? "2px solid #008060"
                                : "1px solid #e1e3e5",
                            borderRadius: "8px",
                            cursor: "pointer",
                            backgroundColor:
                              selectedProduct?.id === product.id
                                ? "#f0fdf4"
                                : "white",
                          }}
                        >
                          <InlineStack gap="300" blockAlign="center">
                            {product.featuredImage && (
                              <Thumbnail
                                source={product.featuredImage.url}
                                alt={product.title}
                                size="small"
                              />
                            )}
                            <BlockStack gap="100">
                              <Text as="span" fontWeight="bold">
                                {product.title}
                              </Text>
                              <Text as="span" tone="subdued">
                                {product.variants.edges.length} variant(s)
                              </Text>
                            </BlockStack>
                          </InlineStack>
                        </div>
                      ))}
                    </BlockStack>
                  )}
                  <Divider />
                </>
              )}

              {selectedProduct && (
                <>
                  <Text as="h3" variant="headingSm">
                    Print Area Position
                  </Text>
                  <Text as="p" tone="subdued">
                    Define where the monogram text should appear on the product
                    mockup. Values are percentages of the image dimensions.
                  </Text>

                  {/* Visual preview of print area */}
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      paddingBottom: "100%",
                      backgroundColor: "#f6f6f7",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    {selectedProduct.featuredImage && (
                      <img
                        src={selectedProduct.featuredImage.url}
                        alt={selectedProduct.title}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    )}
                    <div
                      style={{
                        position: "absolute",
                        left: `${printAreaX}%`,
                        top: `${printAreaY}%`,
                        width: `${printAreaWidth}%`,
                        height: `${printAreaHeight}%`,
                        border: "2px dashed #008060",
                        backgroundColor: "rgba(0, 128, 96, 0.1)",
                        borderRadius: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text as="span" tone="success">
                        ABC
                      </Text>
                    </div>
                  </div>

                  <FormLayout>
                    <FormLayout.Group>
                      <RangeSlider
                        label={`Left: ${printAreaX}%`}
                        value={printAreaX}
                        min={0}
                        max={80}
                        onChange={(v) => setPrintAreaX(v as number)}
                        output
                      />
                      <RangeSlider
                        label={`Top: ${printAreaY}%`}
                        value={printAreaY}
                        min={0}
                        max={80}
                        onChange={(v) => setPrintAreaY(v as number)}
                        output
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <RangeSlider
                        label={`Width: ${printAreaWidth}%`}
                        value={printAreaWidth}
                        min={10}
                        max={100}
                        onChange={(v) => setPrintAreaWidth(v as number)}
                        output
                      />
                      <RangeSlider
                        label={`Height: ${printAreaHeight}%`}
                        value={printAreaHeight}
                        min={5}
                        max={80}
                        onChange={(v) => setPrintAreaHeight(v as number)}
                        output
                      />
                    </FormLayout.Group>
                  </FormLayout>
                </>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {/* ── Manage Images Modal ── */}
      {showImageModal && selectedBase && (
        <Modal
          open={showImageModal}
          onClose={() => {
            setShowImageModal(false);
            setSelectedBase(null);
          }}
          title={`Mockup Images: ${selectedBase.productTitle}`}
          large
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p" tone="subdued">
                Upload blank mockup photos for each color variant. The monogram
                will be overlaid on these images in the live preview.
              </Text>

              {/* Existing images */}
              {selectedBase.images.length > 0 && (
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Current Images
                  </Text>
                  {selectedBase.images.map((img: any) => (
                    <InlineStack
                      key={img.id}
                      gap="400"
                      blockAlign="center"
                      align="space-between"
                    >
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={img.imageUrl}
                          alt={img.variantTitle || "Base"}
                          size="medium"
                        />
                        <BlockStack gap="100">
                          <Text as="span" fontWeight="bold">
                            {img.variantTitle || "Default"}
                          </Text>
                          {img.shopifyVariantId && (
                            <Text as="span" tone="subdued">
                              Variant ID: {img.shopifyVariantId}
                            </Text>
                          )}
                        </BlockStack>
                      </InlineStack>
                      <Button
                        tone="critical"
                        size="slim"
                        onClick={() => handleRemoveImage(img.id)}
                      >
                        Remove
                      </Button>
                    </InlineStack>
                  ))}
                </BlockStack>
              )}

              <Divider />

              {/* Upload new image */}
              <Text as="h3" variant="headingSm">
                Add New Mockup Image
              </Text>

              <FormLayout>
                <TextField
                  label="Variant Name"
                  value={selectedVariantTitle}
                  onChange={setSelectedVariantTitle}
                  placeholder="e.g. White, Navy, Black"
                  helpText="The color/variant this mockup represents"
                  autoComplete="off"
                />
                <TextField
                  label="Variant ID (optional)"
                  value={selectedVariantId}
                  onChange={setSelectedVariantId}
                  placeholder="e.g. gid://shopify/ProductVariant/123456"
                  helpText="Shopify variant ID to link this image to. Leave blank for default."
                  autoComplete="off"
                />
              </FormLayout>

              <DropZone
                onDrop={handleDropZoneDrop}
                accept="image/*"
                type="image"
                allowMultiple={false}
              >
                {uploadingImage ? (
                  <Box padding="800">
                    <InlineStack align="center" gap="200">
                      <Spinner size="small" />
                      <Text as="span">Uploading and processing... This may take a few seconds.</Text>
                    </InlineStack>
                  </Box>
                ) : (
                  <DropZone.FileUpload
                    actionTitle="Upload mockup image"
                    actionHint="Accepts PNG, JPG. Use a blank product photo."
                  />
                )}
              </DropZone>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
