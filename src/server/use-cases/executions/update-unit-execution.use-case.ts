import { Prisma, UnitExecutionCompletionStatus } from "@prisma/client";
import { z } from "zod";

import {
  getUnitExecutionByIdForUser,
  listPlannedUnitStates,
  listUnitExecutionCompletionStatusesBySessionExecution,
  updatePlannedSessionStatus,
  updatePlannedUnitStatusByIds,
  updateSessionExecutionById,
  updateUnitExecutionById,
} from "@/server/repositories";
import {
  derivePlannedSessionStateFromPlannedUnits,
  deriveSessionExecutionStatusFromUnitExecutions,
  mapUnitExecutionCompletionToUnitState,
} from "@/server/services/executions/execution-status.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const CheckoffDeviationTagSchema = z.enum([
  "less_sets",
  "less_reps",
  "increase_load",
  "decrease_load",
  "add_sets",
  "add_reps",
  "replace_exercise",
  "execution_method_change",
  "less_duration",
]);

const CheckoffExecutionMethodSchema = z.enum([
  "superset",
  "drop_set",
  "rest_pause",
  "other",
]);

const CheckoffReasonTagSchema = z.enum([
  "fatigue",
  "time_limit",
  "poor_state",
  "pain_discomfort",
  "equipment_limit",
  "venue_limit",
  "other",
]);

const UnitCheckoffPatchSchema = z.object({
  deviationTags: z.array(CheckoffDeviationTagSchema).default([]),
  executionMethod: CheckoffExecutionMethodSchema.nullable().optional(),
  reasonTags: z.array(CheckoffReasonTagSchema).default([]),
  actualSets: z.number().int().positive().optional(),
  actualReps: z.number().int().positive().optional(),
  actualDurationSeconds: z.number().int().positive().optional(),
  loadChange: z.enum(["increase", "decrease"]).nullable().optional(),
  addedSets: z.number().int().positive().optional(),
  addedReps: z.number().int().positive().optional(),
  replacedExerciseName: z.string().trim().min(1).optional(),
  executionMethodNote: z.string().trim().optional(),
  notes: z.string().optional(),
});

const UpdateUnitExecutionInputSchema = z
  .object({
    userId: UuidLikeSchema,
    unitExecutionId: UuidLikeSchema,
    completionStatus: z.nativeEnum(UnitExecutionCompletionStatus).optional(),
    notes: z.string().optional(),
    perceivedExertion: z.number().min(0).max(10).optional(),
    painScore: z.number().int().min(0).max(10).optional(),
    checkoff: UnitCheckoffPatchSchema.optional(),
  })
  .refine(
    (value) =>
      value.completionStatus !== undefined ||
      value.notes !== undefined ||
      value.perceivedExertion !== undefined ||
      value.painScore !== undefined ||
      value.checkoff !== undefined,
    {
      message: "At least one editable field is required",
    },
  );

export type UpdateUnitExecutionInput = z.input<typeof UpdateUnitExecutionInputSchema>;

function mapNotesInput(notes: string | undefined) {
  if (notes === undefined) {
    return undefined;
  }

  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

export async function updateUnitExecutionUseCase(rawInput: UpdateUnitExecutionInput) {
  const input = UpdateUnitExecutionInputSchema.parse(rawInput);

  const existing = await getUnitExecutionByIdForUser(input.unitExecutionId, input.userId);
  if (!existing) {
    throw notFoundError("Unit execution not found");
  }

  const updateData: Prisma.UnitExecutionUncheckedUpdateInput = {
    ...(input.completionStatus !== undefined ? { completion_status: input.completionStatus } : {}),
    ...(input.notes !== undefined ? { notes: mapNotesInput(input.notes) } : {}),
    ...(input.perceivedExertion !== undefined ? { perceived_exertion: input.perceivedExertion } : {}),
    ...(input.painScore !== undefined ? { pain_score: input.painScore } : {}),
  };

  if (input.checkoff) {
    const checkoff = input.checkoff;
    const actualPayloadBase = toObject(existing.actual_payload);
    const resultFlagsBase = toObject(existing.result_flags);

    const actualDiff: Record<string, unknown> = {
      deviation_tags: checkoff.deviationTags ?? [],
      reason_tags: checkoff.reasonTags ?? [],
      ...(checkoff.executionMethod !== undefined
        ? { execution_method: checkoff.executionMethod }
        : {}),
      ...(checkoff.actualSets !== undefined ? { actual_sets: checkoff.actualSets } : {}),
      ...(checkoff.actualReps !== undefined ? { actual_reps: checkoff.actualReps } : {}),
      ...(checkoff.actualDurationSeconds !== undefined
        ? { actual_duration_seconds: checkoff.actualDurationSeconds }
        : {}),
      ...(checkoff.loadChange !== undefined ? { load_change: checkoff.loadChange } : {}),
      ...(checkoff.addedSets !== undefined ? { added_sets: checkoff.addedSets } : {}),
      ...(checkoff.addedReps !== undefined ? { added_reps: checkoff.addedReps } : {}),
      ...(checkoff.replacedExerciseName !== undefined
        ? { replaced_exercise_name: checkoff.replacedExerciseName }
        : {}),
      ...(checkoff.executionMethodNote !== undefined
        ? { execution_method_note: checkoff.executionMethodNote }
        : {}),
    };

    updateData.actual_payload = {
      ...actualPayloadBase,
      source: actualPayloadBase.source ?? "execution_checkoff_v1",
      checkoff_v1: true,
      actual_diff: actualDiff,
    } as Prisma.InputJsonValue;

    updateData.result_flags = {
      ...resultFlagsBase,
      checkoff_v1: {
        deviation_tags: checkoff.deviationTags ?? [],
        execution_method: checkoff.executionMethod ?? null,
        reason_tags: checkoff.reasonTags ?? [],
      },
    } as Prisma.InputJsonValue;

    if (checkoff.replacedExerciseName?.trim()) {
      updateData.actual_unit_name = checkoff.replacedExerciseName.trim();
    }

    if (input.notes === undefined && checkoff.notes !== undefined) {
      updateData.notes = mapNotesInput(checkoff.notes);
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw badRequestError("No changes to update");
  }

  await updateUnitExecutionById(existing.id, updateData);
  const refreshed = await getUnitExecutionByIdForUser(existing.id, input.userId);
  if (!refreshed) {
    throw notFoundError("Updated unit execution not found");
  }
  const plannedSessionId = existing.session_execution.planned_session_id;

  if (
    input.completionStatus !== undefined &&
    existing.planned_unit_id &&
    plannedSessionId
  ) {
    await updatePlannedUnitStatusByIds(plannedSessionId, [
      {
        plannedUnitId: existing.planned_unit_id,
        status: mapUnitExecutionCompletionToUnitState(input.completionStatus),
      },
    ]);

    const plannedUnitStates = await listPlannedUnitStates(plannedSessionId);
    const nextSessionState = derivePlannedSessionStateFromPlannedUnits(
      plannedUnitStates.map((item) => item.status),
    );
    await updatePlannedSessionStatus(plannedSessionId, input.userId, nextSessionState);
  }

  if (input.completionStatus !== undefined) {
    const allUnitExecutionStatuses = await listUnitExecutionCompletionStatusesBySessionExecution(
      existing.session_execution.id,
    );
    const nextSessionExecutionStatus = deriveSessionExecutionStatusFromUnitExecutions(
      allUnitExecutionStatuses.map((item) => item.completion_status),
    );
    await updateSessionExecutionById(existing.session_execution.id, {
      completion_status: nextSessionExecutionStatus,
    });
  }

  return refreshed;
}
