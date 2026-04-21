import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type UnitExecutionCreateSeed = {
  session_execution_id: string;
  planned_unit_id?: string;
  unit_template_id?: string;
  progress_track_id?: string;
  sequence_no: number;
  completion_status: "completed" | "partial" | "skipped" | "failed" | "replaced";
  actual_unit_name?: string;
  actual_payload: Prisma.InputJsonValue;
  set_logs?: Prisma.InputJsonValue;
  result_flags?: Prisma.InputJsonValue;
  symptom_tags?: Prisma.InputJsonValue;
  perceived_exertion?: Prisma.Decimal | number;
  pain_score?: number;
  auto_progression_candidate?: boolean;
  notes?: string;
  imported_from_evidence_id?: string;
};

export type UnitExecutionCompatUpsertSeed = {
  session_execution_id: string;
  planned_unit_id?: string;
  unit_template_id?: string;
  progress_track_id?: string;
  sequence_no: number;
  completion_status: "completed" | "partial" | "skipped" | "failed" | "replaced";
  actual_unit_name?: string;
  actual_payload: Prisma.InputJsonValue;
  set_logs?: Prisma.InputJsonValue;
  result_flags?: Prisma.InputJsonValue;
  notes?: string;
};

export async function createUnitExecutions(seeds: UnitExecutionCreateSeed[]) {
  return prisma.$transaction(
    seeds.map((seed) =>
      prisma.unitExecution.create({
        data: {
          session_execution_id: seed.session_execution_id,
          planned_unit_id: seed.planned_unit_id,
          unit_template_id: seed.unit_template_id,
          progress_track_id: seed.progress_track_id,
          sequence_no: seed.sequence_no,
          completion_status: seed.completion_status,
          actual_unit_name: seed.actual_unit_name,
          actual_payload: seed.actual_payload,
          set_logs: seed.set_logs,
          result_flags: seed.result_flags,
          symptom_tags: seed.symptom_tags,
          perceived_exertion: seed.perceived_exertion,
          pain_score: seed.pain_score,
          auto_progression_candidate: seed.auto_progression_candidate,
          notes: seed.notes,
          imported_from_evidence_id: seed.imported_from_evidence_id,
        },
      }),
    ),
  );
}

export async function getUnitExecutionByIdForUser(unitExecutionId: string, userId: string) {
  return prisma.unitExecution.findFirst({
    where: {
      id: unitExecutionId,
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
          program_id: true,
        },
      },
    },
  });
}

export async function updateUnitExecutionById(
  unitExecutionId: string,
  data: Prisma.UnitExecutionUncheckedUpdateInput,
) {
  return prisma.unitExecution.update({
    where: {
      id: unitExecutionId,
    },
    data,
  });
}

export async function getMaxUnitExecutionSequenceNo(sessionExecutionId: string) {
  const last = await prisma.unitExecution.findFirst({
    where: {
      session_execution_id: sessionExecutionId,
    },
    orderBy: {
      sequence_no: "desc",
    },
    select: {
      sequence_no: true,
    },
  });

  return last?.sequence_no ?? 0;
}

export async function listLatestUnitExecutionByPlannedUnitIds(
  plannedUnitIds: string[],
  userId: string,
) {
  if (plannedUnitIds.length === 0) {
    return [];
  }

  return prisma.unitExecution.findMany({
    where: {
      planned_unit_id: {
        in: plannedUnitIds,
      },
      session_execution: {
        is: {
          user_id: userId,
        },
      },
    },
    orderBy: [{ created_at: "desc" }],
    select: {
      planned_unit_id: true,
      completion_status: true,
      created_at: true,
    },
  });
}

export async function listUnitExecutionCompletionStatusesBySessionExecution(
  sessionExecutionId: string,
) {
  return prisma.unitExecution.findMany({
    where: {
      session_execution_id: sessionExecutionId,
    },
    select: {
      completion_status: true,
    },
  });
}

export async function countUnitExecutionsBySessionExecution(sessionExecutionId: string) {
  return prisma.unitExecution.count({
    where: {
      session_execution_id: sessionExecutionId,
    },
  });
}

export async function listUnitExecutionsBySessionExecution(sessionExecutionId: string) {
  return prisma.unitExecution.findMany({
    where: {
      session_execution_id: sessionExecutionId,
    },
    orderBy: {
      sequence_no: "asc",
    },
    select: {
      id: true,
      planned_unit_id: true,
      sequence_no: true,
      completion_status: true,
    },
  });
}

export async function listUnitExecutionsForSetCompatBySessionExecution(sessionExecutionId: string) {
  return prisma.unitExecution.findMany({
    where: {
      session_execution_id: sessionExecutionId,
    },
    orderBy: {
      sequence_no: "asc",
    },
    select: {
      id: true,
      session_execution_id: true,
      planned_unit_id: true,
      unit_template_id: true,
      progress_track_id: true,
      sequence_no: true,
      completion_status: true,
      result_flags: true,
      actual_payload: true,
    },
  });
}

export async function upsertUnitExecutionCompatRows(seeds: UnitExecutionCompatUpsertSeed[]) {
  if (seeds.length === 0) {
    return [];
  }

  return prisma.$transaction(
    seeds.map((seed) =>
      prisma.unitExecution.upsert({
        where: {
          session_execution_id_sequence_no: {
            session_execution_id: seed.session_execution_id,
            sequence_no: seed.sequence_no,
          },
        },
        update: {
          planned_unit_id: seed.planned_unit_id,
          unit_template_id: seed.unit_template_id,
          progress_track_id: seed.progress_track_id,
          completion_status: seed.completion_status,
          actual_unit_name: seed.actual_unit_name,
          actual_payload: seed.actual_payload,
          set_logs: seed.set_logs,
          result_flags: seed.result_flags,
          notes: seed.notes,
        },
        create: {
          session_execution_id: seed.session_execution_id,
          planned_unit_id: seed.planned_unit_id,
          unit_template_id: seed.unit_template_id,
          progress_track_id: seed.progress_track_id,
          sequence_no: seed.sequence_no,
          completion_status: seed.completion_status,
          actual_unit_name: seed.actual_unit_name,
          actual_payload: seed.actual_payload,
          set_logs: seed.set_logs,
          result_flags: seed.result_flags,
          notes: seed.notes,
        },
      }),
    ),
  );
}
