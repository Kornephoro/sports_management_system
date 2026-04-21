import { PrismaClient, SessionState } from "@prisma/client";

import { buildQueueReschedulePlan } from "../../src/server/services/sessions/planned-session-queue-reschedule.service";
import { normalizeDateOnlyUtc } from "../../src/server/use-cases/shared/date-only";

const prisma = new PrismaClient();

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

function getDateOnlyUtc(dateText: string) {
  return normalizeDateOnlyUtc(new Date(`${dateText}T00:00:00.000Z`));
}

function unresolvedWhere() {
  return {
    NOT: {
      session_executions: {
        some: {
          unit_executions: {
            some: {},
          },
        },
      },
    },
  } as const;
}

async function resolveTargetProgramId(userId: string) {
  const today = getDateOnlyUtc("2026-04-08");
  const statuses: SessionState[] = ["planned", "ready", "partial"];

  const overdue = await prisma.plannedSession.findFirst({
    where: {
      user_id: userId,
      status: { in: statuses },
      session_date: { lt: today },
      ...unresolvedWhere(),
    },
    orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
    select: {
      program_id: true,
    },
  });

  if (overdue) {
    return overdue.program_id;
  }

  const next = await prisma.plannedSession.findFirst({
    where: {
      user_id: userId,
      status: { in: statuses },
      session_date: { gte: today },
      ...unresolvedWhere(),
    },
    orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
    select: {
      program_id: true,
    },
  });

  if (next) {
    return next.program_id;
  }

  const recent = await prisma.plannedSession.findFirst({
    where: {
      user_id: userId,
    },
    orderBy: [{ updated_at: "desc" }],
    select: {
      program_id: true,
    },
  });

  if (!recent) {
    throw new Error("未找到可恢复的训练计划。");
  }

  return recent.program_id;
}

async function main() {
  const userId = process.env.DEMO_USER_ID ?? DEMO_USER_ID;
  const programId = await resolveTargetProgramId(userId);

  const targets = await prisma.plannedSession.findMany({
    where: {
      user_id: userId,
      program_id: programId,
      sequence_index: {
        in: [1, 2, 3],
      },
    },
    orderBy: [{ sequence_index: "asc" }],
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
    },
  });

  if (targets.length < 3) {
    throw new Error("恢复失败：当前计划缺少 #1/#2/#3。");
  }

  const targetBySequence = new Map(targets.map((item) => [item.sequence_index, item]));
  const session1 = targetBySequence.get(1);
  const session2 = targetBySequence.get(2);
  const session3 = targetBySequence.get(3);

  if (!session1 || !session2 || !session3) {
    throw new Error("恢复失败：未找到完整的 #1/#2/#3。");
  }

  const targetIds = [session1.id, session2.id, session3.id];
  const sessionExecutions = await prisma.sessionExecution.findMany({
    where: {
      planned_session_id: {
        in: targetIds,
      },
    },
    select: {
      id: true,
    },
  });
  const sessionExecutionIds = sessionExecutions.map((item) => item.id);

  const unitExecutions = sessionExecutionIds.length
    ? await prisma.unitExecution.findMany({
        where: {
          session_execution_id: {
            in: sessionExecutionIds,
          },
        },
        select: {
          id: true,
        },
      })
    : [];
  const unitExecutionIds = unitExecutions.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    if (sessionExecutionIds.length > 0) {
      await tx.observation.updateMany({
        where: {
          linked_session_execution_id: {
            in: sessionExecutionIds,
          },
        },
        data: {
          linked_session_execution_id: null,
        },
      });

      await tx.injuryIncident.updateMany({
        where: {
          linked_session_execution_id: {
            in: sessionExecutionIds,
          },
        },
        data: {
          linked_session_execution_id: null,
        },
      });
    }

    if (unitExecutionIds.length > 0) {
      await tx.injuryIncident.updateMany({
        where: {
          linked_unit_execution_id: {
            in: unitExecutionIds,
          },
        },
        data: {
          linked_unit_execution_id: null,
        },
      });

      await tx.unitExecution.deleteMany({
        where: {
          id: {
            in: unitExecutionIds,
          },
        },
      });
    }

    if (sessionExecutionIds.length > 0) {
      await tx.sessionExecution.deleteMany({
        where: {
          id: {
            in: sessionExecutionIds,
          },
        },
      });
    }

    await Promise.all([
      tx.plannedSession.update({
        where: { id: session1.id },
        data: { session_date: getDateOnlyUtc("2026-04-05"), status: "ready" },
      }),
      tx.plannedSession.update({
        where: { id: session2.id },
        data: { session_date: getDateOnlyUtc("2026-04-06"), status: "ready" },
      }),
      tx.plannedSession.update({
        where: { id: session3.id },
        data: { session_date: getDateOnlyUtc("2026-04-07"), status: "ready" },
      }),
      tx.plannedUnit.updateMany({
        where: {
          planned_session_id: {
            in: targetIds,
          },
        },
        data: {
          status: "planned",
        },
      }),
    ]);

    const queueSessions = await tx.plannedSession.findMany({
      where: {
        user_id: userId,
        program_id: programId,
        sequence_index: {
          gte: 4,
        },
        status: {
          in: ["planned", "ready", "partial"],
        },
        ...unresolvedWhere(),
      },
      orderBy: [{ sequence_index: "asc" }],
      select: {
        id: true,
        sequence_index: true,
        session_date: true,
        session_template: {
          select: {
            scheduling_policy_type: true,
            preferred_weekday: true,
          },
        },
      },
    });

    if (queueSessions.length > 0) {
      const excludedIds = queueSessions.map((item) => item.id);
      const occupancy = await tx.plannedSession.findMany({
        where: {
          user_id: userId,
          program_id: programId,
          id: {
            notIn: excludedIds,
          },
        },
        select: {
          session_date: true,
        },
      });

      const reflow = buildQueueReschedulePlan({
        queueSessions,
        targetDate: getDateOnlyUtc("2026-04-08"),
        occupiedDates: occupancy.map((item) => item.session_date),
        previousSessionDate: getDateOnlyUtc("2026-04-07"),
      });

      for (const item of reflow) {
        await tx.plannedSession.update({
          where: {
            id: item.id,
          },
          data: {
            session_date: item.to_date,
          },
        });
      }
    }
  });

  const refreshed = await prisma.plannedSession.findMany({
    where: {
      user_id: userId,
      program_id: programId,
      sequence_index: {
        in: [1, 2, 3],
      },
    },
    orderBy: [{ sequence_index: "asc" }],
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
      status: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        message: "已恢复 #1/#2/#3 为逾期测试链路。",
        userId,
        programId,
        restored: refreshed.map((item) => ({
          id: item.id,
          sequenceIndex: item.sequence_index,
          sessionDate: item.session_date.toISOString().slice(0, 10),
          status: item.status,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

