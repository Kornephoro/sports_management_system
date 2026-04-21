import { prisma } from "@/lib/prisma";
import { Prisma, SchedulingPolicyType, SessionState, UnitState } from "@prisma/client";

type PlannedUnitSeed = {
  unit_template_id?: string;
  sequence_no: number;
  selected_exercise_name?: string;
  selected_variant_tags?: Prisma.InputJsonValue;
  progress_track_id?: string;
  target_payload: Prisma.InputJsonValue;
  progression_snapshot?: Prisma.InputJsonValue;
  constraint_snapshot?: Prisma.InputJsonValue;
  required: boolean;
  notes?: string;
};

type PlannedSessionSeed = {
  program_id: string;
  user_id: string;
  block_id?: string;
  session_template_id?: string;
  sequence_index: number;
  session_date: Date;
  generation_reason: "initial_generation" | "rescheduled" | "manual_add" | "adapted";
  planned_start_at?: Date;
  planned_duration_min?: number;
  objective_summary?: string;
  adaptation_snapshot?: Prisma.InputJsonValue;
  notes?: string;
  planned_units: PlannedUnitSeed[];
};

export type UnresolvedQueueSessionItem = {
  id: string;
  sequence_index: number;
  session_date: Date;
  status: SessionState;
  session_template: {
    id: string;
    scheduling_policy_type: SchedulingPolicyType;
    preferred_weekday: number | null;
  } | null;
};

function unresolvedByCheckoffWhere(): Prisma.PlannedSessionWhereInput {
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
  };
}

export async function getProgramMaxPlannedSequenceIndex(programId: string) {
  const last = await prisma.plannedSession.findFirst({
    where: {
      program_id: programId,
    },
    orderBy: {
      sequence_index: "desc",
    },
    select: {
      sequence_index: true,
    },
  });

  return last?.sequence_index ?? 0;
}

export async function getProgramFirstPlannedSessionByUser(programId: string, userId: string) {
  return prisma.plannedSession.findFirst({
    where: {
      program_id: programId,
      user_id: userId,
    },
    orderBy: [{ sequence_index: "asc" }, { session_date: "asc" }],
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
    },
  });
}

export async function deleteFutureUnexecutedPlannedSessions(
  programId: string,
  userId: string,
  startDate: Date,
) {
  const deletableSessions = await prisma.plannedSession.findMany({
    where: {
      program_id: programId,
      user_id: userId,
      session_date: {
        gte: startDate,
      },
      session_executions: {
        none: {},
      },
    },
    select: {
      id: true,
    },
  });

  if (deletableSessions.length === 0) {
    return {
      deletedSessionCount: 0,
      deletedPlannedUnitCount: 0,
    };
  }

  const sessionIds = deletableSessions.map((session) => session.id);

  const [deletedPlannedUnits, deletedSessions] = await prisma.$transaction([
    prisma.plannedUnit.deleteMany({
      where: {
        planned_session_id: {
          in: sessionIds,
        },
      },
    }),
    prisma.plannedSession.deleteMany({
      where: {
        id: {
          in: sessionIds,
        },
      },
    }),
  ]);

  return {
    deletedSessionCount: deletedSessions.count,
    deletedPlannedUnitCount: deletedPlannedUnits.count,
  };
}

export async function createPlannedSessionsWithUnits(seeds: PlannedSessionSeed[]) {
  return prisma.$transaction(
    seeds.map((seed) =>
      prisma.plannedSession.create({
        data: {
          program_id: seed.program_id,
          user_id: seed.user_id,
          block_id: seed.block_id,
          session_template_id: seed.session_template_id,
          sequence_index: seed.sequence_index,
          session_date: seed.session_date,
          status: "planned",
          generation_reason: seed.generation_reason,
          planned_start_at: seed.planned_start_at,
          planned_duration_min: seed.planned_duration_min,
          objective_summary: seed.objective_summary,
          adaptation_snapshot: seed.adaptation_snapshot,
          notes: seed.notes,
          planned_units: {
            create: seed.planned_units.map((unit) => ({
              unit_template_id: unit.unit_template_id,
              sequence_no: unit.sequence_no,
              status: "planned",
              selected_exercise_name: unit.selected_exercise_name,
              selected_variant_tags: unit.selected_variant_tags,
              progress_track_id: unit.progress_track_id,
              target_payload: unit.target_payload,
              progression_snapshot: unit.progression_snapshot,
              constraint_snapshot: unit.constraint_snapshot,
              required: unit.required,
              notes: unit.notes,
            })),
          },
        },
        include: {
          planned_units: {
            orderBy: {
              sequence_no: "asc",
            },
          },
        },
      }),
    ),
  );
}

