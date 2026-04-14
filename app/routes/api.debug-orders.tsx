import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const orders = await db.personalizationOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
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
      createdAt: o.createdAt,
    })),
  });
};
