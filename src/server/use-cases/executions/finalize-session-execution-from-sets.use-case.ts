import {
  Prisma,
  RecoveryPolicyType,
  SessionExecutionCompletionStatus,
  UnitExecutionCompletionStatus,
} from "@prisma/client";
import { z } from "zod";

import {
  applyActionEntryAnchorSummaryToSetStructure,
  isAssistedActionEntryMode,
} from "@/lib/action-entry-anchor";
import {
  applyProgressTrackOutcomeUpdates,
  countUnitExecutionsBySessionExecution,
  getProgramById,
  upsertActionEntryAnchorByUser,
  getSessionExecutionByIdForUser,
  listFutureUnresolvedPlannedSessionsByProgramFromSequenceForRegeneration,
  listPlannedUnitStates,
  listProgressTracksByIds,
  listTrainingUnitTemplateRolesByIds,
  listUnitExecutionsForSetCompatBySessionExecution,
  updateTrainingUnitTemplateById,
  updatePlannedSessionStatus,
  updatePlannedUnitStatusByIds,
  upsertUnitExecutionCompatRows,
} from "@/server/repositories";
import {
  derivePlannedSessionStateFromPlannedUnits,
  mapUnitExecutionCompletionToUnitState,
} from "@/server/services/executions/execution-status.service";
import {
  buildProgressTrackOutcomeDelta,
  classifyTrackOutcomeFromSetSummary,
  ProgressTrackOutcomeKind,
  summarizeUnitFromExecutionSets,
  UnitSetSummary,
} from "@/server/services/progression/progression-track-outcome.service";
import { ProgressTrackState } from "@/lib/progression-types";
import { normalizeTrainingUnitSets } from "@/lib/training-set-standards";
import { getSessionExecutionDetailUseCase } from "@/server/use-cases/executions/get-session-execution-detail.use-case";
import { updateSessionExecutionUseCase } from "@/server/use-cases/executions/update-session-execution.use-case";
import { generatePlannedSessionsUseCase } from "@/server/use-cases/sessions/generate-planned-sessions.use-case";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const FinalizeSessionExecutionFromSetsInputSchema = z.object({
  userId: UuidLikeSchema,
  sessionExecutionId: UuidLikeSchema,
  actualDurationMin: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

export type FinalizeSessionExecutionFromSetsInput = z.input<
  typeof FinalizeSessionExecutionFromSetsInputSchema
>;

type UnitProgressStatus = "pending" | "in_progress" | "completed" | "skipped";

type UnitSetOutcome = "success_met" | "partial" | "failed" | "skipped";

type UnitProgressSummary = {
  plannedUnitId: string;
  sequenceNo: number;
  exerciseName: string | null;
  unitTemplateId: string | null;
  progressTrackId: string | null;
  status: UnitProgressStatus;
  outcome: UnitSetOutcome;
  totalSets: number;
  completedSets: number;
  skippedSets: number;
  pendingSets: number;
  extraSets: number;
  setSummary: UnitSetSummary;
  sets: Array<{
    set_index: number;
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
    status: string;
    is_extra_set: boolean;
  }>;
};

type StoredSetBasedResult = {
  outcome: ProgressTrackOutcomeKind | null;
  completedRepsTotal: number;
  completedDurationTotal: number;
};

function toOptionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toOutcome(value: unknown): ProgressTrackOutcomeKind | null {
  if (
    value === "success_met" ||
    value === "success_unmet" ||
    value === "partial" ||
    value === "failed" ||
    value === "skipped"
  ) {
    return value;
  }
  return null;
}

function toPositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function parseStoredSetBasedResult(resultFlags: unknown): StoredSetBasedResult {
  const root = toRecord(resultFlags);
  const setBased = toRecord(root.set_based_v1);
  return {
    outcome: toOutcome(setBased.outcome),
    completedRepsTotal: toPositiveNumber(setBased.completed_reps_total),
    completedDurationTotal: toPositiveNumber(setBased.completed_duration_total),
  };
}

function extractAiAnchorMeta(targetPayload: unknown) {
  const payload = toRecord(targetPayload);
  const aiAnchor = toRecord(payload.ai_anchor);
  if (aiAnchor.pending_confirmation !== true) {
    return null;
  }
  const exerciseLibraryItemId =
    typeof payload.exercise_library_item_id === "string" ? payload.exercise_library_item_id : null;
  if (!exerciseLibraryItemId) {
    return null;
  }
  return {
    exerciseLibraryItemId,
    recordingMode: typeof payload.record_mode === "string" ? payload.record_mode : null,
    loadModel: typeof payload.load_model === "string" ? payload.load_model : null,
    logicSignature:
      typeof aiAnchor.logic_signature === "string" ? aiAnchor.logic_signature : null,
  };
}

function deriveConfirmedAnchor(unit: UnitProgressSummary, targetPayload: unknown) {
  const payload = toRecord(targetPayload);
  const loadModel = typeof payload.load_model === "string" ? payload.load_model : "external";
  const recordingMode =
    typeof payload.recording_mode === "string"
      ? payload.recording_mode
      : typeof payload.record_mode === "string"
        ? payload.record_mode
        : null;
  const firstCompletedSet =
    unit.sets.find((setRow) => setRow.status === "completed" && !setRow.is_extra_set) ??
    unit.sets.find((setRow) => setRow.status === "completed") ??
    null;
  const normalizedSets = normalizeTrainingUnitSets(payload.set_structure);
  const setCount =
    normalizedSets.filter((set) => set.participates_in_progression !== false).length ||
    normalizedSets.length ||
    unit.sets.filter((setRow) => !setRow.is_extra_set).length ||
    unit.sets.length ||
    null;

  const reps =
    firstCompletedSet?.actual_reps ??
    firstCompletedSet?.planned_reps ??
    (typeof payload.reps === "number" ? payload.reps : null);
  const durationSeconds = typeof payload.duration_seconds === "number" ? payload.duration_seconds : null;
  const actualWeightText = firstCompletedSet?.actual_weight ?? firstCompletedSet?.planned_weight ?? null;
  const numericWeight =
    actualWeightText && actualWeightText.trim().length > 0 ? Number(actualWeightText) : null;
  const loadValue =
    loadModel === "external" && numericWeight !== null && Number.isFinite(numericWeight)
      ? numericWeight
      : typeof payload.load_value === "number"
        ? payload.load_value
        : null;
  const assisted = isAssistedActionEntryMode(recordingMode);
  const assistWeight =
    loadModel === "bodyweight_plus_external" && assisted
      ? numericWeight !== null && Number.isFinite(numericWeight)
        ? numericWeight
        : typeof payload.assist_weight === "number"
          ? payload.assist_weight
          : typeof payload.additional_load_value === "number"
            ? payload.additional_load_value
            : null
      : null;
  const additionalLoadValue =
    loadModel === "bodyweight_plus_external" && !assisted
      ? numericWeight !== null && Number.isFinite(numericWeight)
        ? numericWeight
        : typeof payload.additional_load_value === "number"
          ? payload.additional_load_value
          : null
      : null;
  const actualRpeText = firstCompletedSet?.actual_rpe ?? firstCompletedSet?.planned_rpe ?? null;
  const actualRpe =
    actualRpeText && actualRpeText.trim().length > 0 ? Number(actualRpeText) : null;
  const recommendedRir =
    actualRpe !== null && Number.isFinite(actualRpe)
      ? Number(Math.max(0, Math.min(5, 10 - actualRpe)).toFixed(1))
      : null;
  const restSeconds =
    firstCompletedSet?.planned_rest_seconds ??
    (typeof payload.rest_seconds === "number" ? payload.rest_seconds : null);
  const tempo = (() => {
    const source =
      firstCompletedSet?.planned_tempo ??
      (typeof payload.tempo === "string" ? payload.tempo : null);
    if (!source || source.trim().length === 0) {
      return null;
    }
    const parsed = source
      .split("-")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
    return parsed.length === 4 ? (parsed as [number, number, number, number]) : null;
  })();
  const setStructure =
    normalizedSets.length > 0
      ? applyActionEntryAnchorSummaryToSetStructure({
          recordingMode,
          recordMode:
            typeof payload.record_mode === "string" && payload.record_mode === "sets_time"
              ? "sets_time"
              : "sets_reps",
          loadModel:
            loadModel === "bodyweight_plus_external" ? "bodyweight_plus_external" : "external",
          baseSetStructure: normalizedSets,
          summary: {
            setCount: setCount ?? undefined,
            reps: reps ?? undefined,
            durationSeconds: durationSeconds ?? undefined,
            loadValue: loadValue ?? undefined,
            additionalLoadValue: additionalLoadValue ?? undefined,
            assistWeight: assistWeight ?? undefined,
            restSeconds: restSeconds ?? undefined,
            tempo: tempo ?? undefined,
            recommendedRir: recommendedRir ?? undefined,
          },
        })
      : [];

  return {
    recordingMode,
    loadModel,
    setCount,
    loadValue,
    additionalLoadValue,
    assistWeight,
    reps: reps ?? null,
    durationSeconds,
    restSeconds,
    tempo,
    setStructure,
    recommendedRir,
  };
}

function applyConfirmedAnchorToPayload(
  targetPayload: Record<string, unknown>,
  anchor: ReturnType<typeof deriveConfirmedAnchor>,
) {
  const nextPayload = {
    ...targetPayload,
  };

  if (anchor.reps !== null) {
    nextPayload.reps = anchor.reps;
  }
  if (anchor.durationSeconds !== null) {
    nextPayload.duration_seconds = anchor.durationSeconds;
  }
  if (anchor.setCount !== null) {
    nextPayload.sets = anchor.setCount;
  }
  if (anchor.restSeconds !== null) {
    nextPayload.rest_seconds = anchor.restSeconds;
  }
  if (anchor.tempo !== null) {
    nextPayload.tempo = anchor.tempo;
  }
  if (anchor.loadModel === "bodyweight_plus_external") {
    if (anchor.assistWeight !== null) {
      nextPayload.assist_weight = anchor.assistWeight;
      nextPayload.additional_load_value = anchor.assistWeight;
    } else {
      delete nextPayload.assist_weight;
      nextPayload.additional_load_value = anchor.additionalLoadValue;
    }
  } else {
    nextPayload.load_value = anchor.loadValue;
  }

  const targetRpe =
    anchor.recommendedRir !== null
      ? Number(Math.max(6, Math.min(10, 10 - anchor.recommendedRir)).toFixed(1))
      : null;
  if (targetRpe !== null) {
    nextPayload.rpe_min = targetRpe;
    nextPayload.rpe_max = targetRpe;
  }

  if (anchor.setStructure.length > 0) {
    nextPayload.set_structure = anchor.setStructure;
  }

  const aiAnchor = toRecord(nextPayload.ai_anchor);
  nextPayload.ai_anchor = {
    ...aiAnchor,
    pending_confirmation: false,
    confirmed_at: new Date().toISOString(),
  };

  return nextPayload as Prisma.InputJsonValue;
}

function summarizeUnitStatus(
  totalSets: number,
  completedSets: number,
  skippedSets: number,
): UnitProgressStatus {
  if (totalSets === 0) {
    return "pending";
  }

  if (completedSets === totalSets) {
    return "completed";
  }

  if (skippedSets === totalSets) {
    return "skipped";
  }

  if (completedSets > 0 || skippedSets > 0) {
    return "in_progress";
  }

  return "pending";
}

function mapOutcomeToUnitExecutionCompletion(
  outcome: UnitSetOutcome,
): UnitExecutionCompletionStatus {
  if (outcome === "success_met") {
    return "completed";
  }
  if (outcome === "skipped") {
    return "skipped";
  }
  if (outcome === "failed") {
    return "failed";
  }
  return "partial";
}

function mapToSessionCompletionStatus(outcomes: UnitSetOutcome[]): SessionExecutionCompletionStatus {
  if (outcomes.length === 0) {
    return "partial";
  }

  if (outcomes.every((outcome) => outcome === "success_met")) {
    return "completed";
  }

  if (outcomes.every((outcome) => outcome === "skipped")) {
    return "skipped";
  }

  return "partial";
}

function summarizeUnitOutcomeFromSets(summary: UnitSetSummary): UnitSetOutcome {
  const outcome = classifyTrackOutcomeFromSetSummary(summary);
  if (outcome === "success_met" || outcome === "partial" || outcome === "failed" || outcome === "skipped") {
    return outcome;
  }
  return "partial";
}

export async function finalizeSessionExecutionFromSetsUseCase(
  rawInput: FinalizeSessionExecutionFromSetsInput,
) {
  const input = FinalizeSessionExecutionFromSetsInputSchema.parse(rawInput);

  const sessionExecution = await getSessionExecutionByIdForUser(
    input.sessionExecutionId,
    input.userId,
  );
  if (!sessionExecution) {
    throw notFoundError("Session execution not found");
  }

  const detail = await getSessionExecutionDetailUseCase({
    userId: input.userId,
    sessionExecutionId: input.sessionExecutionId,
  });

  const unitSummaries: UnitProgressSummary[] = detail.units.map((unit) => {
    const setSummary = summarizeUnitFromExecutionSets({
      sets: unit.sets,
      targetPayload: unit.planned_unit.target_payload,
    });

    const status = summarizeUnitStatus(
      unit.sets.length,
      unit.sets.filter((setRow) => setRow.status === "completed").length,
      unit.sets.filter((setRow) => setRow.status === "skipped").length,
    );

    const outcome = summarizeUnitOutcomeFromSets(setSummary);

    return {
      plannedUnitId: unit.planned_unit.id,
      sequenceNo: unit.planned_unit.sequence_no,
      exerciseName: unit.planned_unit.selected_exercise_name,
      unitTemplateId: unit.planned_unit.unit_template_id,
      progressTrackId: unit.planned_unit.progress_track_id,
      status,
      outcome,
      totalSets: unit.sets.length,
      completedSets: unit.sets.filter((setRow) => setRow.status === "completed").length,
      skippedSets: unit.sets.filter((setRow) => setRow.status === "skipped").length,
      pendingSets: Math.max(
        0,
        unit.sets.length -
          unit.sets.filter((setRow) => setRow.status === "completed").length -
          unit.sets.filter((setRow) => setRow.status === "skipped").length,
      ),
      extraSets: unit.sets.filter((setRow) => setRow.is_extra_set).length,
      setSummary,
      sets: unit.sets.map((setRow) => ({
        set_index: setRow.set_index,
        planned_reps: setRow.planned_reps,
        planned_weight: setRow.planned_weight,
        planned_rpe: setRow.planned_rpe,
        planned_rest_seconds: setRow.planned_rest_seconds,
        planned_tempo: setRow.planned_tempo,
        actual_reps: setRow.actual_reps,
        actual_weight: setRow.actual_weight,
        actual_rpe: setRow.actual_rpe,
        actual_rest_seconds: setRow.actual_rest_seconds,
        actual_tempo: setRow.actual_tempo,
        status: setRow.status,
        is_extra_set: setRow.is_extra_set,
      })),
    };
  });

  const totalSets = unitSummaries.reduce((sum, item) => sum + item.totalSets, 0);
  const completedSets = unitSummaries.reduce((sum, item) => sum + item.completedSets, 0);
  const skippedSets = unitSummaries.reduce((sum, item) => sum + item.skippedSets, 0);
  const pendingSets = unitSummaries.reduce((sum, item) => sum + item.pendingSets, 0);
  const extraSets = unitSummaries.reduce((sum, item) => sum + item.extraSets, 0);

  const totalUnits = unitSummaries.length;
  const completedUnits = unitSummaries.filter((item) => item.outcome === "success_met").length;
  const skippedUnits = unitSummaries.filter((item) => item.outcome === "skipped").length;
  const inProgressUnits = unitSummaries.filter((item) => item.status === "in_progress").length;
  const pendingUnits = unitSummaries.filter((item) => item.status === "pending").length;

  const sessionCompletionStatus = mapToSessionCompletionStatus(
    unitSummaries.map((item) => item.outcome),
  );

  const existingUnitExecutionCount = await countUnitExecutionsBySessionExecution(
    input.sessionExecutionId,
  );

  const existingCompatRows = await listUnitExecutionsForSetCompatBySessionExecution(
    input.sessionExecutionId,
  );
  const existingByPlannedUnitId = new Map(
    existingCompatRows
      .filter((row) => row.planned_unit_id)
      .map((row) => [row.planned_unit_id as string, row]),
  );

  const recoveryPolicyType: RecoveryPolicyType = detail.session.program_id
    ? (await getProgramById(detail.session.program_id, input.userId))
        ?.default_recovery_policy_type ?? "preserve_order"
    : "preserve_order";

  const trackIds = Array.from(
    new Set(
      unitSummaries
        .map((unit) => unit.progressTrackId)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  if (trackIds.length > 0) {
    const trackRecords = await listProgressTracksByIds(trackIds);
    const trackById = new Map(trackRecords.map((track) => [track.id, track]));

    const unitTemplateIds = Array.from(
      new Set(
        unitSummaries
          .map((unit) => unit.unitTemplateId)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );
    const unitRoleRecords = await listTrainingUnitTemplateRolesByIds(unitTemplateIds);
    const unitRoleByTemplateId = new Map(unitRoleRecords.map((item) => [item.id, item.unit_role]));

    const runtimeByTrackId = new Map<
      string,
      {
        nextState: ProgressTrackState;
        exposureDelta: number;
        successDelta: number;
        failureDelta: number;
        lastExposureAt: Date | null;
        lastSuccessAt: Date | null;
        lastFailureAt: Date | null;
      }
    >();

    for (const unit of unitSummaries) {
      if (!unit.progressTrackId) {
        continue;
      }

      const track = trackById.get(unit.progressTrackId);
      if (!track) {
        continue;
      }

      const existingRuntime = runtimeByTrackId.get(unit.progressTrackId);
      const trackRuntime =
        existingRuntime ??
        {
          nextState:
            typeof track.current_state === "object" && track.current_state !== null && !Array.isArray(track.current_state)
              ? ({ ...(track.current_state as Record<string, unknown>) } as ProgressTrackState)
              : ({} as ProgressTrackState),
          exposureDelta: 0,
          successDelta: 0,
          failureDelta: 0,
          lastExposureAt: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        };

      const existingCompat = existingByPlannedUnitId.get(unit.plannedUnitId);
      const previousSetResult = parseStoredSetBasedResult(existingCompat?.result_flags);
      const previousOutcome = previousSetResult.outcome;
      const nextOutcome = unit.outcome;
      const unitRole = unit.unitTemplateId
        ? unitRoleByTemplateId.get(unit.unitTemplateId) ?? "accessory"
        : "accessory";

      const delta = buildProgressTrackOutcomeDelta({
        previousOutcome,
        nextOutcome: nextOutcome as ProgressTrackOutcomeKind,
        recoveryPolicy: recoveryPolicyType,
        unitRole,
        currentState: trackRuntime.nextState,
        setSummary: unit.setSummary,
        setAggregateDelta: {
          completedRepsDelta:
            unit.setSummary.completedRepsTotal - previousSetResult.completedRepsTotal,
          completedDurationDelta:
            unit.setSummary.completedDurationTotal - previousSetResult.completedDurationTotal,
        },
        now: new Date(),
      });

      trackRuntime.nextState = delta.nextState;
      trackRuntime.exposureDelta += delta.exposureDelta;
      trackRuntime.successDelta += delta.successDelta;
      trackRuntime.failureDelta += delta.failureDelta;
      if (delta.lastExposureAt) {
        trackRuntime.lastExposureAt = delta.lastExposureAt;
      }
      if (delta.lastSuccessAt) {
        trackRuntime.lastSuccessAt = delta.lastSuccessAt;
      }
      if (delta.lastFailureAt) {
        trackRuntime.lastFailureAt = delta.lastFailureAt;
      }

      runtimeByTrackId.set(unit.progressTrackId, trackRuntime);
    }

    const updates = Array.from(runtimeByTrackId.entries()).map(([trackId, runtime]) => ({
      id: trackId,
      current_state: runtime.nextState as Prisma.InputJsonValue,
      exposure_delta: runtime.exposureDelta,
      success_delta: runtime.successDelta,
      failure_delta: runtime.failureDelta,
      last_exposure_at: runtime.lastExposureAt,
      last_success_at: runtime.lastSuccessAt,
      last_failure_at: runtime.lastFailureAt,
    }));

    if (updates.length > 0) {
      await applyProgressTrackOutcomeUpdates(updates);
    }
  }

  await upsertUnitExecutionCompatRows(
    unitSummaries.map((unit) => ({
      session_execution_id: input.sessionExecutionId,
      planned_unit_id: unit.plannedUnitId,
      unit_template_id: unit.unitTemplateId ?? undefined,
      progress_track_id: unit.progressTrackId ?? undefined,
      sequence_no: unit.sequenceNo,
      completion_status: mapOutcomeToUnitExecutionCompletion(unit.outcome),
      actual_unit_name: unit.exerciseName ?? undefined,
      actual_payload: {
        source: "execution_sets_single_source_v3",
        set_level_summary: {
          planned_set_count: unit.setSummary.plannedSetCount,
          completed_planned_count: unit.setSummary.completedPlannedCount,
          skipped_planned_count: unit.setSummary.skippedPlannedCount,
          pending_planned_count: unit.setSummary.pendingPlannedCount,
          completion_ratio: unit.setSummary.completionRatio,
          core_set_count: unit.setSummary.coreSetCount,
          core_set_failed: unit.setSummary.coreSetFailed,
          all_skipped: unit.setSummary.allSkipped,
          meets_target: unit.setSummary.meetsTarget,
          extra_set_count: unit.setSummary.extraSetCount,
          completed_extra_set_count: unit.setSummary.completedExtraSetCount,
          completed_reps_total: unit.setSummary.completedRepsTotal,
          completed_duration_total: unit.setSummary.completedDurationTotal,
        },
      } as Prisma.InputJsonValue,
      result_flags: {
        set_based_v1: {
          source: "execution_sets_single_source_v3",
          outcome: unit.outcome,
          planned_set_count: unit.setSummary.plannedSetCount,
          completed_planned_count: unit.setSummary.completedPlannedCount,
          skipped_planned_count: unit.setSummary.skippedPlannedCount,
          pending_planned_count: unit.setSummary.pendingPlannedCount,
          completion_ratio: unit.setSummary.completionRatio,
          core_set_count: unit.setSummary.coreSetCount,
          core_set_failed: unit.setSummary.coreSetFailed,
          all_skipped: unit.setSummary.allSkipped,
          meets_target: unit.setSummary.meetsTarget,
          extra_set_count: unit.setSummary.extraSetCount,
          completed_extra_set_count: unit.setSummary.completedExtraSetCount,
          completed_reps_total: unit.setSummary.completedRepsTotal,
          completed_duration_total: unit.setSummary.completedDurationTotal,
        },
      } as Prisma.InputJsonValue,
      set_logs: unit.sets.map((setRow) => ({
        set_index: setRow.set_index,
        planned_reps: setRow.planned_reps,
        planned_weight: toOptionalNumber(setRow.planned_weight),
        planned_rpe: toOptionalNumber(setRow.planned_rpe),
        planned_rest_seconds: setRow.planned_rest_seconds,
        planned_tempo: setRow.planned_tempo,
        actual_reps: setRow.actual_reps,
        actual_weight: toOptionalNumber(setRow.actual_weight),
        actual_rpe: toOptionalNumber(setRow.actual_rpe),
        actual_rest_seconds: setRow.actual_rest_seconds,
        actual_tempo: setRow.actual_tempo,
        status: setRow.status,
        is_extra_set: setRow.is_extra_set,
      })) as Prisma.InputJsonValue,
      notes: "auto_generated_from_execution_sets_finalize_v3",
    })),
  );

  if (detail.session.planned_session_id && unitSummaries.length > 0) {
    await updatePlannedUnitStatusByIds(
      detail.session.planned_session_id,
      unitSummaries.map((unit) => ({
        plannedUnitId: unit.plannedUnitId,
        status: mapUnitExecutionCompletionToUnitState(
          mapOutcomeToUnitExecutionCompletion(unit.outcome),
        ),
      })),
    );

    const updatedUnitStates = await listPlannedUnitStates(detail.session.planned_session_id);
    const nextSessionState = derivePlannedSessionStateFromPlannedUnits(
      updatedUnitStates.map((unit) => unit.status),
    );
    await updatePlannedSessionStatus(
      detail.session.planned_session_id,
      input.userId,
      nextSessionState,
    );
  }

  const updatedSessionExecution = await updateSessionExecutionUseCase({
    userId: input.userId,
    sessionExecutionId: input.sessionExecutionId,
    completionStatus: sessionCompletionStatus,
    actualDurationMin: input.actualDurationMin,
    notes: input.notes,
  });

  const aiAnchorUpserts = detail.units
    .map((unit, index) => {
      const aiMeta = extractAiAnchorMeta(unit.planned_unit.target_payload);
      if (!aiMeta) {
        return null;
      }
      const summary = unitSummaries[index];
      const anchor = deriveConfirmedAnchor(summary, unit.planned_unit.target_payload);
      return {
        exerciseLibraryItemId: aiMeta.exerciseLibraryItemId,
        exerciseName: unit.planned_unit.selected_exercise_name,
        ...anchor,
        logicSignature: aiMeta.logicSignature,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (aiAnchorUpserts.length > 0) {
    await Promise.all(
      aiAnchorUpserts.map((item) =>
        upsertActionEntryAnchorByUser({
          user_id: input.userId,
          exercise_library_item_id: item.exerciseLibraryItemId,
          exercise_name: item.exerciseName ?? null,
          recording_mode: item.recordingMode,
          load_model: item.loadModel,
          set_count: item.setCount,
          load_value: item.loadValue,
          additional_load_value: item.additionalLoadValue,
          assist_weight: item.assistWeight,
          reps: item.reps,
          duration_seconds: item.durationSeconds,
          rest_seconds: item.restSeconds,
          tempo: item.tempo,
          set_structure: item.setStructure,
          recommended_rir: item.recommendedRir,
          logic_signature: item.logicSignature,
          source: "ai_confirmed",
          confirmed_at: new Date().toISOString(),
          last_performed_at:
            detail.session.performed_at instanceof Date
              ? detail.session.performed_at.toISOString()
              : detail.session.performed_at,
        }),
      ),
    );
  }

  const confirmedTemplatePayloadUpdates = detail.units
    .map((unit, index) => {
      const aiMeta = extractAiAnchorMeta(unit.planned_unit.target_payload);
      if (!aiMeta || !unit.planned_unit.unit_template_id) {
        return null;
      }
      const summary = unitSummaries[index];
      const anchor = deriveConfirmedAnchor(summary, unit.planned_unit.target_payload);
      return {
        unitTemplateId: unit.planned_unit.unit_template_id,
        nextPayload: applyConfirmedAnchorToPayload(
          toRecord(unit.planned_unit.target_payload),
          anchor,
        ),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (confirmedTemplatePayloadUpdates.length > 0) {
    await Promise.all(
      confirmedTemplatePayloadUpdates.map((item) =>
        updateTrainingUnitTemplateById(item.unitTemplateId, {
          prescription_payload: item.nextPayload,
        }),
      ),
    );
  }

  let refreshedFutureSessionsCount = 0;

  if (
    aiAnchorUpserts.length > 0 &&
    detail.session.program_id &&
    detail.session.planned_session_id &&
    detail.session.planned_session?.sequence_index
  ) {
    const futureSessions =
      await listFutureUnresolvedPlannedSessionsByProgramFromSequenceForRegeneration(
        detail.session.program_id,
        input.userId,
        detail.session.planned_session.sequence_index,
      );

    if (futureSessions.length > 0) {
      refreshedFutureSessionsCount = futureSessions.length;
      await generatePlannedSessionsUseCase({
        userId: input.userId,
        programId: detail.session.program_id,
        startDate: futureSessions[0].session_date,
        sessionCount: futureSessions.length,
        replaceFutureUnexecuted: true,
        schedulingMode: "ordered_daily",
        generationReason: "adapted",
        sessionDateSequence: futureSessions.map((item) => item.session_date),
        sessionTemplateCodeSequence: futureSessions.map(
          (item) => item.session_template?.code ?? "",
        ),
      });
    }
  }

  return {
    sessionExecution: {
      id: updatedSessionExecution.id,
      completionStatus: updatedSessionExecution.completion_status,
      actualDurationMin: updatedSessionExecution.actual_duration_min,
      notes: updatedSessionExecution.notes,
    },
    summary: {
      sessionCompletionStatus,
      totals: {
        totalUnits,
        completedUnits,
        inProgressUnits,
        pendingUnits,
        skippedUnits,
        totalSets,
        completedSets,
        skippedSets,
        pendingSets,
        extraSets,
      },
      units: unitSummaries.map((unit) => ({
        plannedUnitId: unit.plannedUnitId,
        sequenceNo: unit.sequenceNo,
        exerciseName: unit.exerciseName,
        status: unit.status,
        outcome: unit.outcome,
        totalSets: unit.totalSets,
        completedSets: unit.completedSets,
        skippedSets: unit.skippedSets,
        pendingSets: unit.pendingSets,
        extraSets: unit.extraSets,
      })),
      generatedUnitExecutions: existingUnitExecutionCount === 0 && unitSummaries.length > 0,
      existingUnitExecutionCount,
      aiFollowup:
        aiAnchorUpserts.length > 0
          ? {
              confirmedAnchors: aiAnchorUpserts.length,
              refreshedFutureSessions: refreshedFutureSessionsCount,
            }
          : undefined,
    },
  };
}
