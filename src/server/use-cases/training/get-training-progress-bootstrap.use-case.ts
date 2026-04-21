import { z } from "zod";

import {
  listObservationsByMetric,
  listRecentCompletedWeightedExecutionSetsByUser,
  listRecentExecutionSetSignalsByUser,
  listRecentSessionExecutionsByUser,
} from "@/server/repositories";
import { listProgressionMatrixCellsUseCase } from "@/server/use-cases/progression/list-progression-matrix-cells.use-case";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const GetTrainingProgressBootstrapInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type GetTrainingProgressBootstrapInput = z.input<
  typeof GetTrainingProgressBootstrapInputSchema
>;

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNumber(value: unknown): number | null {
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
    const parsed = Number(String(value));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function getPlanScore(status: string) {
  if (status === "realization_round") return 5;
  if (status === "regular_progress") return 4;
  if (status === "threshold_progress") return 3;
  if (status === "planned_deload") return 2;
  if (status === "exception_adjustment") return 1;
  return 0;
}

function getOutcomeScore(outcome: string | null) {
  if (outcome === "success_met") return 1;
  if (outcome === "partial") return 0.6;
  if (outcome === "failed") return 0.25;
  if (outcome === "skipped") return 0;
  return 0;
}

function getProgressDirection(scores: number[]) {
  if (scores.length <= 1) return "flat" as const;
  let nonDecreasing = true;
  let hasIncrease = false;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] < scores[index - 1]) {
      nonDecreasing = false;
    }
    if (scores[index] > scores[index - 1]) {
      hasIncrease = true;
    }
  }
  if (nonDecreasing && hasIncrease) return "up" as const;
  if (!hasIncrease) return "flat" as const;
  return "mixed" as const;
}

function getDirectionLabel(direction: "up" | "flat" | "mixed") {
  if (direction === "up") return "📈";
  if (direction === "flat") return "➖";
  return "📊";
}

