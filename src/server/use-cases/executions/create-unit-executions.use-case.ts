import { Prisma, UnitExecutionCompletionStatus } from "@prisma/client";
import { z } from "zod";

import {
  createUnitExecutions,
  getMaxUnitExecutionSequenceNo,
  getPlannedSessionWithUnitsById,
  getSessionExecutionByIdForUser,
  listPlannedUnitStates,
  updateSessionExecutionById,
  updatePlannedSessionStatus,
  updatePlannedUnitStatusByIds,
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

const UnitCheckoffSchema = z
  .object({
    deviationTags: z.array(CheckoffDeviationTagSchema).default([]),
    executionMethod: CheckoffExecutionMethodSchema.optional(),
    reasonTags: z.array(CheckoffReasonTagSchema).default([]),
    actualSets: z.number().int().positive().optional(),
    actualReps: z.number().int().positive().optional(),
    actualDurationSeconds: z.number().int().positive().optional(),
    loadChange: z.enum(["increase", "decrease"]).optional(),
    addedSets: z.number().int().positive().optional(),
    addedReps: z.number().int().positive().optional(),
    replacedExerciseName: z.string().trim().min(1).optional(),
    executionMethodNote: z.string().trim().optional(),
    notes: z.string().optional(),
  })
  .optional();

const CreateUnitExecutionsInputSchema = z.object({
  userId: UuidLikeSchema,
  sessionExecutionId: UuidLikeSchema,
  unitExecutions: z
    .array(
      z.object({
        plannedUnitId: UuidLikeSchema.optional(),
        unitTemplateId: UuidLikeSchema.optional(),
        sequenceNo: z.number().int().positive().optional(),
        completionStatus: z.nativeEnum(UnitExecutionCompletionStatus),
        actualUnitName: z.string().optional(),
        actualPayload: z.unknown().optional(),
        setLogs: z.unknown().optional(),
        resultFlags: z.unknown().optional(),
        checkoff: UnitCheckoffSchema,
        symptomTags: z.array(z.string()).optional(),
        perceivedExertion: z.number().min(0).max(10).optional(),
        painScore: z.number().int().min(0).max(10).optional(),
        autoProgressionCandidate: z.boolean().optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

export type CreateUnitExecutionsInput = z.infer<typeof CreateUnitExecutionsInputSchema>;

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

export async function createUnitExecutionsUseCase(rawInput: CreateUnitExecutionsInput) {
  const input = CreateUnitExecutionsInputSchema.parse(rawInput);
  const sessionExecution = await getSessionExecutionByIdForUser(input.sessionExecutionId, input.userId);

  if (!sessionExecution) {
    throw notFoundError("Session execution not found");
  }

  const plannedSessionId = sessionExecution.planned_session_id;
  const plannedSession = plannedSessionId
    ? await getPlannedSessionWithUnitsById(plannedSessionId, input.userId)
    : null;

  const plannedUnitById = new Map(plannedSession?.planned_units.map((unit) => [unit.id, unit]) ?? []);
  const maxSequenceNo = await getMaxUnitExecutionSequenceNo(input.sessionExecutionId);

  const seeds = input.unitExecutions.map((unitExecution, index) => {
    const plannedUnit = unitExecution.plannedUnitId
      ? plannedUnitById.get(unitExecution.plannedUnitId)
      : undefined;

    if (unitExecution.plannedUnitId && !plannedUnit) {
      throw badRequestError(`Planned unit not found in linked planned session: ${unitExecution.plannedUnitId}`);
    }

    const checkoff = unitExecution.checkoff;
    const actualPayloadBase = toObject(unitExecution.actualPayload);
    const resultFlagsBase = toObject(unitExecution.resultFlags);

    const actualDiff: Record<string, unknown> = {
      deviation_tags: checkoff?.deviationTags ?? [],
      reason_tags: checkoff?.reasonTags ?? [],
      ...(checkoff?.executionMethod ? { execution_method: checkoff.executionMethod } : {}),
      ...(checkoff?.actualSets !== undefined ? { actual_sets: checkoff.actualSets } : {}),
      ...(checkoff?.actualReps !== undefined ? { actual_reps: checkoff.actualReps } : {}),
      ...(checkoff?.actualDurationSeconds !== undefined
        ? { actual_duration_seconds: checkoff.actualDurationSeconds }
        : {}),
      ...(checkoff?.loadChange ? { load_change: checkoff.loadChange } : {}),
      ...(checkoff?.addedSets !== undefined ? { added_sets: checkoff.addedSets } : {}),
      ...(checkoff?.addedReps !== undefined ? { added_reps: checkoff.addedReps } : {}),
      ...(checkoff?.replacedExerciseName
        ? { replaced_exercise_name: checkoff.replacedExerciseName }
        : {}),
      ...(checkoff?.executionMethodNote
        ? { execution_method_note: checkoff.executionMethodNote }
        : {}),
    };

    const actualPayload = {
      ...actualPayloadBase,
      source: actualPayloadBase.source ?? "execution_checkoff_v1",
      checkoff_v1: true,
      actual_diff: actualDiff,
    } as Prisma.InputJsonValue;

    const resultFlags = {
      ...resultFlagsBase,
      checkoff_v1: {
        deviation_tags: checkoff?.deviationTags ?? [],
        execution_method: checkoff?.executionMethod ?? null,
        reason_tags: checkoff?.reasonTags ?? [],
      },
    } as Prisma.InputJsonValue;

    return {
      session_execution_id: input.sessionExecutionId,
      planned_unit_id: unitExecution.plannedUnitId,
      unit_template_id: unitExecution.unitTemplateId ?? plannedUnit?.unit_template_id ?? undefined,
      progress_track_id: plannedUnit?.progress_track_id ?? undefined,
      sequence_no: unitExecution.sequenceNo ?? maxSequenceNo + index + 1,
      completion_status: unitExecution.completionStatus,
      actual_unit_name:
        unitExecution.actualUnitName ??
        checkoff?.replacedExerciseName ??
        plannedUnit?.selected_exercise_name ??
        undefined,
      actual_payload: actualPayload,
      set_logs: unitExecution.setLogs as Prisma.InputJsonValue | undefined,
      result_flags: resultFlags,
      symptom_tags: unitExecution.symptomTags,
      perceived_exertion: unitExecution.perceivedExertion,
      pain_score: unitExecution.painScore,
      auto_progression_candidate: unitExecution.autoProgressionCandidate,
      notes: unitExecution.notes ?? checkoff?.notes,
    };
  });

  const createdUnitExecutions = await createUnitExecutions(seeds);
  const nextSessionExecutionStatus = deriveSessionExecutionStatusFromUnitExecutions(
    input.unitExecutions.map((item) => item.completionStatus),
  );

  await updateSessionExecutionById(input.sessionExecutionId, {
    completion_status: nextSessionExecutionStatus,
  });

  if (plannedSessionId && plannedSession) {
    const plannedUnitUpdates = input.unitExecutions
      .filter((item) => !!item.plannedUnitId)
      .map((item) => ({
        plannedUnitId: item.plannedUnitId!,
        status: mapUnitExecutionCompletionToUnitState(item.completionStatus),
      }));

    if (plannedUnitUpdates.length > 0) {
      await updatePlannedUnitStatusByIds(plannedSessionId, plannedUnitUpdates);

      const updatedUnitStates = await listPlannedUnitStates(plannedSessionId);
      const nextSessionState = derivePlannedSessionStateFromPlannedUnits(
        updatedUnitStates.map((unit) => unit.status),
      );
      await updatePlannedSessionStatus(plannedSessionId, input.userId, nextSessionState);
    }
  }

  return createdUnitExecutions;
}
