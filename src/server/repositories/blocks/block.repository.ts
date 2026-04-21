import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

function getDbClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}

export async function createBlock(
  data: Prisma.BlockUncheckedCreateInput,
  tx?: Prisma.TransactionClient,
) {
  return getDbClient(tx).block.create({
    data,
  });
}
