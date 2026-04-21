import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient | typeof prisma;

function getDbClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}

export async function createProgram(
  data: Prisma.ProgramUncheckedCreateInput,
  tx?: Prisma.TransactionClient,
) {
  return getDbClient(tx).program.create({
    data,
  });
}

export async function listProgramsByUser(userId: string) {
  return prisma.program.findMany({
    where: {
      user_id: userId,
    },
    orderBy: [{ created_at: "desc" }],
    select: {
      id: true,
      name: true,
      sport_type: true,
      status: true,
      start_date: true,
      end_date: true,
      weekly_frequency_target: true,
      created_at: true,
      blocks: {
        select: {
          id: true,
          session_templates: {
            select: {
              id: true,
              enabled: true,
              training_unit_templates: {
                select: {
                  id: true,
                  is_key_unit: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function getProgramDetailWithStructure(programId: string, userId: string) {
  return prisma.program.findFirst({
    where: {
      id: programId,
      user_id: userId,
    },
    include: {
      goal: true,
      blocks: {
        orderBy: {
          sequence_no: "asc",
        },
        include: {
          session_templates: {
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
          },
        },
      },
    },
  });
}

export async function getProgramById(programId: string, userId: string) {
  return prisma.program.findFirst({
    where: {
      id: programId,
      user_id: userId,
    },
  });
}
