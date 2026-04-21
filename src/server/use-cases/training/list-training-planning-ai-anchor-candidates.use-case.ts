import { z } from "zod";

import {
  getActionEntryAnchorByUserAndExercise,
  getExerciseLibraryItemByIdForUser,
  getTemplateLibraryItemByIdForUser,
  getTemplatePackageByIdForUser,
  listRecentSessionExecutionsByUser,
} from "@/server/repositories";
import { normalizeProgressionConfig } from "@/server/services/progression/progression-config.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";
import { deriveActionEntryAnchorSummary } from "@/lib/action-entry-anchor";

const ListTrainingPlanningAiAnchorCandidatesInputSchema = z.object({
  userId: UuidLikeSchema,
  packageId: UuidLikeSchema,
});

export type ListTrainingPlanningAiAnchorCandidatesInput = z.input<
  typeof ListTrainingPlanningAiAnchorCandidatesInputSchema
>;

type CandidateReason = "never_used" | "long_gap" | "logic_changed";

type TargetRef = {
  dayId: string;
  dayCode: string;
  unitSequenceNo: number;
  exerciseName: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : null;
}

function extractExerciseLibraryItemId(payload: unknown) {
  const record = toRecord(payload);
  return typeof record.exercise_library_item_id === "string"
    ? record.exercise_library_item_id
    : null;
}

