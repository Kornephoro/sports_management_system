import { Prisma } from "@prisma/client";
import { z } from "zod";

import { inferRecordingModeFromUnit } from "@/lib/recording-mode-standards";
import { normalizeTrainingUnitSets } from "@/lib/training-set-standards";
import {
  createSessionExecutionWithSets,
  getActiveSessionExecutionByPlannedSessionForUser,
  getPlannedSessionWithUnitsById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const CreateSessionExecutionInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
  performedAt: z.coerce.date().default(() => new Date()),
  completionStatus: z.enum(["completed", "partial", "skipped", "aborted", "extra"]).optional(),
  overallFeeling: z.enum(["easy", "normal", "hard"]).default("normal"),
  actualDurationMin: z.number().int().positive().optional(),
  sessionRpe: z.number().min(0).max(10).optional(),
  preSessionState: z.unknown().optional(),
  postSessionState: z.unknown().optional(),
  deviationReason: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateSessionExecutionInput = z.infer<typeof CreateSessionExecutionInputSchema>;
export type CreateSessionExecutionInputPayload = z.input<typeof CreateSessionExecutionInputSchema>;

type CreateSessionExecutionUseCaseResult = {
  sessionExecution: {
    id: string;
    planned_session_id: string | null;
    completion_status: string;
    performed_at: Date;
    actual_duration_min: number | null;
    notes: string | null;
  };
  reusedExisting: boolean;
};

const ALLOWED_SET_INIT_RECORDING_MODES = new Set([
  "strength",
  "reps_only",
  "duration",
  "bodyweight_load",
  "assisted",
]);

function toObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function toNonNegativeInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function toNonNegativeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toRepsNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.trunc(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.trunc(parsed));
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const min = toPositiveInteger(record.min);
    if (min !== null) {
      return min;
    }
  }
  return null;
}

function toTempoString(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const parsed = value.map((item) => toNonNegativeInteger(item));
  if (parsed.some((item) => item === null)) {
    return undefined;
  }
  return parsed.join("-");
}

function buildSetSeedsFromStructure(
  plannedUnitId: string,
  targetPayload: Record<string, unknown>,
) {
  const setStructure = Array.isArray(targetPayload.set_structure)
    ? targetPayload.set_structure.filter((item) => typeof item === "object" && item !== null)
    : [];

  if (setStructure.length === 0) {
    return [] as Array<{
      planned_unit_id: string;
      set_index: number;
      planned_set_type?: string;
      planned_reps?: number;
      planned_weight?: number;
      planned_rpe?: number;
      planned_rest_seconds?: number;
      planned_tempo?: string;
      status: "pending";
      is_extra_set: boolean;
    }>;
  }

  const loadModel = toOptionalString(targetPayload.load_model);
  const fallbackWeight =
    toNonNegativeNumber(targetPayload.load_value) ??
    toNonNegativeNumber(targetPayload.additional_load_value);
  const fallbackRpe =
    toNonNegativeNumber(targetPayload.rpe_max) ??
    toNonNegativeNumber(targetPayload.rpe_min);
  const fallbackRest = toNonNegativeInteger(targetPayload.rest_seconds);
  const fallbackTempo = toOptionalString(targetPayload.tempo);

  return setStructure.map((rawSet, index) => {
    const setItem = toObject(rawSet);
    const setType = toOptionalString(setItem.type);
    const weightMode = toOptionalString(setItem.weight_mode);
    const mappedWeight =
      weightMode === "relative_to_working"
        ? undefined
        : toNonNegativeNumber(setItem.weight) ??
          (loadModel === "bodyweight_plus_external"
            ? toNonNegativeNumber(setItem.assist_weight)
            : undefined) ??
          fallbackWeight;

    return {
      planned_unit_id: plannedUnitId,
      set_index: index + 1,
      planned_set_type: setType,
      planned_reps: toRepsNumber(setItem.reps) ?? undefined,
      planned_weight: mappedWeight ?? undefined,
      planned_rpe: toNonNegativeNumber(setItem.rpe) ?? fallbackRpe ?? undefined,
      planned_rest_seconds:
        toNonNegativeInteger(setItem.rest_seconds) ?? fallbackRest ?? undefined,
      planned_tempo: toTempoString(setItem.tempo) ?? fallbackTempo,
      status: "pending" as const,
      is_extra_set: false,
    };
  });
}

