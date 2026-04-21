import { z } from "zod";

import { runOpenAiCompatibleJsonCompletion } from "@/server/integrations/openai-compatible";
import {
  getOnboardingTrainingProfileByUser,
  getOpenAiSettingsByUser,
  listActiveConstraintProfilesByUser,
  listInjuryIncidentsByUser,
  listObservationsByMetric,
} from "@/server/repositories";
import { listTrainingPlanningAiAnchorCandidatesUseCase } from "@/server/use-cases/training/list-training-planning-ai-anchor-candidates.use-case";
import { getHomeDashboardBootstrapUseCase } from "@/server/use-cases/home/get-home-dashboard-bootstrap.use-case";
import { getTrainingProgressBootstrapUseCase } from "@/server/use-cases/training/get-training-progress-bootstrap.use-case";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, UseCaseError } from "@/server/use-cases/shared/use-case-error";

const CandidateFactorSchema = z.object({
  candidateKey: z.string().trim().min(1),
  continuity: z.enum(["consistent", "intermittent", "stopped", "unknown"]).default("unknown"),
  similarWork: z.enum(["plenty", "some", "none", "unknown"]).default("unknown"),
  recentFocus: z.enum(["strength", "hypertrophy", "conditioning", "mixed", "unknown"]).default("unknown"),
  bodyChange: z.enum(["better", "stable", "worse", "unknown"]).default("unknown"),
});

const GenerateTrainingPlanningAiAnchorsInputSchema = z.object({
  userId: UuidLikeSchema,
  packageId: UuidLikeSchema,
  factors: z.array(CandidateFactorSchema).default([]),
});

const TrainingPlanningAiAnchorRecommendationSchema = z.object({
  candidateKey: z.string().trim().min(1),
  recommendedSetCount: z.number().int().positive().nullable().optional(),
  recommendedLoadValue: z.number().nonnegative().nullable().optional(),
  recommendedAdditionalLoadValue: z.number().nonnegative().nullable().optional(),
  recommendedAssistWeight: z.number().nonnegative().nullable().optional(),
  recommendedReps: z.number().int().positive().nullable().optional(),
  recommendedDurationSeconds: z.number().int().positive().nullable().optional(),
  recommendedRestSeconds: z.number().int().positive().nullable().optional(),
  recommendedTempo: z
    .tuple([
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
      z.number().int().nonnegative(),
    ])
    .nullable()
    .optional(),
  recommendedRir: z.number().min(0).max(5).nullable().optional(),
  confidence: z.enum(["low", "medium", "high"]),
  logicSummary: z.string().trim().min(1).max(220),
  reasons: z.array(z.string().trim().min(1).max(120)).min(1).max(4),
});

const TrainingPlanningAiAnchorsResponseSchema = z.object({
  recommendations: z.array(TrainingPlanningAiAnchorRecommendationSchema),
});

export type GenerateTrainingPlanningAiAnchorsInput = z.input<
  typeof GenerateTrainingPlanningAiAnchorsInputSchema
>;

function buildFactorMap(
  factors: z.infer<typeof CandidateFactorSchema>[],
) {
  return new Map(factors.map((item) => [item.candidateKey, item] as const));
}

function toRoundedNumber(value: unknown, digits = 2) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(digits));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Number(parsed.toFixed(digits));
    }
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number((value as { toString: () => string }).toString());
    if (Number.isFinite(parsed)) {
      return Number(parsed.toFixed(digits));
    }
  }
  return null;
}

function averageNumbers(values: number[], digits = 2) {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, item) => sum + item, 0);
  return Number((total / values.length).toFixed(digits));
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item): item is string => item.length > 0);
}

