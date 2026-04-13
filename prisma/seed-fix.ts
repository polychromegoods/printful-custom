import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Fix the existing template's product ID
  const templates = await prisma.productTemplate.findMany();
  console.log("Existing templates:", templates.map(t => ({
    id: t.id,
    shopifyProductId: t.shopifyProductId,
    productTitle: t.productTitle,
    productBaseSlug: t.productBaseSlug,
    technique: t.technique,
    placementKey: t.placementKey,
  })));

  // The correct product ID for "Hat 2" is 15082822238572
  const correctGid = "gid://shopify/Product/15082822238572";
  const hatMockupUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663309529079/suekXLlGwXziLNdx.png";

  for (const template of templates) {
    if (template.productBaseSlug === "yupoong-6245cm") {
      // Update the product ID
      await prisma.productTemplate.update({
        where: { id: template.id },
        data: {
          shopifyProductId: correctGid,
          productTitle: "Hat 2",
        },
      });
      console.log(`Updated template ${template.id} with correct product ID: ${correctGid}`);

      // Check if mockup already exists
      const existingMockup = await prisma.mockupImage.findFirst({
        where: { templateId: template.id },
      });

      if (!existingMockup) {
        // Add the white hat mockup image
        await prisma.mockupImage.create({
          data: {
            templateId: template.id,
            variantColor: "White",
            imageUrl: hatMockupUrl,
            isDefault: true,
            sortOrder: 0,
          },
        });
        console.log("Added white hat mockup image");
      } else {
        console.log("Mockup already exists, updating URL");
        await prisma.mockupImage.update({
          where: { id: existingMockup.id },
          data: { imageUrl: hatMockupUrl },
        });
      }
    }
  }

  // Verify layers
  const layers = await prisma.templateLayer.findMany();
  console.log("Existing layers:", layers.map(l => ({
    id: l.id,
    templateId: l.templateId,
    layerType: l.layerType,
    label: l.label,
    customerEditable: l.customerEditable,
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