function inferRecordingMode(targetPayload: Record<string, unknown>) {
  const explicit = toOptionalString(targetPayload.recording_mode);
  if (explicit) {
    return explicit;
  }

  const prescriptionType = toOptionalString(targetPayload.prescription_type);
  const recordMode =
    prescriptionType === "sets_time" ||
    toOptionalString(targetPayload.record_mode) === "sets_time" ||
    toPositiveInteger(targetPayload.duration_seconds) !== null
      ? "sets_time"
      : "sets_reps";
  const loadModel =
    toOptionalString(targetPayload.load_model) === "bodyweight_plus_external"
      ? "bodyweight_plus_external"
      : "external";
  const sets = normalizeTrainingUnitSets(targetPayload.set_structure);

  return inferRecordingModeFromUnit({
    recordingMode: explicit ?? null,
    recordMode,
    loadModel,
    sets,
  });
}

export async function createSessionExecutionUseCase(rawInput: CreateSessionExecutionInputPayload) {
  const input = CreateSessionExecutionInputSchema.parse(rawInput);

  const plannedSession = await getPlannedSessionWithUnitsById(input.plannedSessionId, input.userId);
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }
  const activeExecution = await getActiveSessionExecutionByPlannedSessionForUser(
    plannedSession.id,
    input.userId,
  );
  if (activeExecution) {
    return {
      sessionExecution: {
        id: activeExecution.id,
        planned_session_id: activeExecution.planned_session_id,
        completion_status: activeExecution.completion_status,
        performed_at: activeExecution.performed_at,
        actual_duration_min: activeExecution.actual_duration_min,
        notes: activeExecution.notes,
      },
      reusedExisting: true,
    } satisfies CreateSessionExecutionUseCaseResult;
  }

  const mergedPostSessionState = {
    ...(typeof input.postSessionState === "object" && input.postSessionState !== null
      ? (input.postSessionState as Record<string, unknown>)
      : {}),
    overall_feeling: input.overallFeeling,
  };

  const executionSetSeeds = plannedSession.planned_units.flatMap((unit) => {
    const targetPayload = toObject(unit.target_payload);
    const inferredRecordingMode = inferRecordingMode(targetPayload);
    if (!inferredRecordingMode || !ALLOWED_SET_INIT_RECORDING_MODES.has(inferredRecordingMode)) {
      return [];
    }

    const setSeedsFromStructure = buildSetSeedsFromStructure(unit.id, targetPayload);
    if (setSeedsFromStructure.length > 0) {
      return setSeedsFromStructure;
    }

    const plannedSets = toPositiveInteger(targetPayload.sets);
    if (plannedSets === null) {
      return [];
    }

    const setCount = Math.max(1, plannedSets);
    const plannedReps = toPositiveInteger(targetPayload.reps);
    const plannedWeight =
      toNonNegativeNumber(targetPayload.load_value) ??
      toNonNegativeNumber(targetPayload.additional_load_value);
    const plannedRpe =
      toNonNegativeNumber(targetPayload.rpe_max) ??
      toNonNegativeNumber(targetPayload.rpe_min);
    const plannedRestSeconds = toNonNegativeInteger(targetPayload.rest_seconds);
    const plannedTempo = toOptionalString(targetPayload.tempo);
    const perSetTypes = Array.isArray(targetPayload.set_types)
      ? targetPayload.set_types.map((value) => toOptionalString(value))
      : null;
    const defaultSetType = toOptionalString(targetPayload.set_type);

    return Array.from({ length: setCount }).map((_, index) => ({
      planned_unit_id: unit.id,
      set_index: index + 1,
      planned_set_type: perSetTypes?.[index] ?? defaultSetType,
      planned_reps: plannedReps ?? undefined,
      planned_weight: plannedWeight ?? undefined,
      planned_rpe: plannedRpe ?? undefined,
      planned_rest_seconds: plannedRestSeconds ?? undefined,
      planned_tempo: plannedTempo,
      status: "pending" as const,
      is_extra_set: false,
    }));
  });

  const sessionExecution = await createSessionExecutionWithSets({
    user_id: input.userId,
    planned_session_id: plannedSession.id,
    program_id: plannedSession.program_id,
    block_id: plannedSession.block_id ?? undefined,
    performed_at: input.performedAt,
    // 执行开始时先写占位 partial，结束训练时由 execution_sets 汇总回写最终状态
    completion_status: "partial",
    actual_duration_min: input.actualDurationMin,
    session_rpe: input.sessionRpe,
    pre_session_state: input.preSessionState as Prisma.InputJsonValue | undefined,
    post_session_state: mergedPostSessionState as Prisma.InputJsonValue,
    deviation_reason: input.deviationReason,
    notes: input.notes,
  }, executionSetSeeds);

  return {
    sessionExecution: {
      id: sessionExecution.id,
      planned_session_id: sessionExecution.planned_session_id,
      completion_status: sessionExecution.completion_status,
      performed_at: sessionExecution.performed_at,
      actual_duration_min: sessionExecution.actual_duration_min,
      notes: sessionExecution.notes,
    },
    reusedExisting: false,
  } satisfies CreateSessionExecutionUseCaseResult;
}
