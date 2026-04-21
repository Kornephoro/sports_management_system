import { z } from "zod";

import { runOpenAiCompatibleJsonCompletion } from "@/server/integrations/openai-compatible";
import {
  getOpenAiSettingsByUser,
  listObservationsByMetric,
} from "@/server/repositories";
import { getHomeDashboardBootstrapUseCase } from "@/server/use-cases/home/get-home-dashboard-bootstrap.use-case";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, UseCaseError } from "@/server/use-cases/shared/use-case-error";
import { getTrainingCalendarBootstrapUseCase } from "@/server/use-cases/training/get-training-calendar-bootstrap.use-case";
import { getTrainingProgressBootstrapUseCase } from "@/server/use-cases/training/get-training-progress-bootstrap.use-case";

const GenerateRecoveryAiSummaryInputSchema = z.object({
  userId: UuidLikeSchema,
});

const RecoveryAiSummarySchema = z.object({
  overallState: z.enum(["stable", "watch", "high"]),
  label: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(320),
  actions: z.array(z.string().trim().min(1).max(80)).max(3),
  watchItems: z.array(z.string().trim().min(1).max(80)).max(4).default([]),
  confidence: z.enum(["low", "medium", "high"]),
});

export type GenerateRecoveryAiSummaryInput = z.input<typeof GenerateRecoveryAiSummaryInputSchema>;

function takeLatestMetricValue(
  rows: Array<{ observed_at: Date; value_numeric: unknown; unit: string | null }>,
) {
  const first = rows[0];
  if (!first) return null;
  const numeric = typeof first.value_numeric === "number" ? first.value_numeric : Number(first.value_numeric ?? "");
  if (!Number.isFinite(numeric)) return null;
  return {
    value: Number(numeric.toFixed(2)),
    unit: first.unit ?? "",
    observedAt: first.observed_at.toISOString(),
  };
}

function averageMetric(
  rows: Array<{ value_numeric: unknown }>,
  limit: number,
) {
  const values = rows
    .slice(0, limit)
    .map((row) => (typeof row.value_numeric === "number" ? row.value_numeric : Number(row.value_numeric ?? "")))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export async function generateRecoveryAiSummaryUseCase(
  rawInput: GenerateRecoveryAiSummaryInput,
) {
  const input = GenerateRecoveryAiSummaryInputSchema.parse(rawInput);
  const settings = await getOpenAiSettingsByUser(input.userId);

  if (!settings?.api_key) {
    throw badRequestError("请先在“我的”页完成 OpenAI 接口配置。");
  }

  const [dashboard, progress, calendar, sleepRows, fatigueRows] = await Promise.all([
    getHomeDashboardBootstrapUseCase({ userId: input.userId }),
    getTrainingProgressBootstrapUseCase({ userId: input.userId }),
    getTrainingCalendarBootstrapUseCase({ userId: input.userId }),
    listObservationsByMetric(input.userId, "sleep_hours", 14),
    listObservationsByMetric(input.userId, "fatigue_score", 14),
  ]);

  const bodyweightMetric =
    dashboard.dailyVitals.metrics.find((item) => item.metricKey === "bodyweight") ?? null;
  const waistMetric =
    dashboard.dailyVitals.metrics.find((item) => item.metricKey === "waist_circumference") ?? null;
  const heartRateMetric =
    dashboard.dailyVitals.metrics.find((item) => item.metricKey === "resting_heart_rate") ?? null;

  const promptPayload = {
    todayBody: {
      bodyweight: bodyweightMetric
        ? {
            todayValue: bodyweightMetric.todayValue,
            previousValue: bodyweightMetric.previousValue,
            unit: bodyweightMetric.unit,
          }
        : null,
      waistCircumference: waistMetric
        ? {
            todayValue: waistMetric.todayValue,
            previousValue: waistMetric.previousValue,
            unit: waistMetric.unit,
          }
        : null,
      restingHeartRate: heartRateMetric
        ? {
            todayValue: heartRateMetric.todayValue,
            previousValue: heartRateMetric.previousValue,
            unit: heartRateMetric.unit,
          }
        : null,
    },
    recovery: {
      latestSleep: takeLatestMetricValue(sleepRows),
      latestFatigue: takeLatestMetricValue(fatigueRows),
      sleep7dAverage: averageMetric(sleepRows, 7),
      fatigue3xAverage: averageMetric(fatigueRows, 3),
    },
    training: {
      completionRate: progress.overview.completionRate,
      skipRate: progress.overview.skipRate,
      averageRpe: progress.overview.averageRpe,
      warningCount: progress.warnings.length,
      warningLabels: progress.warnings.slice(0, 4).map((warning) => warning.label),
      recentPrs: progress.overview.recentMainLiftPr.slice(0, 3),
    },
    cycle: calendar.cycleSummary.activeMesocycle
      ? {
          fatigueState: calendar.cycleSummary.activeMesocycle.fatigueState,
          rollingFatigueAverage: calendar.cycleSummary.activeMesocycle.rollingFatigueAverage,
          suggestionLabel: calendar.cycleSummary.activeMesocycle.suggestionLabel,
          suggestionReason: calendar.cycleSummary.activeMesocycle.suggestionReason,
          stressSignals: calendar.cycleSummary.activeMesocycle.stressSignals,
        }
      : null,
  };

  const parsed = await runOpenAiCompatibleJsonCompletion<z.infer<typeof RecoveryAiSummarySchema>>(
    {
      baseUrl: settings.base_url,
      apiKey: settings.api_key,
      model: settings.model,
    },
    [
      {
        role: "system",
        content:
          "你是训练恢复助手。请根据用户最近的身体数据、睡眠、主观疲劳、训练完成质量和系统风险信号，给出保守且具体的恢复建议。只返回 JSON，不要输出 Markdown。overallState 只能是 stable/watch/high。confidence 只能是 low/medium/high。actions 最多 3 条，watchItems 最多 4 条，语气要简洁、可执行、非医疗化。",
      },
      {
        role: "user",
        content: JSON.stringify(promptPayload),
      },
    ],
  );

  try {
    return RecoveryAiSummarySchema.parse(parsed);
  } catch (error) {
    throw new UseCaseError(
      error instanceof Error ? `AI 返回格式不可用：${error.message}` : "AI 返回格式不可用",
      "UPSTREAM_SCHEMA_ERROR",
      502,
    );
  }
}