export async function getTrainingProgressBootstrapUseCase(
  rawInput: GetTrainingProgressBootstrapInput,
) {
  const input = GetTrainingProgressBootstrapInputSchema.parse(rawInput);

  const [recentExecutions, recentWeightedSets, matrixSessions, setSignals, bodyweight, waist, rhr] =
    await Promise.all([
      listRecentSessionExecutionsByUser(input.userId, 28, "summary"),
      listRecentCompletedWeightedExecutionSetsByUser(input.userId, 280),
      listProgressionMatrixCellsUseCase({
        userId: input.userId,
        window: 14,
        includeRecent: true,
        recentCount: 6,
      }),
      listRecentExecutionSetSignalsByUser(input.userId, 900),
      listObservationsByMetric(input.userId, "bodyweight", 45),
      listObservationsByMetric(input.userId, "waist_circumference", 45),
      listObservationsByMetric(input.userId, "resting_heart_rate", 45),
    ]);

  const completionRate = formatPercent(
    recentExecutions.filter(
      (item) => item.completion_status === "completed" || item.completion_status === "partial",
    ).length,
    recentExecutions.length,
  );

  const skipRate = formatPercent(
    recentExecutions.filter((item) => item.completion_status === "skipped").length,
    recentExecutions.length,
  );

  const matrixCells = matrixSessions.flatMap((session) =>
    session.planned_units.map((unit) => ({
      sessionId: session.id,
      sessionDate: session.session_date,
      sequenceIndex: session.sequence_index,
      sessionTemplateId: session.session_template_id,
      unitId: unit.id,
      exerciseName: unit.selected_exercise_name ?? `训练单元 #${unit.sequence_no}`,
      progressTrackId: unit.progress_track_id,
      filterTags: unit.filter_tags,
      planSnapshot: toRecord(unit.matrix_cell_payload.plan.snapshot),
      outcome: unit.matrix_cell_payload.actual.outcome,
      averageActualRpe: unit.matrix_cell_payload.actual.average_actual_rpe,
      latestActualRpe: unit.matrix_cell_payload.actual.latest_actual_rpe,
      coreSet: unit.matrix_cell_payload.actual.core_set,
      impactHint: unit.matrix_cell_payload.result.impact_hint,
      hasExecutionData: unit.matrix_cell_payload.actual.has_execution_data,
    })),
  );

  const executedCells = matrixCells.filter((cell) => cell.hasExecutionData);
  const hitRate = formatPercent(
    executedCells.filter((cell) => cell.outcome === "success_met").length,
    executedCells.length,
  );

  const actualRpeValues = setSignals
    .filter((signal) => signal.status === "completed")
    .map((signal) => toNumber(signal.actual_rpe))
    .filter((value): value is number => value !== null);

  const avgRpe = average(actualRpeValues);

  const mainLiftMap = new Map<
    string,
    { exerciseName: string; e1rm: number; weight: number; reps: number; performedAt: Date }
  >();
  for (const setRow of recentWeightedSets) {
    const exerciseName = setRow.planned_unit?.selected_exercise_name?.trim();
    if (!exerciseName) continue;
    if (setRow.planned_set_type && !["working", "top_set", "backoff", "volume", "amrap", "cluster"].includes(setRow.planned_set_type)) {
      continue;
    }
    const weight = toNumber(setRow.actual_weight);
    const reps = toNumber(setRow.actual_reps);
    if (weight === null || reps === null || reps <= 0 || weight <= 0) continue;
    if (mainLiftMap.has(exerciseName)) continue;
    const e1rm = Number((weight * (1 + reps / 30)).toFixed(2));
    mainLiftMap.set(exerciseName, {
      exerciseName,
      e1rm,
      weight,
      reps,
      performedAt: setRow.session_execution.performed_at,
    });
  }
  const recentMainLiftPr = Array.from(mainLiftMap.values())
    .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime())
    .slice(0, 5)
    .map((item) => ({
      exerciseName: item.exerciseName,
      e1rm: item.e1rm,
      weight: item.weight,
      reps: item.reps,
      performedAt: item.performedAt,
    }));

  const qualityByDate = new Map<string, number[]>();
  for (const cell of executedCells) {
    const score = getOutcomeScore(cell.outcome);
    const bucket = qualityByDate.get(toDateKey(cell.sessionDate)) ?? [];
    bucket.push(score);
    qualityByDate.set(toDateKey(cell.sessionDate), bucket);
  }

  const buildMetricTrend = (
    metricRows: Array<{ observed_at: Date; value_numeric: unknown; unit: string | null }>,
  ) =>
    metricRows
      .map((row) => {
        const value = toNumber(row.value_numeric);
        if (value === null) return null;
        const dateKey = toDateKey(row.observed_at);
        const qualityValues = qualityByDate.get(dateKey) ?? [];
        return {
          dateKey,
          value: Number(value.toFixed(3)),
          unit: row.unit ?? "",
          trainingQuality:
            qualityValues.length > 0
              ? Number((qualityValues.reduce((sum, item) => sum + item, 0) / qualityValues.length).toFixed(2))
              : null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .slice(-14);

  const trackBuckets = new Map<
    string,
    {
      key: string;
      label: string;
      movementPatterns: string[];
      primaryMuscles: string[];
      points: Array<{
        sequenceIndex: number;
        dateKey: string;
        outcome: string | null;
        planScore: number;
        outcomeScore: number;
        coreWeight: number | null;
        coreReps: number | null;
        averageRpe: number | null;
      }>;
      warnings: Set<"stagnation" | "regression" | "recovery_risk">;
    }
  >();

  for (const cell of matrixCells) {
    const snapshot = cell.planSnapshot;
    const trackKey =
      (typeof snapshot.track_key === "string" && snapshot.track_key) ||
      cell.progressTrackId ||
      `name:${cell.exerciseName}`;
    const existing = trackBuckets.get(trackKey) ?? {
      key: trackKey,
      label: cell.exerciseName,
      movementPatterns: cell.filterTags?.movement_patterns ?? [],
      primaryMuscles: cell.filterTags?.primary_muscles ?? [],
      points: [],
      warnings: new Set<"stagnation" | "regression" | "recovery_risk">(),
    };
    existing.points.push({
      sequenceIndex: cell.sequenceIndex,
      dateKey: toDateKey(cell.sessionDate),
      outcome: cell.outcome,
      planScore: getPlanScore(
        typeof snapshot.change_type === "string"
          ? snapshot.change_type === "realization"
            ? "realization_round"
            : snapshot.change_type === "regular_progress"
              ? "regular_progress"
              : snapshot.change_type === "deload"
                ? "planned_deload"
                : snapshot.change_type === "adjustment"
                  ? "exception_adjustment"
                  : "no_change"
          : "no_change",
      ),
      outcomeScore: getOutcomeScore(cell.outcome),
      coreWeight: cell.coreSet?.actual_weight ?? null,
      coreReps: cell.coreSet?.actual_reps ?? null,
      averageRpe: cell.averageActualRpe,
    });
    trackBuckets.set(trackKey, existing);
  }

  const trackTrends = Array.from(trackBuckets.values())
    .map((bucket) => {
      const sortedPoints = [...bucket.points].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
      const combinedScores = sortedPoints.map((point) =>
        Number((point.planScore * 0.6 + point.outcomeScore * 0.4).toFixed(3)),
      );
      const direction = getProgressDirection(combinedScores);

      const lastThree = sortedPoints.slice(-3);
      const lastOutcomes = lastThree.map((point) => point.outcome);
      const lastRpeValues = lastThree
        .map((point) => point.averageRpe)
        .filter((value): value is number => value !== null);
      const noSuccess = lastOutcomes.every((outcome) => outcome !== "success_met");
      const failedPartialCount = lastOutcomes.filter(
        (outcome) => outcome === "failed" || outcome === "partial",
      ).length;
      const averageLastRpe = average(lastRpeValues);

      const lastTwoWeights = sortedPoints
        .map((point) => point.coreWeight)
        .filter((value): value is number => value !== null)
        .slice(-2);
      const lastTwoReps = sortedPoints
        .map((point) => point.coreReps)
        .filter((value): value is number => value !== null)
        .slice(-2);

      const weightDelta =
        lastTwoWeights.length === 2
          ? Number((lastTwoWeights[1] - lastTwoWeights[0]).toFixed(2))
          : null;
      const repsDelta =
        lastTwoReps.length === 2 ? Number((lastTwoReps[1] - lastTwoReps[0]).toFixed(2)) : null;

      const stagnation =
        sortedPoints.length >= 3 &&
        direction === "flat" &&
        noSuccess;
      const regression = sortedPoints.length >= 3 && failedPartialCount >= 2;
      const recoveryRisk =
        sortedPoints.length >= 3 &&
        averageLastRpe !== null &&
        averageLastRpe >= 9 &&
        failedPartialCount >= 1;

      if (stagnation) bucket.warnings.add("stagnation");
      if (regression) bucket.warnings.add("regression");
      if (recoveryRisk) bucket.warnings.add("recovery_risk");

      return {
        key: bucket.key,
        label: bucket.label,
        movementPatterns: bucket.movementPatterns,
        primaryMuscles: bucket.primaryMuscles,
        direction,
        directionLabel: getDirectionLabel(direction),
        points: sortedPoints.slice(-10),
        latest: sortedPoints[sortedPoints.length - 1] ?? null,
        weightDelta,
        repsDelta,
        averageRpe: averageLastRpe,
        warningFlags: Array.from(bucket.warnings),
      };
    })
    .sort((a, b) => {
      const aPriority = a.warningFlags.length > 0 ? 1 : 0;
      const bPriority = b.warningFlags.length > 0 ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return a.label.localeCompare(b.label, "zh-Hans-CN");
    });

  const warnings = trackTrends
    .flatMap((trend) =>
      trend.warningFlags.map((flag) => {
        if (flag === "stagnation") {
          return {
            type: "stagnation",
            severity: "medium",
            trackKey: trend.key,
            label: trend.label,
            message: "连续训练未见实质推进，建议检查负荷或恢复。",
            matrixHref: `/training?view=progression&tab=matrix&focus=${encodeURIComponent(trend.key)}`,
          };
        }
        if (flag === "regression") {
          return {
            type: "regression",
            severity: "high",
            trackKey: trend.key,
            label: trend.label,
            message: "最近多次 partial/failed，建议回看动作执行质量。",
            matrixHref: `/training?view=progression&tab=matrix&focus=${encodeURIComponent(trend.key)}`,
          };
        }
        return {
          type: "recovery_risk",
          severity: "high",
          trackKey: trend.key,
          label: trend.label,
          message: "高RPE伴随完成质量下降，建议短期控量。",
          matrixHref: `/training?view=progression&tab=matrix&focus=${encodeURIComponent(trend.key)}`,
        };
      }),
    )
    .slice(0, 12);

  return {
    overview: {
      completionRate,
      planHitRate: hitRate,
      skipRate,
      averageRpe: avgRpe,
      recentMainLiftPr,
    },
    trend: {
      bodyweight: buildMetricTrend(bodyweight),
      waistCircumference: buildMetricTrend(waist),
      restingHeartRate: buildMetricTrend(rhr),
      trainingQuality: Array.from(qualityByDate.entries())
        .map(([dateKey, scores]) => ({
          dateKey,
          score: Number((scores.reduce((sum, item) => sum + item, 0) / scores.length).toFixed(2)),
        }))
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .slice(-14),
    },
    trackTrends: trackTrends.slice(0, 24),
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

