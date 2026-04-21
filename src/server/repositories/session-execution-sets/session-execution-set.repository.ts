import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type SessionExecutionSetStatus = "pending" | "completed" | "skipped" | "extra";

export type SessionExecutionSetCreateSeed = {
  session_execution_id: string;
  planned_unit_id?: string;
  set_index: number;
  planned_set_type?: string;
  planned_reps?: number;
  planned_weight?: number;
  planned_rpe?: number;
  planned_rest_seconds?: number;
  planned_tempo?: string;
  actual_reps?: number;
  actual_weight?: number;
  actual_rpe?: number;
  actual_rest_seconds?: number;
  actual_tempo?: string;
  status: SessionExecutionSetStatus;
  is_extra_set?: boolean;
  note?: string;
};

export type SessionExecutionSetPatch = {
  actual_reps?: number | null;
  actual_weight?: number | null;
  actual_rpe?: number | null;
  actual_rest_seconds?: number | null;
  actual_tempo?: string | null;
  status?: SessionExecutionSetStatus;
  note?: string | null;
};

export type SessionExecutionSetRow = {
  id: string;
  session_execution_id: string;
  planned_unit_id: string | null;
  set_index: number;
  planned_set_type: string | null;
  planned_reps: number | null;
  planned_weight: string | null;
  planned_rpe: string | null;
  planned_rest_seconds: number | null;
  planned_tempo: string | null;
  actual_reps: number | null;
  actual_weight: string | null;
  actual_rpe: string | null;
  actual_rest_seconds: number | null;
  actual_tempo: string | null;
  status: SessionExecutionSetStatus;
  is_extra_set: boolean;
  note: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SessionExecutionWithSets = {
  id: string;
  user_id: string;
  planned_session_id: string | null;
  program_id: string | null;
  block_id: string | null;
  performed_at: Date;
  completion_status: string;
  actual_duration_min: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  planned_session: {
    id: string;
    sequence_index: number;
    session_date: Date;
    status: string;
    planned_units: Array<{
      id: string;
      sequence_no: number;
      unit_template_id: string | null;
      progress_track_id: string | null;
      selected_exercise_name: string | null;
      target_payload: Record<string, unknown>;
      status: string;
      required: boolean;
    }>;
  } | null;
  program: {
    id: string;
    name: string;
  } | null;
  execution_sets: SessionExecutionSetRow[];
};

function decimalToString(value: Prisma.Decimal | null) {
  if (value === null) {
    return null;
  }
  return value.toString();
}

function toRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapSetRow(row: {
  id: string;
  session_execution_id: string;
  planned_unit_id: string | null;
  set_index: number;
  planned_set_type: string | null;
  planned_reps: number | null;
  planned_weight: Prisma.Decimal | null;
  planned_rpe: Prisma.Decimal | null;
  planned_rest_seconds: number | null;
  planned_tempo: string | null;
  actual_reps: number | null;
  actual_weight: Prisma.Decimal | null;
  actual_rpe: Prisma.Decimal | null;
  actual_rest_seconds: number | null;
  actual_tempo: string | null;
  status: SessionExecutionSetStatus;
  is_extra_set: boolean;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}): SessionExecutionSetRow {
  return {
    id: row.id,
    session_execution_id: row.session_execution_id,
    planned_unit_id: row.planned_unit_id,
    set_index: row.set_index,
    planned_set_type: row.planned_set_type,
    planned_reps: row.planned_reps,
    planned_weight: decimalToString(row.planned_weight),
    planned_rpe: decimalToString(row.planned_rpe),
    planned_rest_seconds: row.planned_rest_seconds,
    planned_tempo: row.planned_tempo,
    actual_reps: row.actual_reps,
    actual_weight: decimalToString(row.actual_weight),
    actual_rpe: decimalToString(row.actual_rpe),
    actual_rest_seconds: row.actual_rest_seconds,
    actual_tempo: row.actual_tempo,
    status: row.status,
    is_extra_set: row.is_extra_set,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createSessionExecutionSet(seed: SessionExecutionSetCreateSeed) {
  const created = await prisma.sessionExecutionSet.create({
    data: {
      session_execution_id: seed.session_execution_id,
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
    },
  });

  return mapSetRow(created);
}

export async function createSessionExecutionSets(seeds: SessionExecutionSetCreateSeed[]) {
  if (seeds.length === 0) {
    return { count: 0 };
  }

  const result = await prisma.sessionExecutionSet.createMany({
    data: seeds.map((seed) => ({
      session_execution_id: seed.session_execution_id,
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
    skipDuplicates: false,
  });

  return { count: result.count };
}

export async function getSessionExecutionWithSetsByIdForUser(
  sessionExecutionId: string,
  userId: string,
): Promise<SessionExecutionWithSets | null> {
  const session = await prisma.sessionExecution.findFirst({
    where: {
      id: sessionExecutionId,
      user_id: userId,
    },
    select: {
      id: true,
      user_id: true,
      planned_session_id: true,
      program_id: true,
      block_id: true,
      performed_at: true,
      completion_status: true,
      actual_duration_min: true,
      notes: true,
      created_at: true,
      updated_at: true,
      planned_session: {
        select: {
          id: true,
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
              unit_template_id: true,
              progress_track_id: true,
              selected_exercise_name: true,
              target_payload: true,
              status: true,
              required: true,
            },
          },
        },
      },
      program: {
        select: {
          id: true,
          name: true,
        },
      },
      execution_sets: {
        orderBy: [{ planned_unit_id: "asc" }, { set_index: "asc" }, { created_at: "asc" }],
      },
    },
  });

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    user_id: session.user_id,
    planned_session_id: session.planned_session_id,
    program_id: session.program_id,
    block_id: session.block_id,
    performed_at: session.performed_at,
    completion_status: session.completion_status,
    actual_duration_min: session.actual_duration_min,
    notes: session.notes,
    created_at: session.created_at,
    updated_at: session.updated_at,
    planned_session: session.planned_session
      ? {
          id: session.planned_session.id,
          sequence_index: session.planned_session.sequence_index,
          session_date: session.planned_session.session_date,
          status: session.planned_session.status,
          planned_units: session.planned_session.planned_units.map((unit) => ({
            id: unit.id,
            sequence_no: unit.sequence_no,
            unit_template_id: unit.unit_template_id,
            progress_track_id: unit.progress_track_id,
            selected_exercise_name: unit.selected_exercise_name,
            target_payload: toRecord(unit.target_payload),
            status: unit.status,
            required: unit.required,
          })),
        }
      : null,
    program: session.program
      ? {
          id: session.program.id,
          name: session.program.name,
        }
      : null,
    execution_sets: session.execution_sets.map((setRow) => mapSetRow(setRow)),
  };
}

export async function getSessionExecutionSetById(setId: string) {
  const setRow = await prisma.sessionExecutionSet.findUnique({
    where: {
      id: setId,
    },
  });

  if (!setRow) {
    return null;
  }

  return mapSetRow(setRow);
}

export async function getSessionExecutionSetByIdForUser(setId: string, userId: string) {
  const setRow = await prisma.sessionExecutionSet.findFirst({
    where: {
      id: setId,
      session_execution: {
        is: {
          user_id: userId,
        },
      },
    },
    include: {
      session_execution: {
        select: {
          id: true,
          user_id: true,
          planned_session_id: true,
        },
      },
    },
  });

  if (!setRow) {
    return null;
  }

  return {
    ...mapSetRow(setRow),
    session_execution: setRow.session_execution,
  };
}

export async function updateSessionExecutionSetById(setId: string, data: SessionExecutionSetPatch) {
  const updateData: Prisma.SessionExecutionSetUncheckedUpdateInput = {
    ...(data.actual_reps !== undefined ? { actual_reps: data.actual_reps } : {}),
    ...(data.actual_weight !== undefined ? { actual_weight: data.actual_weight } : {}),
    ...(data.actual_rpe !== undefined ? { actual_rpe: data.actual_rpe } : {}),
    ...(data.actual_rest_seconds !== undefined
      ? { actual_rest_seconds: data.actual_rest_seconds }
      : {}),
    ...(data.actual_tempo !== undefined ? { actual_tempo: data.actual_tempo } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.note !== undefined ? { note: data.note } : {}),
  };

  if (Object.keys(updateData).length === 0) {
    const existing = await getSessionExecutionSetById(setId);
    if (!existing) {
      throw new Error("Session execution set not found");
    }
    return existing;
  }

  const updated = await prisma.sessionExecutionSet.update({
    where: {
      id: setId,
    },
    data: updateData,
  });

  return mapSetRow(updated);
}

export async function getMaxSetIndexBySessionExecutionAndPlannedUnit(
  sessionExecutionId: string,
  plannedUnitId: string,
) {
  const result = await prisma.sessionExecutionSet.aggregate({
    where: {
      session_execution_id: sessionExecutionId,
      planned_unit_id: plannedUnitId,
    },
    _max: {
      set_index: true,
    },
  });

  return result._max.set_index ?? 0;
}

export async function getLatestSessionExecutionSetBySessionExecutionAndPlannedUnit(
  sessionExecutionId: string,
  plannedUnitId: string,
) {
  const setRow = await prisma.sessionExecutionSet.findFirst({
    where: {
      session_execution_id: sessionExecutionId,
      planned_unit_id: plannedUnitId,
    },
    orderBy: [{ set_index: "desc" }, { created_at: "desc" }],
  });

  if (!setRow) {
    return null;
  }

  return mapSetRow(setRow);
}

export async function listRecentCompletedWeightedExecutionSetsByUser(userId: string, limit = 240) {
  return prisma.sessionExecutionSet.findMany({
    where: {
      session_execution: {
        is: {
          user_id: userId,
        },
      },
      status: "completed",
      actual_weight: {
        not: null,
      },
      actual_reps: {
        not: null,
      },
      planned_unit_id: {
        not: null,
      },
    },
    orderBy: [{ updated_at: "desc" }],
    take: limit,
    select: {
      id: true,
      actual_weight: true,
      actual_reps: true,
      planned_set_type: true,
      updated_at: true,
      session_execution: {
        select: {
          performed_at: true,
        },
      },
      planned_unit: {
        select: {
          selected_exercise_name: true,
        },
      },
    },
  });
}

export async function listRecentExecutionSetSignalsByUser(userId: string, limit = 600) {
  return prisma.sessionExecutionSet.findMany({
    where: {
      session_execution: {
        is: {
          user_id: userId,
        },
      },
      planned_unit_id: {
        not: null,
      },
    },
    orderBy: [{ updated_at: "desc" }],
    take: limit,
    select: {
      id: true,
      status: true,
      planned_set_type: true,
      planned_reps: true,
      actual_reps: true,
      planned_weight: true,
      actual_weight: true,
      actual_rpe: true,
      updated_at: true,
      session_execution: {
        select: {
          id: true,
          performed_at: true,
          completion_status: true,
        },
      },
      planned_unit: {
        select: {
          id: true,
          selected_exercise_name: true,
          progress_track_id: true,
        },
      },
    },
  });
}
