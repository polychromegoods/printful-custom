import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Badge,
  IndexTable,
  EmptyState,
  InlineStack,
  Box,
  Tooltip,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useEffect } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const orders = await db.personalizationOrder.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    completed: orders.filter((o) => o.status === "completed").length,
    failed: orders.filter((o) => o.status === "failed").length,
    processing: orders.filter((o) =>
      ["generating", "uploading", "submitting"].includes(o.status)
    ).length,
  };

  return json({ orders, stats });
};

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge tone="attention">Pending</Badge>;
    case "generating":
      return <Badge tone="info">Generating</Badge>;
    case "uploading":
      return <Badge tone="info">Uploading</Badge>;
    case "submitting":
      return <Badge tone="info">Submitting</Badge>;
    case "completed":
      return <Badge tone="success">Completed</Badge>;
    case "failed":
      return <Badge tone="critical">Failed</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function threadColorSwatch(color: string) {
  return (
    <Tooltip content={color}>
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          backgroundColor: color,
          border: "1px solid #ccc",
          display: "inline-block",
        }}
      />
    </Tooltip>
  );
}

export default function Index() {
  const { orders, stats } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  // Auto-refresh every 10 seconds if there are processing orders
  useEffect(() => {
    if (stats.processing > 0 || stats.pending > 0) {
      const interval = setInterval(() => {
        revalidator.revalidate();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [stats.processing, stats.pending, revalidator]);

  const resourceName = {
    singular: "personalization order",
    plural: "personalization orders",
  };

  const rowMarkup = orders.map((order, index) => (
    <IndexTable.Row id={order.id} key={order.id} position={index}>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {order.shopifyOrderName}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">
          {order.monogramText}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">
          {order.monogramStyle}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          {threadColorSwatch(order.threadColor || "#000000")}
          <Text variant="bodyMd" as="span">
            {order.threadColor}
          </Text>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>{statusBadge(order.status)}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">
          {order.printfulOrderId
            ? `#${order.printfulOrderId}`
            : "-"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">
          {order.errorMessage || "-"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" as="span">
          {new Date(order.createdAt).toLocaleString()}
        </Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page>
      <TitleBar title="Printful Custom - Personalization Orders" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <InlineStack gap="400" wrap>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Total Orders
                  </Text>
                  <Text as="p" variant="headingLg">
                    {stats.total}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Completed
                  </Text>
                  <Text as="p" variant="headingLg" tone="success">
                    {stats.completed}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Processing
                  </Text>
                  <Text as="p" variant="headingLg">
                    {stats.processing + stats.pending}
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Failed
                  </Text>
                  <Text as="p" variant="headingLg" tone="critical">
                    {stats.failed}
                  </Text>
                </BlockStack>
              </Card>
            </InlineStack>
          </Layout.Section>

          <Layout.Section>
            <Card>
              {orders.length === 0 ? (
                <EmptyState
                  heading="No personalization orders yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    When customers place orders with monogram personalization,
                    they will appear here. The app will automatically generate
                    print files and submit them to Printful.
                  </p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={resourceName}
                  itemCount={orders.length}
                  headings={[
                    { title: "Order" },
                    { title: "Monogram" },
                    { title: "Style" },
                    { title: "Thread Color" },
                    { title: "Status" },
                    { title: "Printful Order" },
                    { title: "Error" },
                    { title: "Created" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
