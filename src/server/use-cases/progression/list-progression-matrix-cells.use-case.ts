import { ProgressOutcome } from "@/lib/progression-types";
import { listProgressionMatrixSessionsByUser } from "@/server/repositories";
import {
  classifyTrackOutcomeFromSetSummary,
  summarizeUnitFromExecutionSets,
} from "@/server/services/progression/progression-track-outcome.service";
import {
  addDaysDateOnlyUtc,
  getEndOfDayFromDateOnlyUtc,
  getStartOfTodayInAppTimeZone,
  normalizeDateOnlyUtc,
} from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";
import { z } from "zod";

const ListProgressionMatrixCellsInputSchema = z.object({
  userId: UuidLikeSchema,
  window: z.union([z.literal(7), z.literal(10), z.literal(14)]).default(10),
  includeRecent: z.coerce.boolean().default(true),
  recentCount: z.coerce.number().int().min(0).max(7).default(3),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type ListProgressionMatrixCellsInput = z.input<
  typeof ListProgressionMatrixCellsInputSchema
>;

type UnitOutcome = "success_met" | "partial" | "failed" | "skipped";

type MatrixDeviationItem = {
  key: "sets" | "reps" | "load" | "extra";
  summary: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (value && typeof value === "object" && "toString" in (value as object)) {
    const text = String(value);
    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function formatSigned(value: number) {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function pickCoreSet(
  sets: Array<{
    set_index: number;
    planned_set_type: string | null;
    planned_reps: number | null;
    actual_reps: number | null;
    planned_weight: unknown;
    actual_weight: unknown;
    is_extra_set: boolean;
  }>,
) {
  const nonExtra = sets
    .filter((setRow) => !setRow.is_extra_set)
    .sort((a, b) => a.set_index - b.set_index);
  const coreByType = nonExtra.filter(
    (setRow) => setRow.planned_set_type === "top_set" || setRow.planned_set_type === "working",
  );

  const selected = coreByType[0] ?? nonExtra[0] ?? null;
  if (!selected) {
    return null;
  }

  const plannedWeight = toNumber(selected.planned_weight);
  const actualWeight = toNumber(selected.actual_weight);

  return {
    planned_reps: selected.planned_reps,
    actual_reps: selected.actual_reps,
    planned_weight: plannedWeight,
    actual_weight: actualWeight,
  };
}

function mapOutcomeToActualStatus(outcome: UnitOutcome | null) {
  if (!outcome) {
    return {
      symbol: "-",
      label: "未执行",
    };
  }

  if (outcome === "success_met") {
    return {
      symbol: "✔",
      label: "达标完成",
    };
  }
  if (outcome === "partial") {
    return {
      symbol: "◐",
      label: "部分完成",
    };
  }
  if (outcome === "failed") {
    return {
      symbol: "✖",
      label: "未达标",
    };
  }

  return {
    symbol: "⤼",
    label: "跳过",
  };
}

function resolveImpactHint(args: {
  outcome: UnitOutcome | null;
  snapshot: Record<string, unknown>;
}) {
  if (!args.outcome) {
    return "等待执行后判断";
  }

  const changeReason =
    typeof args.snapshot.change_reason === "string" ? args.snapshot.change_reason : null;
  const meta = toRecord(args.snapshot.meta);
  const holdReason = typeof meta.hold_reason === "string" ? meta.hold_reason : null;
  const retryFlag = meta.retry_flag === true;

  if (args.outcome === "success_met") {
    return "本次达标，下一次可按计划推进";
  }
  if (args.outcome === "skipped") {
    return "本次跳过，下一次通常保持或顺延";
  }
  if (retryFlag || changeReason === "retry_pending" || holdReason === "pending_retry") {
    return "本次将触发重试等待";
  }
  if (changeReason === "hold_no_progress" || holdReason === "not_met") {
    return "本次可能保持不变，待达标后推进";
  }
  if (changeReason === "regression") {
    return "本次失败，可能触发回退或保护性调整";
  }
  return "本次未完全达标，下一次优先稳态完成";
}

function asUnitOutcome(value: ProgressOutcome): UnitOutcome {
  if (value === "success_met" || value === "partial" || value === "failed" || value === "skipped") {
    return value;
  }
  return "partial";
}

function buildDeviationItems(args: {
  plannedSetCount: number;
  completedPlannedCount: number;
  core: {
    planned_reps: number | null;
    actual_reps: number | null;
    planned_weight: number | null;
    actual_weight: number | null;
  } | null;
  extraSetCount: number;
}): MatrixDeviationItem[] {
  const items: MatrixDeviationItem[] = [];

  const setDelta = args.completedPlannedCount - args.plannedSetCount;
  if (args.plannedSetCount > 0 && setDelta !== 0) {
    items.push({
      key: "sets",
      summary: `${formatSigned(setDelta)}组`,
    });
  }

  if (args.core && args.core.planned_reps !== null && args.core.actual_reps !== null) {
    const repsDelta = args.core.actual_reps - args.core.planned_reps;
    if (repsDelta !== 0) {
      items.push({
        key: "reps",
        summary: `${formatSigned(repsDelta)}次`,
      });
    }
  }

  if (args.core && args.core.planned_weight !== null && args.core.actual_weight !== null) {
    const loadDelta = Number((args.core.actual_weight - args.core.planned_weight).toFixed(3));
    if (loadDelta !== 0) {
      items.push({
        key: "load",
        summary: `${formatSigned(loadDelta)}kg`,
      });
    }
  }

  if (args.extraSetCount > 0) {
    items.push({
      key: "extra",
      summary: `+${args.extraSetCount} extra`,
    });
  }

  return items.slice(0, 2);
}

export async function listProgressionMatrixCellsUseCase(
  rawInput: ListProgressionMatrixCellsInput,
) {
  const input = ListProgressionMatrixCellsInputSchema.parse(rawInput);

  const defaultDateFrom = getStartOfTodayInAppTimeZone();
  const defaultDateTo = getEndOfDayFromDateOnlyUtc(addDaysDateOnlyUtc(defaultDateFrom, 180));

  const dateFrom = input.dateFrom ? normalizeDateOnlyUtc(input.dateFrom) : defaultDateFrom;
  const dateTo = input.dateTo
    ? getEndOfDayFromDateOnlyUtc(normalizeDateOnlyUtc(input.dateTo))
    : defaultDateTo;

  if (dateFrom > dateTo) {
    throw badRequestError("dateFrom must be less than or equal to dateTo");
  }

  const sessions = await listProgressionMatrixSessionsByUser({
    userId: input.userId,
    dateFrom,
    dateTo,
    window: input.window,
    includeRecent: input.includeRecent,
    recentCount: input.recentCount,
  });

  return sessions.map((session) => {
    const latestExecution = session.session_executions[0] ?? null;
    type SessionExecutionSetRow = (typeof session.session_executions)[number]["execution_sets"][number];
    const executionSetsByUnitId = new Map<string, SessionExecutionSetRow[]>();

    if (latestExecution) {
      for (const setRow of latestExecution.execution_sets) {
        if (!setRow.planned_unit_id) {
          continue;
        }
        const bucket = executionSetsByUnitId.get(setRow.planned_unit_id) ?? [];
        bucket.push(setRow);
        executionSetsByUnitId.set(setRow.planned_unit_id, bucket);
      }
    }

    return {
      id: session.id,
      session_template_id: session.session_template_id,
      sequence_index: session.sequence_index,
      session_date: session.session_date,
      status: session.status,
      program: session.program,
      latest_execution: latestExecution
        ? {
            id: latestExecution.id,
            completion_status: latestExecution.completion_status,
            performed_at: latestExecution.performed_at,
          }
        : null,
      planned_units: session.planned_units.map((unit) => {
        const snapshot = toRecord(unit.progression_snapshot);
        const snapshotMeta = toRecord(snapshot.meta);
        const sets = (executionSetsByUnitId.get(unit.id) ?? []).sort(
          (a, b) => a.set_index - b.set_index,
        );

        const hasExecutionData = sets.length > 0;
        const summary = hasExecutionData
          ? summarizeUnitFromExecutionSets({
              sets,
              targetPayload: toRecord(unit.target_payload),
            })
          : null;
        const outcome = summary ? asUnitOutcome(classifyTrackOutcomeFromSetSummary(summary)) : null;
        const actualStatus = mapOutcomeToActualStatus(outcome);

        const core = hasExecutionData
          ? pickCoreSet(
              sets.map((setRow) => ({
                set_index: setRow.set_index,
                planned_set_type: setRow.planned_set_type,
                planned_reps: setRow.planned_reps,
                actual_reps: setRow.actual_reps,
                planned_weight: setRow.planned_weight,
                actual_weight: setRow.actual_weight,
                is_extra_set: setRow.is_extra_set,
              })),
            )
          : null;

        const deviationItems = summary
          ? buildDeviationItems({
              plannedSetCount: summary.plannedSetCount,
              completedPlannedCount: summary.completedPlannedCount,
              core,
              extraSetCount: summary.extraSetCount,
            })
          : [];

        const rpeValues = sets
          .filter((setRow) => setRow.status === "completed")
          .map((setRow) => toNumber(setRow.actual_rpe))
          .filter((value): value is number => value !== null);
        const averageActualRpe =
          rpeValues.length > 0
            ? Number((rpeValues.reduce((sum, value) => sum + value, 0) / rpeValues.length).toFixed(2))
            : null;
        const latestActualRpe = rpeValues.length > 0 ? rpeValues[rpeValues.length - 1] : null;
        const movementPatterns = toStringArray(unit.unit_template?.movement_pattern_tags);
        const primaryMuscles = toStringArray(unit.unit_template?.muscle_tags);

        return {
          id: unit.id,
          sequence_no: unit.sequence_no,
          progress_track_id: unit.progress_track_id,
          selected_exercise_name: unit.selected_exercise_name,
          progression_snapshot: unit.progression_snapshot,
          filter_tags: {
            movement_patterns: movementPatterns,
            primary_muscles: primaryMuscles,
          },
          matrix_cell_payload: {
            plan: {
              snapshot,
            },
            actual: {
              has_execution_data: hasExecutionData,
              session_execution_id: latestExecution?.id ?? null,
              performed_at: latestExecution?.performed_at ?? null,
              outcome,
              status_symbol: actualStatus.symbol,
              status_label: actualStatus.label,
              planned_set_count: summary?.plannedSetCount ?? 0,
              completed_planned_count: summary?.completedPlannedCount ?? 0,
              skipped_planned_count: summary?.skippedPlannedCount ?? 0,
              pending_planned_count: summary?.pendingPlannedCount ?? 0,
              extra_set_count: summary?.extraSetCount ?? 0,
              completed_reps_total: summary?.completedRepsTotal ?? 0,
              completed_duration_total: summary?.completedDurationTotal ?? 0,
              average_actual_rpe: averageActualRpe,
              latest_actual_rpe: latestActualRpe,
              core_set: core
                ? {
                    planned_reps: core.planned_reps,
                    actual_reps: core.actual_reps,
                    planned_weight: core.planned_weight,
                    actual_weight: core.actual_weight,
                  }
                : null,
            },
            deviation: {
              items: deviationItems,
              display_items: deviationItems.map((item) => item.summary),
            },
            result: {
              outcome,
              is_meets_target: summary?.meetsTarget ?? null,
              hold_reason:
                typeof snapshotMeta.hold_reason === "string" ? snapshotMeta.hold_reason : null,
              retry_flag: snapshotMeta.retry_flag === true,
              impact_hint: resolveImpactHint({
                outcome,
                snapshot,
              }),
            },
          },
        };
      }),
    };
  });
}