function buildObservationMetricSummary(
  rows: Array<{ observed_at: Date; value_numeric: unknown; unit: string | null }>,
  windowSize: number,
) {
  const normalized = rows
    .map((item) => ({
      observedAt: item.observed_at.toISOString(),
      value: toRoundedNumber(item.value_numeric, 3),
      unit: item.unit,
    }))
    .filter((item): item is { observedAt: string; value: number; unit: string | null } => item.value !== null);

  const latest = normalized[0] ?? null;
  const trendWindow = normalized.slice(0, windowSize).map((item) => item.value);

  return {
    latest,
    recentAverage: averageNumbers(trendWindow, 3),
    recentSeries: normalized.slice(0, windowSize),
  };
}

export async function generateTrainingPlanningAiAnchorsUseCase(
  rawInput: GenerateTrainingPlanningAiAnchorsInput,
) {
  const input = GenerateTrainingPlanningAiAnchorsInputSchema.parse(rawInput);
  const settings = await getOpenAiSettingsByUser(input.userId);

  if (!settings?.api_key) {
    throw badRequestError("请先在“我的”页完成 AI 接口配置。");
  }

  const [
    candidatesResult,
    dashboard,
    progress,
    trainingProfile,
    sleepRows,
    fatigueRows,
    activeConstraints,
    injuryRows,
  ] = await Promise.all([
    listTrainingPlanningAiAnchorCandidatesUseCase({
      userId: input.userId,
      packageId: input.packageId,
    }),
    getHomeDashboardBootstrapUseCase({ userId: input.userId }),
    getTrainingProgressBootstrapUseCase({ userId: input.userId }),
    getOnboardingTrainingProfileByUser(input.userId),
    listObservationsByMetric(input.userId, "sleep_hours", 7),
    listObservationsByMetric(input.userId, "fatigue_score", 7),
    listActiveConstraintProfilesByUser(input.userId, 12),
    listInjuryIncidentsByUser(input.userId, undefined, 12),
  ]);

  if (candidatesResult.candidates.length === 0) {
    return {
      packageId: input.packageId,
      recommendations: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const factorMap = buildFactorMap(input.factors);
  const bodyweightMetric =
    dashboard.dailyVitals.metrics.find((item) => item.metricKey === "bodyweight") ?? null;
  const waistMetric =
    dashboard.dailyVitals.metrics.find((item) => item.metricKey === "waist_circumference") ?? null;
  const sleepSummary = buildObservationMetricSummary(sleepRows, 7);
  const fatigueSummary = buildObservationMetricSummary(fatigueRows, 3);
  const activeInjuries = injuryRows
    .filter((item) => item.status !== "resolved")
    .map((item) => ({
      title: item.title,
      status: item.status,
      incidentType: item.incident_type,
      bodyRegionTags: toStringArray(item.body_region_tags),
      movementContextTags: toStringArray(item.movement_context_tags),
      painLevelInitial: item.pain_level_initial,
      symptomSummary: item.symptom_summary,
      currentRestrictions: item.current_restrictions,
      returnReadinessStatus: item.return_readiness_status,
      onsetAt: item.onset_at?.toISOString() ?? null,
    }));

  const promptPayload = {
    package: {
      id: candidatesResult.packageId,
      name: candidatesResult.packageName,
    },
    trainingProfile: trainingProfile
      ? {
          experienceLevel: trainingProfile.experience_level,
          suggestedLevel: trainingProfile.suggested_level,
          techniqueConfidence: trainingProfile.technique_confidence,
          progressionLiteracy: trainingProfile.progression_literacy,
          trainingAgeMonths: trainingProfile.training_age_months,
          recentFrequencyPerWeek: trainingProfile.recent_frequency_per_week,
          weeklyTrainingDays: trainingProfile.weekly_training_days,
          sessionDurationMin: trainingProfile.session_duration_min,
          detrainingGapDays: trainingProfile.detraining_gap_days,
          returnToTrainingState: trainingProfile.return_to_training_state,
          recoveryConfidence: trainingProfile.recovery_confidence,
          equipmentEnvironment: trainingProfile.equipment_environment,
          currentPainStatus: trainingProfile.current_pain_status,
          restrictedRegions: trainingProfile.restricted_regions,
          restrictedMovements: trainingProfile.restricted_movements,
          extraSports: trainingProfile.extra_sports,
          movementCompetencies: trainingProfile.movement_competencies,
          notes: trainingProfile.notes,
          updatedAt: trainingProfile.updated_at,
        }
      : null,
    readinessSignals: {
      sleepHours: sleepSummary,
      fatigueScore: fatigueSummary,
      activeConstraints: activeConstraints.map((item) => ({
        title: item.title,
        domain: item.domain,
        severity: item.severity,
        bodyRegionTags: toStringArray(item.body_region_tags),
        movementTags: toStringArray(item.movement_tags),
        symptomSummary: item.symptom_summary,
        restrictionRules: item.restriction_rules,
        trainingImplications: item.training_implications,
        rehabFocusTags: toStringArray(item.rehab_focus_tags),
      })),
      activeInjuries,
    },
    bodySignals: {
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
      mainLiftPrs: progress.overview.recentMainLiftPr.slice(0, 4),
      trainingCompletionQuality: {
        completionRate: progress.overview.completionRate,
        planHitRate: progress.overview.planHitRate,
        skipRate: progress.overview.skipRate,
        averageRpe: progress.overview.averageRpe,
        warnings: progress.warnings.slice(0, 6),
      },
    },
    candidates: candidatesResult.candidates.map((candidate) => ({
      key: candidate.key,
      trigger: candidate.trigger,
      exerciseLibraryItemId: candidate.exerciseLibraryItemId,
      exerciseName: candidate.exerciseName,
      actionType: candidate.actionType,
      recordingMode: candidate.recordingMode,
      movementPattern: candidate.movementPattern,
      primaryRegions: candidate.primaryRegions,
      secondaryRegions: candidate.secondaryRegions,
      currentLogic: candidate.currentLogic,
      history: candidate.history,
      storedAnchor: candidate.storedAnchor,
      templateAnchorDraft: candidate.templateAnchorDraft,
      userFactors:
        factorMap.get(candidate.key) ?? {
          candidateKey: candidate.key,
          continuity: "unknown",
          similarWork: "unknown",
          recentFocus: "unknown",
          bodyChange: "unknown",
        },
    })),
  };

  const parsed = await runOpenAiCompatibleJsonCompletion<z.infer<typeof TrainingPlanningAiAnchorsResponseSchema>>(
    {
      baseUrl: settings.base_url,
      apiKey: settings.api_key,
      model: settings.model,
    },
    [
      {
        role: "system",
        content:
          "你是力量训练动作起始基准助手。你的任务是为每个动作生成一个临时起始基准，用于首次训练默认值。你必须综合训练画像、回归状态、器械环境、限制/伤病、睡眠和疲劳信号、近期体重/腰围变化、完成质量、主项 e1RM、模板锚点草稿、动作历史，以及用户补充因素。你推荐的是 entry anchor，不是进步逻辑已经跑到第几步。你只能在既有处方框架内给出首次落点，不能改 progression logic、动作角色或动作本身。若动作是 assisted，请优先填写 recommendedAssistWeight；若是 bodyweight_load，填写 recommendedAdditionalLoadValue；若是 strength，填写 recommendedLoadValue。setCount / restSeconds / tempo 只有在你认为首次进入需要更保守或更贴合当前状态时才填写。输出 JSON，不要输出 Markdown。",
      },
      {
        role: "user",
        content: JSON.stringify(promptPayload),
      },
    ],
  );

  try {
    const result = TrainingPlanningAiAnchorsResponseSchema.parse(parsed);
    return {
      packageId: input.packageId,
      recommendations: result.recommendations,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new UseCaseError(
      error instanceof Error ? `AI 返回格式不可用：${error.message}` : "AI 返回格式不可用",
      "UPSTREAM_SCHEMA_ERROR",
      502,
    );
  }
}