export async function listPlannedSessionsByProgram(
  programId: string,
  userId: string,
  dateFrom?: Date,
  dateTo?: Date,
) {
  return prisma.plannedSession.findMany({
    where: {
      program_id: programId,
      user_id: userId,
      ...(dateFrom || dateTo
        ? {
            session_date: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
      status: true,
      planned_duration_min: true,
      objective_summary: true,
      planned_units: {
        orderBy: {
          sequence_no: "asc",
        },
        select: {
          id: true,
          sequence_no: true,
          status: true,
          selected_exercise_name: true,
          target_payload: true,
          required: true,
        },
      },
      _count: {
        select: {
          session_executions: true,
        },
      },
    },
  });
}

export async function getNextOrRecentPlannedSessionByUser(userId: string, today: Date) {
  const selectableStatuses: SessionState[] = ["planned", "ready", "partial"];
  const unresolvedWhere = unresolvedByCheckoffWhere();

  const next = await prisma.plannedSession.findFirst({
    where: {
      user_id: userId,
      status: {
        in: selectableStatuses,
      },
      session_date: {
        gte: today,
      },
      ...unresolvedWhere,
    },
    orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
    select: {
      id: true,
      program_id: true,
      sequence_index: true,
      session_date: true,
      status: true,
      program: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (next) {
    return {
      mode: "next" as const,
      plannedSession: {
        id: next.id,
        program_id: next.program_id,
        sequence_index: next.sequence_index,
        session_date: next.session_date,
        status: next.status,
      },
      program: next.program,
    };
  }

  const hasOverdueUnresolved = await prisma.plannedSession.findFirst({
    where: {
      user_id: userId,
      status: {
        in: selectableStatuses,
      },
      session_date: {
        lt: today,
      },
      ...unresolvedWhere,
    },
    select: {
      id: true,
    },
  });

  if (hasOverdueUnresolved) {
    return null;
  }

  const recent = await prisma.plannedSession.findFirst({
    where: {
      user_id: userId,
      OR: [
        {
          status: {
            in: ["completed", "skipped"],
          },
        },
        {
          session_executions: {
            some: {
              unit_executions: {
                some: {},
              },
            },
          },
        },
      ],
    },
    orderBy: [{ session_date: "desc" }, { sequence_index: "desc" }],
    select: {
      id: true,
      program_id: true,
      sequence_index: true,
      session_date: true,
      status: true,
      program: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!recent) {
    return null;
  }

  return {
    mode: "recent" as const,
    plannedSession: {
      id: recent.id,
      program_id: recent.program_id,
      sequence_index: recent.sequence_index,
      session_date: recent.session_date,
      status: recent.status,
    },
    program: recent.program,
  };
}

export async function listUpcomingPlannedSessionsByUser(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  limit: number,
) {
  const selectableStatuses: SessionState[] = ["planned", "ready", "partial"];

  return prisma.plannedSession.findMany({
    where: {
      user_id: userId,
      status: {
        in: selectableStatuses,
      },
      session_date: {
        gte: dateFrom,
        lte: dateTo,
      },
    },
    orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
    take: limit,
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
      program: {
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
  });
}

export async function countUpcomingPlannedSessionsByUser(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
) {
  const selectableStatuses: SessionState[] = ["planned", "ready", "partial"];

  return prisma.plannedSession.count({
    where: {
      user_id: userId,
      status: {
        in: selectableStatuses,
      },
      session_date: {
        gte: dateFrom,
        lte: dateTo,
      },
    },
  });
}

type ProgressionMatrixSessionSelect = Prisma.PlannedSessionGetPayload<{
  select: {
    id: true;
    session_template_id: true;
    sequence_index: true;
    session_date: true;
    status: true;
    planned_units: {
      orderBy: {
        sequence_no: "asc";
      };
      select: {
        id: true;
        sequence_no: true;
        progress_track_id: true;
        selected_exercise_name: true;
        progression_snapshot: true;
        target_payload: true;
        unit_template: {
          select: {
            movement_pattern_tags: true;
            muscle_tags: true;
          };
        };
      };
    };
    session_executions: {
      orderBy: [{ performed_at: "desc" }, { created_at: "desc" }];
      take: 1;
      select: {
        id: true;
        completion_status: true;
        performed_at: true;
        execution_sets: {
          select: {
            id: true;
            planned_unit_id: true;
            set_index: true;
            planned_set_type: true;
            planned_reps: true;
            planned_weight: true;
            planned_rpe: true;
            planned_rest_seconds: true;
            planned_tempo: true;
            actual_reps: true;
            actual_weight: true;
            actual_rpe: true;
            actual_rest_seconds: true;
            actual_tempo: true;
            status: true;
            is_extra_set: true;
          };
          orderBy: [{ set_index: "asc" }, { created_at: "asc" }];
        };
      };
    };
    program: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}>;

const PROGRESSION_MATRIX_SESSION_SELECT = {
  id: true,
  session_template_id: true,
  sequence_index: true,
  session_date: true,
  status: true,
  planned_units: {
    orderBy: {
      sequence_no: "asc",
    },
    select: {
      id: true,
      sequence_no: true,
      progress_track_id: true,
      selected_exercise_name: true,
      progression_snapshot: true,
      target_payload: true,
      unit_template: {
        select: {
          movement_pattern_tags: true,
          muscle_tags: true,
        },
      },
    },
  },
  session_executions: {
    orderBy: [{ performed_at: "desc" }, { created_at: "desc" }],
    take: 1,
    select: {
      id: true,
      completion_status: true,
      performed_at: true,
      execution_sets: {
        select: {
          id: true,
          planned_unit_id: true,
          set_index: true,
          planned_set_type: true,
          planned_reps: true,
          planned_weight: true,
          planned_rpe: true,
          planned_rest_seconds: true,
          planned_tempo: true,
          actual_reps: true,
          actual_weight: true,
          actual_rpe: true,
          actual_rest_seconds: true,
          actual_tempo: true,
          status: true,
          is_extra_set: true,
        },
        orderBy: [{ set_index: "asc" }, { created_at: "asc" }],
      },
    },
  },
  program: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.PlannedSessionSelect;

export async function listProgressionMatrixSessionsByUser(args: {
  userId: string;
  dateFrom: Date;
  dateTo: Date;
  window: number;
  includeRecent: boolean;
  recentCount: number;
}) {
  const futureStatuses: SessionState[] = ["planned", "ready", "partial"];

  if (!args.includeRecent) {
    return prisma.plannedSession.findMany({
      where: {
        user_id: args.userId,
        status: {
          in: futureStatuses,
        },
        session_date: {
          gte: args.dateFrom,
          lte: args.dateTo,
        },
      },
      orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
      take: args.window,
      select: PROGRESSION_MATRIX_SESSION_SELECT,
    });
  }

  const [recentExecuted, futureSessions] = await Promise.all([
    prisma.plannedSession.findMany({
      where: {
        user_id: args.userId,
        session_date: {
          lte: args.dateTo,
        },
        session_executions: {
          some: {},
        },
      },
      orderBy: [{ sequence_index: "desc" }],
      take: Math.max(args.recentCount, 1),
      select: PROGRESSION_MATRIX_SESSION_SELECT,
    }),
    prisma.plannedSession.findMany({
      where: {
        user_id: args.userId,
        status: {
          in: futureStatuses,
        },
        session_date: {
          gte: args.dateFrom,
          lte: args.dateTo,
        },
      },
      orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
      take: args.window,
      select: PROGRESSION_MATRIX_SESSION_SELECT,
    }),
  ]);

  const futureById = new Set(futureSessions.map((session) => session.id));
  const recentUniqueDesc = recentExecuted.filter((session) => !futureById.has(session.id));
  const recentSelected = recentUniqueDesc
    .slice(0, Math.max(args.recentCount, 0))
    .sort((a, b) => a.sequence_index - b.sequence_index);

  const remain = Math.max(args.window - recentSelected.length, 0);
  const merged = [...recentSelected, ...futureSessions.slice(0, remain)];

  return merged.sort((a, b) => a.sequence_index - b.sequence_index) as ProgressionMatrixSessionSelect[];
}

export async function getPlannedSessionWithUnitsById(plannedSessionId: string, userId: string) {
  return prisma.plannedSession.findFirst({
    where: {
      id: plannedSessionId,
      user_id: userId,
    },
    include: {
      planned_units: {
        orderBy: {
          sequence_no: "asc",
        },
      },
    },
  });
}

export async function getPlannedSessionWithUnitsAndExecutionCountById(
  plannedSessionId: string,
  userId: string,
) {
  return prisma.plannedSession.findFirst({
    where: {
      id: plannedSessionId,
      user_id: userId,
    },
    include: {
      planned_units: {
        orderBy: {
          sequence_no: "asc",
        },
      },
      _count: {
        select: {
          session_executions: true,
        },
      },
    },
  });
}

export async function updatePlannedSessionFields(
  plannedSessionId: string,
  userId: string,
  data: {
    planned_duration_min?: number | null;
    objective_summary?: string | null;
    notes?: string | null;
  },
) {
  return prisma.plannedSession.updateMany({
    where: {
      id: plannedSessionId,
      user_id: userId,
    },
    data,
  });
}

export async function createPlannedUnitForSession(
  plannedSessionId: string,
  data: {
    sequence_no: number;
    selected_exercise_name?: string | null;
    target_payload: Prisma.InputJsonValue;
    required: boolean;
    notes?: string | null;
  },
) {
  return prisma.plannedUnit.create({
    data: {
      planned_session_id: plannedSessionId,
      sequence_no: data.sequence_no,
      status: "planned",
      selected_exercise_name: data.selected_exercise_name,
      target_payload: data.target_payload,
      required: data.required,
      notes: data.notes,
    },
  });
}

export async function updatePlannedUnitForSession(
  plannedSessionId: string,
  plannedUnitId: string,
  data: {
    sequence_no: number;
    selected_exercise_name?: string | null;
    target_payload: Prisma.InputJsonValue;
    required: boolean;
    notes?: string | null;
  },
) {
  return prisma.plannedUnit.updateMany({
    where: {
      id: plannedUnitId,
      planned_session_id: plannedSessionId,
    },
    data: {
      sequence_no: data.sequence_no,
      selected_exercise_name: data.selected_exercise_name,
      target_payload: data.target_payload,
      required: data.required,
      notes: data.notes,
    },
  });
}

export async function updatePlannedUnitTargetPayloadById(
  plannedUnitId: string,
  targetPayload: Prisma.InputJsonValue,
) {
  return prisma.plannedUnit.update({
    where: {
      id: plannedUnitId,
    },
    data: {
      target_payload: targetPayload,
    },
  });
}

export async function deletePlannedUnitsByIds(plannedSessionId: string, plannedUnitIds: string[]) {
  if (plannedUnitIds.length === 0) {
    return { count: 0 };
  }
  return prisma.plannedUnit.deleteMany({
    where: {
      planned_session_id: plannedSessionId,
      id: {
        in: plannedUnitIds,
      },
    },
  });
}

export async function listOverdueUnresolvedPlannedSessionsByUser(
  userId: string,
  today: Date,
  limit: number,
) {
  const actionableStatuses: SessionState[] = ["planned", "ready", "partial"];
  const unresolvedWhere = unresolvedByCheckoffWhere();

  return prisma.plannedSession.findMany({
    where: {
      user_id: userId,
      status: {
        in: actionableStatuses,
      },
      session_date: {
        lt: today,
      },
      ...unresolvedWhere,
    },
    orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
    take: limit,
    select: {
      id: true,
      user_id: true,
      program_id: true,
      sequence_index: true,
      session_date: true,
      status: true,
      planned_duration_min: true,
      objective_summary: true,
      notes: true,
      program: {
        select: {
          id: true,
          name: true,
        },
      },
      planned_units: {
        orderBy: {
          sequence_no: "asc",
        },
        select: {
          id: true,
          sequence_no: true,
          selected_exercise_name: true,
          status: true,
          required: true,
        },
      },
    },
  });
}

export async function countOverdueUnresolvedPlannedSessionsByUser(userId: string, today: Date) {
  const actionableStatuses: SessionState[] = ["planned", "ready", "partial"];
  const unresolvedWhere = unresolvedByCheckoffWhere();

  return prisma.plannedSession.count({
    where: {
      user_id: userId,
      status: {
        in: actionableStatuses,
      },
      session_date: {
        lt: today,
      },
      ...unresolvedWhere,
    },
  });
}

export async function listFutureUnresolvedPlannedSessionsByProgramFromDate(
  programId: string,
  userId: string,
  fromDate: Date,
  excludePlannedSessionId?: string,
) {
  const actionableStatuses: SessionState[] = ["planned", "ready", "partial"];
  const unresolvedWhere = unresolvedByCheckoffWhere();

  return prisma.plannedSession.findMany({
    where: {
      program_id: programId,
      user_id: userId,
      ...(excludePlannedSessionId
        ? {
            id: {
              not: excludePlannedSessionId,
            },
          }
        : {}),
      status: {
        in: actionableStatuses,
      },
      session_date: {
        gte: fromDate,
      },
      ...unresolvedWhere,
    },
    orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
    select: {
      id: true,
      session_date: true,
    },
  });
}

export async function listFutureUnresolvedPlannedSessionsByProgramFromSequenceForRegeneration(
  programId: string,
  userId: string,
  fromSequenceIndexExclusive: number,
) {
  const actionableStatuses: SessionState[] = ["planned", "ready", "partial"];
  const unresolvedWhere = unresolvedByCheckoffWhere();

  return prisma.plannedSession.findMany({
    where: {
      program_id: programId,
      user_id: userId,
      sequence_index: {
        gt: fromSequenceIndexExclusive,
      },
      status: {
        in: actionableStatuses,
      },
      ...unresolvedWhere,
    },
    orderBy: [{ sequence_index: "asc" }],
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
      session_template: {
        select: {
          id: true,
          code: true,
        },
      },
    },
  });
}

export async function listUnresolvedQueueSessionsByProgramFromSequence(
  programId: string,
  userId: string,
  fromSequenceIndex: number,
) {
  const actionableStatuses: SessionState[] = ["planned", "ready", "partial"];
  const unresolvedWhere = unresolvedByCheckoffWhere();

  return prisma.plannedSession.findMany({
    where: {
      program_id: programId,
      user_id: userId,
      sequence_index: {
        gte: fromSequenceIndex,
      },
      status: {
        in: actionableStatuses,
      },
      ...unresolvedWhere,
    },
    orderBy: [{ sequence_index: "asc" }],
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
      status: true,
      session_template: {
        select: {
          id: true,
          scheduling_policy_type: true,
          preferred_weekday: true,
        },
      },
    },
  });
}

export async function listProgramSessionDateOccupancy(
  programId: string,
  userId: string,
  excludeSessionIds: string[] = [],
) {
  return prisma.plannedSession.findMany({
    where: {
      program_id: programId,
      user_id: userId,
      ...(excludeSessionIds.length > 0
        ? {
            id: {
              notIn: excludeSessionIds,
            },
          }
        : {}),
    },
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
      status: true,
    },
  });
}

export async function getPreviousPlannedSessionBeforeSequence(
  programId: string,
  userId: string,
  sequenceIndex: number,
) {
  return prisma.plannedSession.findFirst({
    where: {
      program_id: programId,
      user_id: userId,
      sequence_index: {
        lt: sequenceIndex,
      },
    },
    orderBy: [{ sequence_index: "desc" }],
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
      status: true,
    },
  });
}

export async function getEarliestOverdueUnresolvedPlannedSessionByProgram(
  programId: string,
  userId: string,
  today: Date,
) {
  const actionableStatuses: SessionState[] = ["planned", "ready", "partial"];
  const unresolvedWhere = unresolvedByCheckoffWhere();

  return prisma.plannedSession.findFirst({
    where: {
      program_id: programId,
      user_id: userId,
      status: {
        in: actionableStatuses,
      },
      session_date: {
        lt: today,
      },
      ...unresolvedWhere,
    },
    orderBy: [{ session_date: "asc" }, { sequence_index: "asc" }],
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
      status: true,
    },
  });
}

export async function updatePlannedSessionDatesBatch(
  userId: string,
  updates: Array<{ id: string; session_date: Date }>,
) {
  if (updates.length === 0) {
    return { count: 0 };
  }

  await prisma.$transaction(
    updates.map((item) =>
      prisma.plannedSession.updateMany({
        where: {
          id: item.id,
          user_id: userId,
        },
        data: {
          session_date: item.session_date,
        },
      }),
    ),
  );

  return { count: updates.length };
}

export async function hasAnyUnitExecutionForPlannedSession(plannedSessionId: string) {
  const found = await prisma.unitExecution.findFirst({
    where: {
      session_execution: {
        planned_session_id: plannedSessionId,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(found);
}

export async function shiftPlannedSessionDatesByDays(
  sessionItems: Array<{ id: string; session_date: Date }>,
  days: number,
) {
  if (sessionItems.length === 0 || days === 0) {
    return { count: 0 };
  }

  await prisma.$transaction(
    sessionItems.map((session) => {
      const nextDate = new Date(session.session_date);
      nextDate.setDate(nextDate.getDate() + days);
      return prisma.plannedSession.update({
        where: {
          id: session.id,
        },
        data: {
          session_date: nextDate,
        },
      });
    }),
  );

  return { count: sessionItems.length };
}

export async function getPlannedSessionDeleteContext(plannedSessionId: string, userId: string) {
  return prisma.plannedSession.findFirst({
    where: {
      id: plannedSessionId,
      user_id: userId,
    },
    select: {
      id: true,
      sequence_index: true,
      session_date: true,
      _count: {
        select: {
          session_executions: true,
        },
      },
    },
  });
}

export async function deletePlannedSessionById(plannedSessionId: string, userId: string) {
  const [deletedUnits, deletedSessions] = await prisma.$transaction([
    prisma.plannedUnit.deleteMany({
      where: {
        planned_session_id: plannedSessionId,
        planned_session: {
          is: {
            user_id: userId,
          },
        },
      },
    }),
    prisma.plannedSession.deleteMany({
      where: {
        id: plannedSessionId,
        user_id: userId,
      },
    }),
  ]);

  return {
    deletedUnits: deletedUnits.count,
    deletedSessions: deletedSessions.count,
  };
}

export async function updatePlannedSessionStatus(
  plannedSessionId: string,
  userId: string,
  status: SessionState,
) {
  return prisma.plannedSession.updateMany({
    where: {
      id: plannedSessionId,
      user_id: userId,
    },
    data: {
      status,
    },
  });
}

export async function updatePlannedSessionDate(
  plannedSessionId: string,
  userId: string,
  sessionDate: Date,
) {
  return prisma.plannedSession.updateMany({
    where: {
      id: plannedSessionId,
      user_id: userId,
    },
    data: {
      session_date: sessionDate,
    },
  });
}

export async function updatePlannedUnitStatusByIds(
  plannedSessionId: string,
  updates: Array<{ plannedUnitId: string; status: UnitState }>,
) {
  return prisma.$transaction(
    updates.map((update) =>
      prisma.plannedUnit.updateMany({
        where: {
          id: update.plannedUnitId,
          planned_session_id: plannedSessionId,
        },
        data: {
          status: update.status,
        },
      }),
    ),
  );
}

export async function updateAllPlannedUnitsStatus(plannedSessionId: string, status: UnitState) {
  return prisma.plannedUnit.updateMany({
    where: {
      planned_session_id: plannedSessionId,
    },
    data: {
      status,
    },
  });
}

export async function listPlannedUnitStates(plannedSessionId: string) {
  return prisma.plannedUnit.findMany({
    where: {
      planned_session_id: plannedSessionId,
    },
    select: {
      id: true,
      status: true,
    },
  });
}
