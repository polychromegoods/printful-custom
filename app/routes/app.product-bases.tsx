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
  RangeSlider,
  DropZone,
  LegacyStack,
  Spinner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useState, useCallback, useEffect } from "react";

// ─── Loader: fetch all product bases for this shop ───
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

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
  const formData = await request.formData();
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

    // ── Add variant image ──
    if (intent === "addImage") {
      const productBaseId = formData.get("productBaseId") as string;
      const shopifyVariantId = formData.get("shopifyVariantId") as string | null;
      const variantTitle = formData.get("variantTitle") as string | null;
      const imageUrl = formData.get("imageUrl") as string;

      const image = await db.productBaseImage.create({
        data: {
          productBaseId,
          shopifyVariantId: shopifyVariantId || null,
          variantTitle: variantTitle || "Default",
          imageUrl,
        },
      });

      return json({ success: true, image, message: "Image added." });
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

    // ── Upload image via Shopify Files API (staged upload) ──
    if (intent === "stagedUpload") {
      const filename = formData.get("filename") as string;
      const mimeType = formData.get("mimeType") as string;
      const fileSize = formData.get("fileSize") as string;

      // Create a staged upload target
      const response = await admin.graphql(
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
                filename,
                mimeType,
                resource: "FILE",
                fileSize,
                httpMethod: "POST",
              },
            ],
          },
        }
      );

      const responseJson = await response.json();
      const targets = responseJson.data?.stagedUploadsCreate?.stagedTargets;
      const errors = responseJson.data?.stagedUploadsCreate?.userErrors;

      if (errors && errors.length > 0) {
        return json({ success: false, error: errors[0].message });
      }

      return json({ success: true, stagedTarget: targets?.[0] });
    }

    // ── Create file from staged upload ──
    if (intent === "createFile") {
      const resourceUrl = formData.get("resourceUrl") as string;
      const filename = formData.get("filename") as string;

      const response = await admin.graphql(
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
                originalSource: resourceUrl,
                alt: filename,
                contentType: "IMAGE",
              },
            ],
          },
        }
      );

      const responseJson = await response.json();
      const files = responseJson.data?.fileCreate?.files;
      const errors = responseJson.data?.fileCreate?.userErrors;

      if (errors && errors.length > 0) {
        return json({ success: false, error: errors[0].message });
      }

      // The image URL might not be immediately available (processing)
      // Return the file ID so we can poll for the URL
      const fileId = files?.[0]?.id;
      const imageUrl = files?.[0]?.image?.url;

      return json({ success: true, fileId, imageUrl });
    }

    // ── Poll for file URL ──
    if (intent === "pollFile") {
      const fileId = formData.get("fileId") as string;

      const response = await admin.graphql(
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

      const responseJson = await response.json();
      const node = responseJson.data?.node;

      return json({
        success: true,
        fileStatus: node?.fileStatus,
        imageUrl: node?.image?.url,
      });
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
  const { productBases } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

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

  // Fetch products when create modal opens
  const handleOpenCreate = useCallback(() => {
    setShowCreateModal(true);
    const formData = new FormData();
    formData.set("intent", "fetchProducts");
    submit(formData, { method: "post" });
  }, [submit]);

  // Update products list from action data
  useEffect(() => {
    if (actionData && "products" in actionData && actionData.products) {
      setProducts(actionData.products as any[]);
    }
  }, [actionData]);

  // Handle product selection
  const handleSelectProduct = useCallback((product: any) => {
    setSelectedProduct(product);
    // Reset print area to defaults
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

  // Handle image file drop/upload
  const handleDropZoneDrop = useCallback(
    async (_dropFiles: File[], acceptedFiles: File[]) => {
      if (!selectedBase || acceptedFiles.length === 0) return;
      setUploadingImage(true);

      const file = acceptedFiles[0];

      try {
        // Step 1: Get staged upload URL
        const stagedFormData = new FormData();
        stagedFormData.set("intent", "stagedUpload");
        stagedFormData.set("filename", file.name);
        stagedFormData.set("mimeType", file.type);
        stagedFormData.set("fileSize", file.size.toString());

        const stagedResponse = await fetch("/app/product-bases", {
          method: "POST",
          body: stagedFormData,
        });
        const stagedResult = await stagedResponse.json();

        if (!stagedResult.success || !stagedResult.stagedTarget) {
          throw new Error(stagedResult.error || "Failed to create staged upload");
        }

        const target = stagedResult.stagedTarget;

        // Step 2: Upload file to staged URL
        const uploadFormData = new FormData();
        target.parameters.forEach((param: { name: string; value: string }) => {
          uploadFormData.append(param.name, param.value);
        });
        uploadFormData.append("file", file);

        await fetch(target.url, {
          method: "POST",
          body: uploadFormData,
        });

        // Step 3: Create file in Shopify
        const createFormData = new FormData();
        createFormData.set("intent", "createFile");
        createFormData.set("resourceUrl", target.resourceUrl);
        createFormData.set("filename", file.name);

        const createResponse = await fetch("/app/product-bases", {
          method: "POST",
          body: createFormData,
        });
        const createResult = await createResponse.json();

        if (!createResult.success) {
          throw new Error(createResult.error || "Failed to create file");
        }

        // Step 4: Poll for the file URL if not immediately available
        let imageUrl = createResult.imageUrl;
        const fileId = createResult.fileId;

        if (!imageUrl && fileId) {
          // Poll up to 10 times
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const pollFormData = new FormData();
            pollFormData.set("intent", "pollFile");
            pollFormData.set("fileId", fileId);

            const pollResponse = await fetch("/app/product-bases", {
              method: "POST",
              body: pollFormData,
            });
            const pollResult = await pollResponse.json();

            if (pollResult.imageUrl) {
              imageUrl = pollResult.imageUrl;
              break;
            }
            if (pollResult.fileStatus === "FAILED") {
              throw new Error("File processing failed");
            }
          }
        }

        if (!imageUrl) {
          throw new Error("Timed out waiting for image URL");
        }

        // Step 5: Save the image record
        const addFormData = new FormData();
        addFormData.set("intent", "addImage");
        addFormData.set("productBaseId", selectedBase.id);
        addFormData.set("shopifyVariantId", selectedVariantId);
        addFormData.set("variantTitle", selectedVariantTitle);
        addFormData.set("imageUrl", imageUrl);
        submit(addFormData, { method: "post" });
      } catch (error: any) {
        console.error("Upload error:", error);
        alert("Upload failed: " + error.message);
      } finally {
        setUploadingImage(false);
      }
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
                      <Text as="span">Uploading and processing...</Text>
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
