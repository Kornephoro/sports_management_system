import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function getDbClient(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

export async function getSessionTemplateByIdForUser(
  sessionTemplateId: string,
  userId: string,
) {
  return prisma.sessionTemplate.findFirst({
    where: {
      id: sessionTemplateId,
      block: {
        program: {
          user_id: userId,
        },
      },
    },
    select: {
      id: true,
      sport_type: true,
      block: {
        select: {
          program_id: true,
        },
      },
    },
  });
}

export async function getTrainingUnitTemplateByIdForUser(
  unitTemplateId: string,
  userId: string,
) {
  return prisma.trainingUnitTemplate.findFirst({
    where: {
      id: unitTemplateId,
      session_template: {
        block: {
          program: {
            user_id: userId,
          },
        },
      },
    },
  });
}

export async function getNextTrainingUnitTemplateSequenceNo(sessionTemplateId: string) {
  const latest = await prisma.trainingUnitTemplate.findFirst({
    where: {
      session_template_id: sessionTemplateId,
    },
    orderBy: {
      sequence_no: "desc",
    },
    select: {
      sequence_no: true,
    },
  });

  return (latest?.sequence_no ?? 0) + 1;
}

export async function listTrainingUnitTemplatesBySessionTemplate(
  sessionTemplateId: string,
  tx?: Prisma.TransactionClient,
) {
  return getDbClient(tx).trainingUnitTemplate.findMany({
    where: {
      session_template_id: sessionTemplateId,
    },
    orderBy: {
      sequence_no: "asc",
    },
    select: {
      id: true,
      sequence_no: true,
      name: true,
    },
  });
}

export async function listTrainingUnitTemplateRolesByIds(unitTemplateIds: string[]) {
  if (unitTemplateIds.length === 0) {
    return [];
  }

  return prisma.trainingUnitTemplate.findMany({
    where: {
      id: {
        in: unitTemplateIds,
      },
    },
    select: {
      id: true,
      unit_role: true,
    },
  });
}

export async function createTrainingUnitTemplate(
  data: Prisma.TrainingUnitTemplateUncheckedCreateInput,
  tx?: Prisma.TransactionClient,
) {
  return getDbClient(tx).trainingUnitTemplate.create({
    data,
  });
}

export async function updateTrainingUnitTemplateById(
  unitTemplateId: string,
  data: Prisma.TrainingUnitTemplateUncheckedUpdateInput,
) {
  return prisma.trainingUnitTemplate.update({
    where: {
      id: unitTemplateId,
    },
    data,
  });
}

export async function deleteTrainingUnitTemplateById(unitTemplateId: string) {
  return prisma.trainingUnitTemplate.delete({
    where: {
      id: unitTemplateId,
    },
  });
}

export async function deleteTrainingUnitTemplatesBySessionTemplateId(
  sessionTemplateId: string,
  tx?: Prisma.TransactionClient,
) {
  return getDbClient(tx).trainingUnitTemplate.deleteMany({
    where: {
      session_template_id: sessionTemplateId,
    },
  });
}

export async function countTrainingUnitTemplateReferences(unitTemplateId: string) {
  const [plannedUnitCount, unitExecutionCount] = await prisma.$transaction([
    prisma.plannedUnit.count({
      where: {
        unit_template_id: unitTemplateId,
      },
    }),
    prisma.unitExecution.count({
      where: {
        unit_template_id: unitTemplateId,
      },
    }),
  ]);

  return {
    plannedUnitCount,
    unitExecutionCount,
  };
}
