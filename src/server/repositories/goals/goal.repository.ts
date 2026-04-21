import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

function getDbClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}

export async function createGoal(
  data: Prisma.GoalUncheckedCreateInput,
  tx?: Prisma.TransactionClient,
) {
  return getDbClient(tx).goal.create({
    data,
  });
}
