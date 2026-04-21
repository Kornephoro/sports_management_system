import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

function getDbClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}

export async function listSessionTemplatesWithUnitsByBlock(blockId: string) {
  return prisma.sessionTemplate.findMany({
    where: {
      block_id: blockId,
      enabled: true,
    },
    orderBy: {
      sequence_in_microcycle: "asc",
    },
    include: {
      training_unit_templates: {
        orderBy: {
          sequence_no: "asc",
        },
      },
    },
  });
}

export async function createSessionTemplate(
  data: Prisma.SessionTemplateUncheckedCreateInput,
  tx?: Prisma.TransactionClient,
) {
  return getDbClient(tx).sessionTemplate.create({
    data,
  });
}
