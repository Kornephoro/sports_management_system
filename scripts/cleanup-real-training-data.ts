import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const REAL_PROGRAM_ID = "20000000-0000-0000-0000-000000000001";

function parseKeepIdsFromEnv() {
  const raw = process.env.KEEP_EXECUTION_IDS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isVerifyGeneratedExecution(
  unitExecutions: Array<{
    actual_payload: unknown;
    notes: string | null;
  }>,
) {
  return unitExecutions.some((unit) => {
    const payload = unit.actual_payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const note = (payload as Record<string, unknown>).note;
      if (typeof note === "string" && note.includes("minimal verify")) {
        return true;
      }
    }
    return typeof unit.notes === "string" && unit.notes.includes("round");
  });
}

async function cleanupOtherPrograms() {
  const otherPrograms = await prisma.program.findMany({
    where: {
      user_id: DEMO_USER_ID,
      id: {
        not: REAL_PROGRAM_ID,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (otherPrograms.length === 0) {
    return {
      deletedProgramCount: 0,
      deletedProgramNames: [],
    };
  }

  const otherProgramIds = otherPrograms.map((item) => item.id);

  await prisma.unitExecution.deleteMany({
    where: {
      session_execution: {
        program_id: {
          in: otherProgramIds,
        },
      },
    },
  });

  await prisma.sessionExecution.deleteMany({
    where: {
      program_id: {
        in: otherProgramIds,
      },
    },
  });

  await prisma.plannedUnit.deleteMany({
    where: {
      planned_session: {
        program_id: {
          in: otherProgramIds,
        },
      },
    },
  });

  await prisma.plannedSession.deleteMany({
    where: {
      program_id: {
        in: otherProgramIds,
      },
    },
  });

  await prisma.trainingUnitTemplate.deleteMany({
    where: {
      session_template: {
        block: {
          program_id: {
            in: otherProgramIds,
          },
        },
      },
    },
  });

  await prisma.sessionTemplate.deleteMany({
    where: {
      block: {
        program_id: {
          in: otherProgramIds,
        },
      },
    },
  });

  await prisma.block.deleteMany({
    where: {
      program_id: {
        in: otherProgramIds,
      },
    },
  });

  await prisma.progressTrack.deleteMany({
    where: {
      program_id: {
        in: otherProgramIds,
      },
    },
  });

  await prisma.program.deleteMany({
    where: {
      id: {
        in: otherProgramIds,
      },
    },
  });

  return {
    deletedProgramCount: otherPrograms.length,
    deletedProgramNames: otherPrograms.map((item) => item.name),
  };
}

async function cleanupTargetProgramExecutionsAndPlans() {
  const allExecutions = await prisma.sessionExecution.findMany({
    where: {
      user_id: DEMO_USER_ID,
      program_id: REAL_PROGRAM_ID,
    },
    include: {
      unit_executions: {
        select: {
          id: true,
          actual_payload: true,
          notes: true,
        },
      },
    },
    orderBy: {
      performed_at: "asc",
    },
  });

  const keepExecutionIdsFromEnv = parseKeepIdsFromEnv();
  const nonVerifyExecutions = allExecutions.filter(
    (execution) => !isVerifyGeneratedExecution(execution.unit_executions),
  );

  const keepExecutionIds =
    keepExecutionIdsFromEnv.length > 0
      ? keepExecutionIdsFromEnv
      : nonVerifyExecutions.map((execution) => execution.id);

  const deletedExecutionIds = allExecutions
    .filter((execution) => !keepExecutionIds.includes(execution.id))
    .map((execution) => execution.id);

  if (deletedExecutionIds.length > 0) {
    await prisma.unitExecution.deleteMany({
      where: {
        session_execution_id: {
          in: deletedExecutionIds,
        },
      },
    });
  }

  await prisma.sessionExecution.deleteMany({
    where: {
      user_id: DEMO_USER_ID,
      program_id: REAL_PROGRAM_ID,
      id: {
        notIn: keepExecutionIds,
      },
    },
  });

  const keptExecutions = await prisma.sessionExecution.findMany({
    where: {
      id: {
        in: keepExecutionIds,
      },
    },
    select: {
      planned_session_id: true,
    },
  });

  const keepPlannedSessionIdSet = new Set(
    keptExecutions
      .map((execution) => execution.planned_session_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const allPlannedSessions = await prisma.plannedSession.findMany({
    where: {
      user_id: DEMO_USER_ID,
      program_id: REAL_PROGRAM_ID,
    },
    select: {
      id: true,
    },
  });

  const deletePlannedSessionIds = allPlannedSessions
    .map((item) => item.id)
    .filter((id) => !keepPlannedSessionIdSet.has(id));

  if (deletePlannedSessionIds.length > 0) {
    await prisma.plannedUnit.deleteMany({
      where: {
        planned_session_id: {
          in: deletePlannedSessionIds,
        },
      },
    });

    await prisma.plannedSession.deleteMany({
      where: {
        id: {
          in: deletePlannedSessionIds,
        },
      },
    });
  }

  return {
    allExecutionCount: allExecutions.length,
    keptExecutionCount: keepExecutionIds.length,
    keptExecutionIds: keepExecutionIds.sort(),
    deletedExecutionCount: deletedExecutionIds.length,
    keptPlannedSessionCount: keepPlannedSessionIdSet.size,
    deletedPlannedSessionCount: deletePlannedSessionIds.length,
  };
}

async function main() {
  const cleanupProgramsResult = await cleanupOtherPrograms();
  const cleanupTargetResult = await cleanupTargetProgramExecutionsAndPlans();

  console.log(
    JSON.stringify(
      {
        runner: "db:cleanup:real-training",
        userId: DEMO_USER_ID,
        programId: REAL_PROGRAM_ID,
        deletedOtherPrograms: cleanupProgramsResult.deletedProgramCount,
        deletedOtherProgramNames: cleanupProgramsResult.deletedProgramNames,
        ...cleanupTargetResult,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    if (error instanceof Error && error.message.includes("Can't reach database server")) {
      console.error("清理失败：当前数据库不可达，请先确认网络/TLS/数据库连接后重试。");
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