function extractLogicHint(progressionSnapshot: unknown) {
  const record = toRecord(progressionSnapshot);
  return {
    policyType:
      typeof record.policy_type === "string" && record.policy_type.trim().length > 0
        ? record.policy_type.trim()
        : null,
    family:
      typeof record.progression_family === "string" && record.progression_family.trim().length > 0
        ? record.progression_family.trim()
        : null,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildLogicSignature(value: unknown) {
  return stableStringify(value);
}

function daysBetween(dateText: string, now = new Date()) {
  const then = new Date(dateText);
  const diffMs = now.getTime() - then.getTime();
  if (!Number.isFinite(diffMs)) return null;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function chooseReason(args: {
  lastPerformedAt: string | null;
  hasHistory: boolean;
  logicChanged: boolean;
}) {
  if (!args.hasHistory) return "never_used" as const;
  if (args.logicChanged) return "logic_changed" as const;
  if (args.lastPerformedAt) {
    const gap = daysBetween(args.lastPerformedAt);
    if (gap !== null && gap > 15) {
      return "long_gap" as const;
    }
  }
  return null;
}

export async function listTrainingPlanningAiAnchorCandidatesUseCase(
  rawInput: ListTrainingPlanningAiAnchorCandidatesInput,
) {
  const input = ListTrainingPlanningAiAnchorCandidatesInputSchema.parse(rawInput);
  const packageRecord = await getTemplatePackageByIdForUser(input.packageId, input.userId);
  if (!packageRecord) {
    throw notFoundError("Template package not found");
  }
  if (packageRecord.days.length === 0) {
    throw badRequestError("当前计划包没有训练日。");
  }

  const templateDays = await Promise.all(
    packageRecord.days.map(async (day) => {
      const template = await getTemplateLibraryItemByIdForUser(day.template_library_item_id, input.userId);
      if (!template) {
        throw badRequestError(`模板缺失：${day.template_library_item_id}`);
      }
      return { day, template };
    }),
  );

  const recentExecutions = await listRecentSessionExecutionsByUser(input.userId, 240, "full");
  const recentHistoryByExercise = new Map<
    string,
    {
      lastPerformedAt: string | null;
      totalExecutions: number;
      latestLoadValue: number | null;
      latestAdditionalLoadValue: number | null;
      latestReps: number | null;
      latestDurationSeconds: number | null;
      latestPolicyType: string | null;
      latestFamily: string | null;
    }
  >();

  for (const execution of recentExecutions) {
    for (const unit of execution.unit_executions) {
      const payload = toRecord(unit.planned_unit?.target_payload);
      const exerciseLibraryItemId = extractExerciseLibraryItemId(payload);
      if (!exerciseLibraryItemId) continue;

      const existing = recentHistoryByExercise.get(exerciseLibraryItemId) ?? {
        lastPerformedAt: null,
        totalExecutions: 0,
        latestLoadValue: null,
        latestAdditionalLoadValue: null,
        latestReps: null,
        latestDurationSeconds: null,
        latestPolicyType: null,
        latestFamily: null,
      };

      if (!existing.lastPerformedAt) {
        const logicHint = extractLogicHint(unit.planned_unit?.progression_snapshot);
        existing.lastPerformedAt = execution.performed_at.toISOString();
        existing.latestLoadValue = toNumber(payload.load_value);
        existing.latestAdditionalLoadValue = toNumber(payload.additional_load_value);
        existing.latestReps = toNumber(payload.reps);
        existing.latestDurationSeconds = toNumber(payload.duration_seconds);
        existing.latestPolicyType = logicHint.policyType;
        existing.latestFamily = logicHint.family;
      }
      existing.totalExecutions += 1;
      recentHistoryByExercise.set(exerciseLibraryItemId, existing);
    }
  }

  const groupedCandidates = new Map<
    string,
    {
      exerciseLibraryItemId: string;
      exerciseName: string;
      recordingMode: string | null;
      movementPattern: string | null;
      primaryRegions: string[];
      secondaryRegions: string[];
      category: string | null;
      actionType: string;
      targets: TargetRef[];
      currentLogic: ReturnType<typeof normalizeProgressionConfig>;
      templateAnchorDraft: ReturnType<typeof deriveActionEntryAnchorSummary>;
    }
  >();

  for (const { day, template } of templateDays) {
    const overridesBySequence = new Map(
      day.progression_overrides.map((override) => [override.unit_sequence_no, override] as const),
    );
    for (const unit of template.units) {
      const override = overridesBySequence.get(unit.sequence_no);
      const currentLogic = normalizeProgressionConfig({
        unitRole: override?.unit_role ?? unit.unit_role,
        progressionFamily: override?.progression_family ?? unit.progression_family,
        progressionPolicyType: override?.progression_policy_type ?? unit.progression_policy_type,
        progressionPolicyConfig:
          override?.progression_policy_config ?? unit.progression_policy_config,
        adjustmentPolicyType: override?.adjustment_policy_type ?? unit.adjustment_policy_type,
        adjustmentPolicyConfig:
          override?.adjustment_policy_config ?? unit.adjustment_policy_config,
        successCriteria: override?.success_criteria ?? unit.success_criteria,
        progressTrackKey: override?.progress_track_key ?? unit.progress_track_key,
        progressTrackKeyFallback: unit.progress_track_key,
      });
      const exerciseLibraryItem = await getExerciseLibraryItemByIdForUser(
        unit.exercise_library_item_id,
        input.userId,
      );
      const logicSignature = buildLogicSignature(currentLogic);
      const groupKey = `${unit.exercise_library_item_id}::${logicSignature}`;
      const existing = groupedCandidates.get(groupKey);
      const target: TargetRef = {
        dayId: day.id,
        dayCode: day.day_code,
        unitSequenceNo: unit.sequence_no,
        exerciseName: unit.exercise_name_snapshot,
      };

      if (existing) {
        existing.targets.push(target);
        continue;
      }

        groupedCandidates.set(groupKey, {
          exerciseLibraryItemId: unit.exercise_library_item_id,
          exerciseName: unit.exercise_name_snapshot,
          recordingMode: unit.recording_mode ?? exerciseLibraryItem?.recording_mode ?? null,
        movementPattern: exerciseLibraryItem?.movement_pattern ?? null,
        primaryRegions: exerciseLibraryItem?.primary_regions ?? [],
          secondaryRegions: exerciseLibraryItem?.secondary_regions ?? [],
          category: exerciseLibraryItem?.category ?? null,
          actionType: (() => {
            const recordingMode = unit.recording_mode ?? exerciseLibraryItem?.recording_mode ?? null;
            if (recordingMode === "duration") return "time";
            if (
              recordingMode === "bodyweight_load" ||
              exerciseLibraryItem?.default_load_model === "bodyweight_plus"
            ) {
              return "bodyweight_plus_external";
            }
            if (recordingMode === "reps_only") return "reps_only";
            return "strength";
          })(),
          targets: [target],
          currentLogic,
          templateAnchorDraft: deriveActionEntryAnchorSummary({
            recordingMode: unit.recording_mode ?? exerciseLibraryItem?.recording_mode ?? null,
            recordMode: unit.record_mode,
            loadModel: unit.load_model,
            setStructure: unit.sets,
            fallback: {
              defaultSets: unit.default_sets,
              defaultReps: unit.default_reps,
              defaultDurationSeconds: unit.default_duration_seconds,
              defaultLoadValue: unit.default_load_value,
              defaultAdditionalLoadValue: unit.default_additional_load_value,
              targetRpe:
                unit.rpe_min !== null && unit.rpe_min === unit.rpe_max ? unit.rpe_min : null,
            },
          }),
        });
    }
  }

  const candidates = await Promise.all(
    Array.from(groupedCandidates.values()).map(async (group) => {
      const anchor = await getActionEntryAnchorByUserAndExercise(
        input.userId,
        group.exerciseLibraryItemId,
      );
      const history = recentHistoryByExercise.get(group.exerciseLibraryItemId) ?? null;
      const currentLogicSignature = buildLogicSignature(group.currentLogic);
      const logicChanged = Boolean(
        (anchor?.logic_signature && anchor.logic_signature !== currentLogicSignature) ||
          (!anchor?.logic_signature &&
            history &&
            history.latestPolicyType &&
            history.latestPolicyType !== group.currentLogic.progressionPolicyType),
      );
      const reason = chooseReason({
        lastPerformedAt: history?.lastPerformedAt ?? anchor?.last_performed_at ?? null,
        hasHistory: Boolean(history || anchor),
        logicChanged,
      });

      if (!reason) {
        return null;
      }

      const lastPerformedAt = history?.lastPerformedAt ?? anchor?.last_performed_at ?? null;
      const daysSinceLastPerformed = lastPerformedAt ? daysBetween(lastPerformedAt) : null;

      return {
        key: `${group.exerciseLibraryItemId}::${currentLogicSignature}`,
        trigger: reason as CandidateReason,
        exerciseLibraryItemId: group.exerciseLibraryItemId,
        exerciseName: group.exerciseName,
        recordingMode: group.recordingMode,
        movementPattern: group.movementPattern,
        primaryRegions: group.primaryRegions,
        secondaryRegions: group.secondaryRegions,
        category: group.category,
        actionType: group.actionType,
        targets: group.targets.sort((a, b) => {
          if (a.dayCode !== b.dayCode) return a.dayCode.localeCompare(b.dayCode, "zh-CN");
          return a.unitSequenceNo - b.unitSequenceNo;
        }),
        currentLogic: {
          ...group.currentLogic,
          logicSignature: currentLogicSignature,
        },
        history: {
          lastPerformedAt,
          daysSinceLastPerformed,
          totalExecutions: history?.totalExecutions ?? 0,
          latestKnownLoadValue: anchor?.load_value ?? history?.latestLoadValue ?? null,
          latestKnownAdditionalLoadValue:
            anchor?.additional_load_value ?? history?.latestAdditionalLoadValue ?? null,
          latestKnownReps: anchor?.reps ?? history?.latestReps ?? null,
          latestKnownDurationSeconds:
            anchor?.duration_seconds ?? history?.latestDurationSeconds ?? null,
          latestPolicyType: history?.latestPolicyType ?? null,
          latestProgressionFamily: history?.latestFamily ?? null,
        },
        storedAnchor: anchor
          ? {
              setCount: anchor.set_count,
              loadValue: anchor.load_value,
              additionalLoadValue: anchor.additional_load_value,
              assistWeight: anchor.assist_weight,
              reps: anchor.reps,
              durationSeconds: anchor.duration_seconds,
              restSeconds: anchor.rest_seconds,
              tempo: anchor.tempo,
              setStructure: anchor.set_structure,
              recommendedRir: anchor.recommended_rir,
              logicSignature: anchor.logic_signature,
              source: anchor.source,
              confirmedAt: anchor.confirmed_at,
            }
          : null,
        templateAnchorDraft: group.templateAnchorDraft,
      };
    }),
  );

  return {
    packageId: packageRecord.id,
    packageName: packageRecord.name,
    candidates: candidates
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        const priorityMap: Record<CandidateReason, number> = {
          never_used: 0,
          logic_changed: 1,
          long_gap: 2,
        };
        if (priorityMap[a.trigger] !== priorityMap[b.trigger]) {
          return priorityMap[a.trigger] - priorityMap[b.trigger];
        }
        return a.exerciseName.localeCompare(b.exerciseName, "zh-CN");
      }),
    generatedAt: new Date().toISOString(),
  };
}
