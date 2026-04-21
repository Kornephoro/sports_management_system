import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { SessionExecutionSetCreateSeed } from "@/server/repositories/session-execution-sets/session-execution-set.repository";

const SESSION_EXECUTION_SUMMARY_SELECT = {
  id: true,
  planned_session_id: true,
  completion_status: true,
  performed_at: true,
  actual_duration_min: true,
  notes: true,
  created_at: true,
  _count: {
    select: {
      unit_executions: true,
    },
  },
} as const;

export async function createSessionExecution(data: Prisma.SessionExecutionUncheckedCreateInput) {
  return prisma.sessionExecution.create({
    data,
  });
}

export async function createSessionExecutionWithSets(
  data: Prisma.SessionExecutionUncheckedCreateInput,
  setSeeds: Omit<SessionExecutionSetCreateSeed, "session_execution_id">[],
) {
  return prisma.$transaction(
    async (tx) => {
      const sessionExecution = await tx.sessionExecution.create({
        data,
      });

      if (setSeeds.length > 0) {
        await tx.sessionExecutionSet.createMany({
          data: setSeeds.map((seed) => ({
            session_execution_id: sessionExecution.id,
            planned_unit_id: seed.planned_unit_id ?? null,
            set_index: seed.set_index,
            planned_set_type: seed.planned_set_type ?? null,
            planned_reps: seed.planned_reps ?? null,
            planned_weight: seed.planned_weight ?? null,
            planned_rpe: seed.planned_rpe ?? null,
            planned_rest_seconds: seed.planned_rest_seconds ?? null,
            planned_tempo: seed.planned_tempo ?? null,
            actual_reps: seed.actual_reps ?? null,
            actual_weight: seed.actual_weight ?? null,
            actual_rpe: seed.actual_rpe ?? null,
            actual_rest_seconds: seed.actual_rest_seconds ?? null,
            actual_tempo: seed.actual_tempo ?? null,
            status: seed.status,
            is_extra_set: seed.is_extra_set ?? false,
            note: seed.note ?? null,
          })),
        });
      }

      return sessionExecution;
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}

export async function getSessionExecutionByIdForUser(sessionExecutionId: string, userId: string) {
  return prisma.sessionExecution.findFirst({
    where: {
      id: sessionExecutionId,
      user_id: userId,
    },
  });
}

export async function getSessionExecutionDeleteContext(
  sessionExecutionId: string,
  userId: string,
) {
  return prisma.sessionExecution.findFirst({
    where: {
      id: sessionExecutionId,
      user_id: userId,
    },
    select: {
      id: true,
      user_id: true,
      planned_session_id: true,
      performed_at: true,
      completion_status: true,
      unit_executions: {
        select: {
          id: true,
          planned_unit_id: true,
        },
      },
    },
  });
}

export async function deleteSessionExecutionCascade(
  sessionExecutionId: string,
  userId: string,
) {
  const [deletedExecutionSets, deletedUnitExecutions, deletedSessionExecutions] = await prisma.$transaction([
    prisma.sessionExecutionSet.deleteMany({
      where: {
        session_execution_id: sessionExecutionId,
        session_execution: {
          is: {
            user_id: userId,
          },
        },
      },
    }),
    prisma.unitExecution.deleteMany({
      where: {
        session_execution_id: sessionExecutionId,
        session_execution: {
          is: {
            user_id: userId,
          },
        },
      },
    }),
    prisma.sessionExecution.deleteMany({
      where: {
        id: sessionExecutionId,
        user_id: userId,
      },
    }),
  ]);

  return {
    deletedExecutionSetCount: deletedExecutionSets.count,
    deletedUnitExecutionCount: deletedUnitExecutions.count,
    deletedSessionExecutionCount: deletedSessionExecutions.count,
  };
}

export async function getLatestSessionExecutionByPlannedSessionForUser(
  plannedSessionId: string,
  userId: string,
) {
  return prisma.sessionExecution.findFirst({
    where: {
      planned_session_id: plannedSessionId,
      user_id: userId,
    },
    orderBy: [{ performed_at: "desc" }, { created_at: "desc" }],
    select: SESSION_EXECUTION_SUMMARY_SELECT,
  });
}

export async function getActiveSessionExecutionByPlannedSessionForUser(
  plannedSessionId: string,
  userId: string,
) {
  return prisma.sessionExecution.findFirst({
    where: {
      planned_session_id: plannedSessionId,
      user_id: userId,
      completion_status: "partial",
      unit_executions: {
        none: {},
      },
    },
    orderBy: [{ performed_at: "desc" }, { created_at: "desc" }],
    select: SESSION_EXECUTION_SUMMARY_SELECT,
  });
}

export async function countSessionExecutionsByPlannedSessionForUser(
  plannedSessionId: string,
  userId: string,
) {
  return prisma.sessionExecution.count({
    where: {
      planned_session_id: plannedSessionId,
      user_id: userId,
    },
  });
}

export async function updateSessionExecutionById(
  sessionExecutionId: string,
  data: Prisma.SessionExecutionUncheckedUpdateInput,
) {
  return prisma.sessionExecution.update({
    where: {
      id: sessionExecutionId,
    },
    data,
  });
}

export type ExecutionListView = "summary" | "full";

type RecentSessionExecutionSummary = Prisma.SessionExecutionGetPayload<{
  include: {
    program: {
      select: {
        id: true;
        name: true;
      };
    };
    planned_session: {
      select: {
        id: true;
        sequence_index: true;
        session_date: true;
        status: true;
        objective_summary: true;
        session_template: {
          select: {
            id: true;
            name: true;
          };
        };
        planned_units: {
          orderBy: {
            sequence_no: "asc";
          };
          take: 3;
          select: {
            selected_exercise_name: true;
          };
        };
      };
    };
  };
}> & {
  unit_executions: [];
};

type RecentSessionExecutionFull = Prisma.SessionExecutionGetPayload<{
  include: {
    program: {
      select: {
        id: true;
        name: true;
      };
    };
    planned_session: {
      select: {
        id: true;
        sequence_index: true;
        session_date: true;
        status: true;
      };
    };
    unit_executions: {
      orderBy: {
        sequence_no: "asc";
      };
      select: {
        id: true;
        sequence_no: true;
        completion_status: true;
        actual_unit_name: true;
        actual_payload: true;
        result_flags: true;
        notes: true;
        perceived_exertion: true;
        pain_score: true;
        planned_unit: {
          select: {
            id: true;
            sequence_no: true;
            selected_exercise_name: true;
            target_payload: true;
            progression_snapshot: true;
          };
        };
      };
    };
  };
}>;

export async function listRecentSessionExecutionsByUser(
  userId: string,
  limit: number,
  view: "summary",
): Promise<RecentSessionExecutionSummary[]>;
export async function listRecentSessionExecutionsByUser(
  userId: string,
  limit: number,
  view: "full",
): Promise<RecentSessionExecutionFull[]>;
export async function listRecentSessionExecutionsByUser(
  userId: string,
  limit: number,
  view?: ExecutionListView,
): Promise<RecentSessionExecutionSummary[] | RecentSessionExecutionFull[]>;

export async function listRecentSessionExecutionsByUser(
  userId: string,
  limit: number,
  view: ExecutionListView = "summary",
) {
  if (view === "summary") {
    const executions = await prisma.sessionExecution.findMany({
      where: {
        user_id: userId,
      },
      orderBy: [{ performed_at: "desc" }, { created_at: "desc" }],
      take: limit,
      include: {
        program: {
          select: {
            id: true,
            name: true,
          },
        },
        planned_session: {
          select: {
            id: true,
            sequence_index: true,
            session_date: true,
            status: true,
            objective_summary: true,
            session_template: {
              select: {
                id: true,
                name: true,
              },
            },
            planned_units: {
              orderBy: {
                sequence_no: "asc",
              },
              take: 3,
              select: {
                selected_exercise_name: true,
              },
            },
          },
        },
      },
    });

    return executions.map((execution) => ({
      ...execution,
      unit_executions: [],
    })) as RecentSessionExecutionSummary[];
  }

  return prisma.sessionExecution.findMany({
    where: {
      user_id: userId,
    },
    orderBy: [{ performed_at: "desc" }, { created_at: "desc" }],
    take: limit,
    include: {
      program: {
        select: {
          id: true,
          name: true,
        },
      },
      planned_session: {
        select: {
          id: true,
          sequence_index: true,
          session_date: true,
          status: true,
        },
      },
      unit_executions: {
        orderBy: {
          sequence_no: "asc",
        },
        select: {
          id: true,
          sequence_no: true,
          completion_status: true,
          actual_unit_name: true,
          actual_payload: true,
          result_flags: true,
          notes: true,
          perceived_exertion: true,
          pain_score: true,
          planned_unit: {
            select: {
              id: true,
              sequence_no: true,
              selected_exercise_name: true,
              target_payload: true,
              progression_snapshot: true,
            },
          },
        },
      },
    },
  }) as Promise<RecentSessionExecutionFull[]>;
}
