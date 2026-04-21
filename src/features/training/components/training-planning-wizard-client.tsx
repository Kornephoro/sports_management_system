"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  generateTrainingPlanningAiAnchorRecommendations,
  generateTrainingPlanFromPackage,
  getTrainingPlanningAiAnchorCandidates,
  TrainingPlanningAiAnchorCandidate,
  TrainingPlanningAiAnchorFactor,
  TrainingPlanningAiAnchorRecommendation,
  getTrainingPlanningBootstrap,
  TemplatePackageSplitType,
  TrainingPlanningBootstrapResponse,
} from "@/features/training/training-api";
import { AppCard, EmptyState, InlineAlert, SkeletonRows } from "@/features/shared/components/ui-primitives";
import {
  CLASSIC_PROGRESSION_STRATEGIES,
  getClassicProgressionStrategyByPolicyType,
} from "@/features/progression/progression-strategy-catalog";
import { ProgressionPolicyConfigDrawer } from "@/features/progression/components/progression-policy-config-drawer";
import { normalizePolicyConfig, ProgressionConfigValue } from "@/features/progression/progression-policy-normalizer";
import { summarizeProgressionPolicyConfig } from "@/features/progression/progression-policy-summary";
import { getTemplatePackageSplitTypeLabel } from "@/lib/template-package-standards";
import { getUnitRoleLabel } from "@/features/shared/ui-zh";
import { ActionEntryAnchorSummary } from "@/lib/action-entry-anchor";
import { getRecordingModeLabel } from "@/lib/recording-mode-standards";

type TrainingPlanningWizardClientProps = {
  userId: string;
  initialPackageId?: string;
  initialStep?: WizardStep;
};

type WizardStep = 1 | 2 | 3;
type OverrideScope = "plan_only" | "package_default";

type UnitDraft = {
  dayId: string;
  dayCode: string;
  unitSequenceNo: number;
  exerciseName: string;
  unitRole: string;
  progressTrackKey: string;
  progressionFamily: string;
  progressionPolicyType: string;
  progressionPolicyConfig: Record<string, unknown>;
  adjustmentPolicyType: string;
  adjustmentPolicyConfig: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
};

type DrawerState = {
  open: boolean;
  key: string | null;
};

type AiFactorValueMap = Record<
  string,
  TrainingPlanningAiAnchorFactor
>;

type EntryAnchorDraft = {
  key: string;
  dayId: string;
  dayCode: string;
  unitSequenceNo: number;
  exerciseName: string;
  recordingMode: string | null;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  source: "template_draft" | "stored_anchor" | "ai_recommendation" | "manual";
  candidateKey: string | null;
  trigger: TrainingPlanningAiAnchorCandidate["trigger"] | null;
  setCount: number | null;
  reps: number | null;
  durationSeconds: number | null;
  loadValue: number | null;
  additionalLoadValue: number | null;
  assistWeight: number | null;
  restSeconds: number | null;
  tempo: [number, number, number, number] | null;
  recommendedRir: number | null;
  confidence: "low" | "medium" | "high" | null;
  logicSummary: string | null;
  reasons: string[];
  logicSignature: string | null;
  daysSinceLastPerformed: number | null;
};

function buildDefaultAiFactor(candidateKey: string): TrainingPlanningAiAnchorFactor {
  return {
    candidateKey,
    continuity: "unknown",
    similarWork: "unknown",
    recentFocus: "unknown",
    bodyChange: "unknown",
  };
}

function buildEntryAnchorDraftFromSummary(args: {
  key: string;
  dayId: string;
  dayCode: string;
  unitSequenceNo: number;
  exerciseName: string;
  recordingMode: string | null;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  summary?: ActionEntryAnchorSummary | null;
}): EntryAnchorDraft {
  const summary = args.summary ?? null;
  return {
    key: args.key,
    dayId: args.dayId,
    dayCode: args.dayCode,
    unitSequenceNo: args.unitSequenceNo,
    exerciseName: args.exerciseName,
    recordingMode: args.recordingMode,
    recordMode: args.recordMode,
    loadModel: args.loadModel,
    source: "template_draft",
    candidateKey: null,
    trigger: null,
    setCount: summary?.setCount ?? null,
    reps: summary?.reps ?? null,
    durationSeconds: summary?.durationSeconds ?? null,
    loadValue: summary?.loadValue ?? null,
    additionalLoadValue: summary?.additionalLoadValue ?? null,
    assistWeight: summary?.assistWeight ?? null,
    restSeconds: summary?.restSeconds ?? null,
    tempo: summary?.tempo ?? null,
    recommendedRir: summary?.recommendedRir ?? null,
    confidence: null,
    logicSummary: null,
    reasons: [],
    logicSignature: null,
    daysSinceLastPerformed: null,
  };
}

function buildEntryAnchorMap(data: TrainingPlanningBootstrapResponse | null) {
  const next = new Map<string, EntryAnchorDraft>();
  if (!data?.selectedPackage) {
    return next;
  }
  for (const day of data.selectedPackage.days) {
    for (const unit of day.units) {
      const key = `${day.id}:${unit.sequenceNo}`;
      next.set(
        key,
        buildEntryAnchorDraftFromSummary({
          key,
          dayId: day.id,
          dayCode: day.dayCode,
          unitSequenceNo: unit.sequenceNo,
          exerciseName: unit.exerciseNameSnapshot,
          recordingMode: unit.recordingMode,
          recordMode: unit.recordMode,
          loadModel: unit.loadModel,
          summary: unit.anchorDraft ?? null,
        }),
      );
    }
  }
  return next;
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTempoInput(value: string): [number, number, number, number] | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = trimmed
    .split("-")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0);
  return parsed.length === 4 ? (parsed as [number, number, number, number]) : null;
}

function formatTempoInput(tempo: [number, number, number, number] | null) {
  return tempo ? tempo.join("-") : "";
}

function getEntryAnchorSourceLabel(source: EntryAnchorDraft["source"]) {
  switch (source) {
    case "stored_anchor":
      return "历史锚点";
    case "ai_recommendation":
      return "AI 建议";
    case "manual":
      return "手动确认";
    case "template_draft":
    default:
      return "模板草稿";
  }
}

function getEntryAnchorValueSummary(anchor: EntryAnchorDraft) {
  const parts: string[] = [];
  if (anchor.setCount !== null) {
    parts.push(`${anchor.setCount} 组`);
  }
  if (anchor.durationSeconds !== null) {
    parts.push(`${anchor.durationSeconds} 秒`);
  } else if (anchor.reps !== null) {
    parts.push(`${anchor.reps} 次`);
  }
  if (anchor.assistWeight !== null) {
    parts.push(`辅助 ${anchor.assistWeight}`);
  } else if (anchor.additionalLoadValue !== null) {
    parts.push(`附重 ${anchor.additionalLoadValue}`);
  } else if (anchor.loadValue !== null) {
    parts.push(`${anchor.loadValue}`);
  }
  if (anchor.restSeconds !== null) {
    parts.push(`休息 ${anchor.restSeconds}s`);
  }
  if (anchor.recommendedRir !== null) {
    parts.push(`RIR ${anchor.recommendedRir}`);
  }
  return parts.join(" · ") || "尚未填写";
}

function getAiTriggerLabel(trigger: TrainingPlanningAiAnchorCandidate["trigger"]) {
  if (trigger === "never_used") return "从未使用";
  if (trigger === "logic_changed") return "逻辑变化";
  return "间隔较久";
}

function toLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const QUICK_STRATEGY_OPTIONS = [
  { value: "double_progression", label: "双进阶" },
  { value: "linear_load_step", label: "线性加重" },
  { value: "total_reps_threshold", label: "阈值推进" },
  { value: "manual", label: "手动" },
] as const;

const UNIT_ROLE_OPTIONS = [
  "main",
  "secondary",
  "accessory",
  "skill",
  "conditioning",
  "warmup",
  "cooldown",
  "mobility",
  "prehab",
] as const;

function WizardHeader({ step }: { step: WizardStep }) {
  function getStepLabel(s: number) {
    if (s === 1) return "选择计划包";
    if (s === 2) return "设置排期";
    return "预览并确认";
  }

  function getStepHint(s: number) {
    if (s === 1) return "挑选最适合的已有计划包。如果要改结构请去新建或高级管理。";
    return "设定计划的开始日期以及预期的执行周数。";
  }

  return (
    <div className="px-1">
      <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">{getStepLabel(step)}</h2>
      <p className="mt-1.5 text-xs font-semibold text-zinc-500">{getStepHint(step)}</p>
    </div>
  );
}

function buildDraftFromBootstrap(data: TrainingPlanningBootstrapResponse | null) {
  const next = new Map<string, UnitDraft>();
  if (!data?.selectedPackage) {
    return next;
  }
  for (const day of data.selectedPackage.days) {
    for (const unit of day.units) {
      next.set(`${day.id}:${unit.sequenceNo}`, {
        dayId: day.id,
        dayCode: day.dayCode,
        unitSequenceNo: unit.sequenceNo,
        exerciseName: unit.exerciseNameSnapshot,
        unitRole: unit.unitRole,
        progressTrackKey: unit.progressTrackKey,
        progressionFamily: unit.progressionFamily,
        progressionPolicyType: unit.progressionPolicyType,
        progressionPolicyConfig: unit.progressionPolicyConfig,
        adjustmentPolicyType: unit.adjustmentPolicyType,
        adjustmentPolicyConfig: unit.adjustmentPolicyConfig,
        successCriteria: unit.successCriteria,
      });
    }
  }
  return next;
}

function estimateGeneratedSessions(
  selectedPackage: NonNullable<TrainingPlanningBootstrapResponse["selectedPackage"]> | null,
  durationWeeks: number,
) {
  if (!selectedPackage || durationWeeks <= 0) {
    return 0;
  }
  const slots = selectedPackage.microcycleSlots;
  if (!slots || slots.length === 0) {
    return durationWeeks * selectedPackage.days.length;
  }
  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const firstTrainIndex = ordered.findIndex((slot) => slot.type === "train");
  const startIndex = firstTrainIndex >= 0 ? firstTrainIndex : 0;
  const windowDays = durationWeeks * 7;
  let count = 0;
  for (let offset = 0; offset < windowDays; offset += 1) {
    const slot = ordered[(startIndex + offset) % ordered.length];
    if (slot.type === "train") {
      count += 1;
    }
  }
  return count;
}

export function TrainingPlanningWizardClient({
  userId,
  initialPackageId,
  initialStep = 1,
}: TrainingPlanningWizardClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<TrainingPlanningBootstrapResponse | null>(null);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [draftMap, setDraftMap] = useState<Map<string, UnitDraft>>(new Map());
  const [entryAnchorMap, setEntryAnchorMap] = useState<Map<string, EntryAnchorDraft>>(new Map());
  const [drawerState, setDrawerState] = useState<DrawerState>({ open: false, key: null });
  const [startDate, setStartDate] = useState(toLocalDateInputValue());
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [replaceFuture, setReplaceFuture] = useState(true);
  const [pendingScopeChoice, setPendingScopeChoice] = useState(false);
  const [expandedPackageIds, setExpandedPackageIds] = useState<string[]>([]);
  const [aiCandidatesLoading, setAiCandidatesLoading] = useState(false);
  const [aiCandidatesError, setAiCandidatesError] = useState<string | null>(null);
  const [aiCandidates, setAiCandidates] = useState<TrainingPlanningAiAnchorCandidate[]>([]);
  const [aiFactorMap, setAiFactorMap] = useState<AiFactorValueMap>({});
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<
    Record<string, TrainingPlanningAiAnchorRecommendation>
  >({});

  const loadBootstrap = useCallback(
    async (packageId?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await getTrainingPlanningBootstrap(userId, packageId ?? undefined);
        setBootstrap(result);
        const effectivePackageId = packageId ?? result.selectedPackage?.id ?? null;
        setSelectedPackageId(effectivePackageId);
        setDraftMap(buildDraftFromBootstrap(result));
        setEntryAnchorMap(buildEntryAnchorMap(result));
        setActiveDayId(result.selectedPackage?.days[0]?.id ?? null);
        if (effectivePackageId) {
          setExpandedPackageIds((current) =>
            current.includes(effectivePackageId) ? current : [...current, effectivePackageId],
          );
        }
      } catch (nextError) {
        setBootstrap(null);
        setDraftMap(new Map());
        setEntryAnchorMap(new Map());
        setActiveDayId(null);
        setError(nextError instanceof Error ? nextError.message : "加载计划包失败");
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void loadBootstrap(initialPackageId);
  }, [initialPackageId, loadBootstrap]);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  const selectedPackage = bootstrap?.selectedPackage ?? null;
  const activeDay =
    selectedPackage?.days.find((day) => day.id === activeDayId) ??
    selectedPackage?.days[0] ??
    null;

  const canGoNextStep =
    (step === 1 && Boolean(selectedPackage)) ||
    (step === 2 && Boolean(startDate) && durationWeeks > 0);

  const selectedDrawerUnit = useMemo(() => {
    if (!drawerState.open || !drawerState.key) return null;
    return draftMap.get(drawerState.key) ?? null;
  }, [draftMap, drawerState]);

  useEffect(() => {
    if (step !== 3 || !selectedPackage) {
      return;
    }

    let cancelled = false;
    setAiCandidatesLoading(true);
    setAiCandidatesError(null);
    setAiRecommendations({});
    void getTrainingPlanningAiAnchorCandidates(userId, selectedPackage.id)
      .then((result) => {
        if (cancelled) return;
        setAiCandidates(result.candidates);
        setAiFactorMap((current) => {
          const next: AiFactorValueMap = {};
          for (const candidate of result.candidates) {
            next[candidate.key] = current[candidate.key] ?? buildDefaultAiFactor(candidate.key);
          }
          return next;
        });
        setEntryAnchorMap((current) => {
          const next = new Map(current);
          for (const candidate of result.candidates) {
            const preferredSummary = candidate.storedAnchor ?? candidate.templateAnchorDraft ?? null;
            for (const target of candidate.targets) {
              const key = `${target.dayId}:${target.unitSequenceNo}`;
              const existing = next.get(key);
              if (!existing) {
                continue;
              }
              next.set(key, {
                ...existing,
                source: candidate.storedAnchor ? "stored_anchor" : existing.source,
                candidateKey: candidate.key,
                trigger: candidate.trigger,
                setCount: preferredSummary?.setCount ?? existing.setCount,
                reps: preferredSummary?.reps ?? existing.reps,
                durationSeconds: preferredSummary?.durationSeconds ?? existing.durationSeconds,
                loadValue: preferredSummary?.loadValue ?? existing.loadValue,
                additionalLoadValue:
                  preferredSummary?.additionalLoadValue ?? existing.additionalLoadValue,
                assistWeight: preferredSummary?.assistWeight ?? existing.assistWeight,
                restSeconds: preferredSummary?.restSeconds ?? existing.restSeconds,
                tempo: preferredSummary?.tempo ?? existing.tempo,
                recommendedRir: preferredSummary?.recommendedRir ?? existing.recommendedRir,
                logicSignature: candidate.currentLogic.logicSignature,
                daysSinceLastPerformed:
                  candidate.history.daysSinceLastPerformed ?? existing.daysSinceLastPerformed,
              });
            }
          }
          return next;
        });
      })
      .catch((nextError) => {
        if (cancelled) return;
        setAiCandidates([]);
        setAiRecommendations({});
        setAiCandidatesError(nextError instanceof Error ? nextError.message : "动作基准候选扫描失败");
      })
      .finally(() => {
        if (cancelled) return;
        setAiCandidatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPackage, step, userId]);

  const updateAiFactor = useCallback(
    (
      candidateKey: string,
      field: Exclude<keyof TrainingPlanningAiAnchorFactor, "candidateKey">,
      value: TrainingPlanningAiAnchorFactor[typeof field],
    ) => {
      setAiFactorMap((current) => ({
        ...current,
        [candidateKey]: {
          ...(current[candidateKey] ?? buildDefaultAiFactor(candidateKey)),
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleGenerateAiRecommendations = useCallback(async () => {
    if (!selectedPackage || aiCandidates.length === 0 || aiGenerating) {
      return;
    }

    setAiGenerating(true);
    setAiCandidatesError(null);
    try {
      const result = await generateTrainingPlanningAiAnchorRecommendations({
        userId,
        packageId: selectedPackage.id,
        factors: aiCandidates.map((candidate) => aiFactorMap[candidate.key] ?? buildDefaultAiFactor(candidate.key)),
      });
      const recommendationsByKey = Object.fromEntries(
        result.recommendations.map((item) => [item.candidateKey, item] as const),
      );
      setAiRecommendations(recommendationsByKey);
      setEntryAnchorMap((current) => {
        const next = new Map(current);
        for (const candidate of aiCandidates) {
          const recommendation = recommendationsByKey[candidate.key];
          if (!recommendation) {
            continue;
          }
          for (const target of candidate.targets) {
            const key = `${target.dayId}:${target.unitSequenceNo}`;
            const existing = next.get(key);
            if (!existing) {
              continue;
            }
            next.set(key, {
              ...existing,
              source: "ai_recommendation",
              candidateKey: candidate.key,
              trigger: candidate.trigger,
              setCount: recommendation.recommendedSetCount ?? existing.setCount,
              reps: recommendation.recommendedReps ?? existing.reps,
              durationSeconds:
                recommendation.recommendedDurationSeconds ?? existing.durationSeconds,
              loadValue: recommendation.recommendedLoadValue ?? existing.loadValue,
              additionalLoadValue:
                recommendation.recommendedAdditionalLoadValue ??
                existing.additionalLoadValue,
              assistWeight: recommendation.recommendedAssistWeight ?? existing.assistWeight,
              restSeconds: recommendation.recommendedRestSeconds ?? existing.restSeconds,
              tempo: recommendation.recommendedTempo ?? existing.tempo,
              recommendedRir: recommendation.recommendedRir ?? existing.recommendedRir,
              confidence: recommendation.confidence,
              logicSummary: recommendation.logicSummary,
              reasons: recommendation.reasons,
              logicSignature: candidate.currentLogic.logicSignature,
              daysSinceLastPerformed:
                candidate.history.daysSinceLastPerformed ?? existing.daysSinceLastPerformed,
            });
          }
        }
        return next;
      });
    } catch (nextError) {
      setAiCandidatesError(nextError instanceof Error ? nextError.message : "AI 建议生成失败");
    } finally {
      setAiGenerating(false);
    }
  }, [aiCandidates, aiFactorMap, aiGenerating, selectedPackage, userId]);

  const progressionOverrides = useMemo(
    () =>
      Array.from(draftMap.values()).map((item) => ({
        dayId: item.dayId,
        unitSequenceNo: item.unitSequenceNo,
        unitRole: item.unitRole,
        progressionFamily: item.progressionFamily,
        progressionPolicyType: item.progressionPolicyType,
        progressionPolicyConfig: item.progressionPolicyConfig,
        adjustmentPolicyType: item.adjustmentPolicyType,
        adjustmentPolicyConfig: item.adjustmentPolicyConfig,
        successCriteria: item.successCriteria,
        progressTrackKey: item.progressTrackKey,
      })),
    [draftMap],
  );

  const entryAnchorOverrides = useMemo(
    () =>
      Array.from(entryAnchorMap.values()).map((item) => ({
        dayId: item.dayId,
        unitSequenceNo: item.unitSequenceNo,
        source: item.source,
        candidateKey: item.candidateKey,
        trigger: item.trigger,
        setCount: item.setCount,
        loadValue: item.loadValue,
        additionalLoadValue: item.additionalLoadValue,
        assistWeight: item.assistWeight,
        reps: item.reps,
        durationSeconds: item.durationSeconds,
        restSeconds: item.restSeconds,
        tempo: item.tempo,
        recommendedRir: item.recommendedRir,
        confidence: item.confidence,
        logicSummary: item.logicSummary,
        reasons: item.reasons,
        logicSignature: item.logicSignature,
        daysSinceLastPerformed: item.daysSinceLastPerformed,
      })),
    [entryAnchorMap],
  );

  const aiAnchorPreview = useMemo(() => {
    const recommendedCandidateCount = aiCandidates.filter((candidate) => aiRecommendations[candidate.key]).length;
    const uniqueTargetKeys = new Set(
      aiCandidates.flatMap((candidate) =>
        candidate.targets.map((item) => `${item.dayId}:${item.unitSequenceNo}`),
      ),
    );
    return {
      candidateCount: aiCandidates.length,
      recommendedCandidateCount,
      targetCount: uniqueTargetKeys.size,
      pendingCandidateCount: Math.max(aiCandidates.length - recommendedCandidateCount, 0),
    };
  }, [aiCandidates, aiRecommendations]);

  const onSelectPackage = async (packageId: string) => {
    if (saving) return;
    setMessage(null);
    setExpandedPackageIds((current) =>
      current.includes(packageId) ? current : [...current, packageId],
    );
    await loadBootstrap(packageId);
  };

  const updateDraft = (key: string, updater: (draft: UnitDraft) => UnitDraft) => {
    setDraftMap((current) => {
      const next = new Map(current);
      const draft = next.get(key);
      if (!draft) {
        return current;
      }
      next.set(key, updater(draft));
      return next;
    });
  };

  const togglePackagePreview = (packageId: string) => {
    setExpandedPackageIds((current) =>
      current.includes(packageId)
        ? current.filter((id) => id !== packageId)
        : [...current, packageId],
    );
  };

  const updateEntryAnchor = useCallback(
    (
      key: string,
      patch: Partial<EntryAnchorDraft>,
      source: EntryAnchorDraft["source"] = "manual",
    ) => {
      setEntryAnchorMap((current) => {
        const next = new Map(current);
        const existing = next.get(key);
        if (!existing) {
          return current;
        }
        next.set(key, {
          ...existing,
          ...patch,
          source,
        });
        return next;
      });
    },
    [],
  );

  const handleGenerate = async (scope: OverrideScope) => {
    if (!selectedPackage || saving) {
      return;
    }

    if (replaceFuture) {
      const confirmed = window.confirm("将覆盖未来未执行安排。是否继续生成？");
      if (!confirmed) {
        return;
      }
    }

    setPendingScopeChoice(false);
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await generateTrainingPlanFromPackage({
        userId,
        packageId: selectedPackage.id,
        startDate,
        durationWeeks,
        schedulingMode: bootstrap?.defaults.schedulingMode ?? "smart_elastic",
        replaceFutureUnexecuted: replaceFuture,
        overrideScope: scope,
        progressionOverrides,
        entryAnchorOverrides,
      });
      setMessage(
        aiAnchorPreview.recommendedCandidateCount > 0
          ? `已生成 ${result.generatedSessionCount} 次训练，周期 ${result.durationWeeks} 周；其中 ${aiAnchorPreview.targetCount} 个首次训练入口会先按 AI 临时基准排期。`
          : `已生成 ${result.generatedSessionCount} 次训练，周期 ${result.durationWeeks} 周。`,
      );
      router.push("/training?view=calendar");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "生成计划失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6 pb-10">
      <WizardHeader step={step} />

      {loading ? (
        <AppCard>
          <SkeletonRows rows={8} />
        </AppCard>
      ) : null}
      {!loading && error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {!loading && message ? <InlineAlert tone="success">{message}</InlineAlert> : null}

      {!loading && bootstrap && step === 1 ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50">可用计划包库 ({bootstrap.packages.length})</h3>
          </div>
          
          <div className="flex flex-col gap-3">
            <Link
              href="/training/template-packages/new"
              className="group flex items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 py-3 transition-all active:scale-[0.98] hover:border-blue-400 hover:bg-blue-50/30 dark:border-zinc-800 dark:bg-zinc-900/30"
            >
              <span className="text-lg text-zinc-400 group-hover:text-blue-500">+</span>
              <span className="text-xs font-black text-zinc-600 group-hover:text-blue-600 dark:text-zinc-400">新建计划包</span>
            </Link>
          </div>

            {bootstrap.packages.length === 0 ? (
               <div className="py-10 text-center">
                  <p className="text-xs font-bold text-zinc-400">目前暂无已保存的计划包</p>
                  <p className="mt-1 text-[10px] text-zinc-300">请点击下方按钮开始创建</p>
               </div>
            ) : (
              bootstrap.packages.map((item) => {
                const isSelected = selectedPackage?.id === item.id;
                const expanded = expandedPackageIds.includes(item.id);
                
                return (
                  <div
                    key={item.id}
                    className={`group relative overflow-hidden rounded-[2.5rem] border-2 transition-all duration-300 ${
                      expanded
                        ? "border-blue-500 bg-white ring-8 ring-blue-50 dark:border-blue-400 dark:bg-zinc-900 dark:ring-blue-900/10"
                        : isSelected
                        ? "border-zinc-300 bg-zinc-100/50 dark:border-zinc-700 dark:bg-zinc-900/50"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50"
                    }`}
                  >
                    {/* Visual Tab for Selection State */}
                    {isSelected && (
                      <div className="absolute left-6 top-0 h-1.5 w-12 rounded-b-full bg-blue-600" />
                    )}

                    <div 
                      onClick={() => togglePackagePreview(item.id)}
                      className="cursor-pointer p-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <h4 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">{item.name}</h4>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              {getTemplatePackageSplitTypeLabel(item.splitType)}
                            </span>
                            <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              {item.dayCount} 训练日
                            </span>
                          </div>
                        </div>
                        <Link 
                          href={`/training/template-packages/${item.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-50 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-blue-600 dark:bg-zinc-800"
                        >
                          <span className="text-xs font-black">详情</span>
                        </Link>
                      </div>

                      <div className={`mt-4 grid transition-all duration-300 ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                        <div className="overflow-hidden">
                          <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                             <div className="space-y-2">
                               {item.dayPreviews?.map((day) => (
                                 <div key={day.dayCode} className="flex items-center justify-between rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-950/40">
                                   <div className="space-y-0.5">
                                     <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">{day.dayCode} · {day.templateName}</p>
                                     <p className="text-[10px] text-zinc-500 line-clamp-1">{day.topExercises.join(" / ")}</p>
                                   </div>
                                   <span className="text-[10px] font-bold text-zinc-400">{day.unitCount} 动作</span>
                                 </div>
                               ))}
                             </div>

                             {/* Use this Template Button - The Big One */}
                             <button
                               type="button"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 void onSelectPackage(item.id);
                                 setStep(2);
                               }}
                               className="w-full rounded-2xl bg-zinc-900 py-4 text-sm font-black text-white shadow-xl transition-all active:scale-[0.98] dark:bg-blue-600"
                             >
                               使用此计划包并继续下一步
                             </button>
                             <p className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Commit Selection</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}


      {!loading && bootstrap && step === 2 ? (
        <div className="space-y-6">
          <AppCard className="space-y-5">
            {!selectedPackage ? (
              <EmptyState title="请先选择计划包" />
            ) : (
              <>
                <div className="space-y-1 px-1">
                  <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50">排期参数设定</h4>
                  <p className="text-[11px] font-medium text-zinc-400">选择计划开始日期以及希望维持的周期。</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">开始执行日</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="w-full rounded-2xl border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold text-zinc-800 outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">计划周期 (周)</span>
                    <input
                      type="number"
                      min={1}
                      value={durationWeeks}
                      onChange={(event) => setDurationWeeks(Math.max(1, Number(event.target.value) || 1))}
                      className="w-full rounded-2xl border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-bold text-zinc-800 outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={!canGoNextStep}
                      onClick={() => setStep(3)}
                      className="flex-1 rounded-xl bg-zinc-900 py-4 text-sm font-black text-white shadow-xl dark:bg-blue-600 disabled:opacity-50"
                    >
                      继续下一步
                    </button>
                  </div>
                </div>
              </>
            )}
          </AppCard>
        </div>
      ) : null}

      {!loading && bootstrap && step === 3 ? (
        <div className="space-y-6">
          <AppCard className="space-y-5">
            {!selectedPackage ? (
              <EmptyState title="请先选择计划包" />
            ) : (
              <>
                <div className="space-y-1 px-1">
                  <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50">排期生成最终预览</h4>
                  <p className="text-[11px] font-medium text-zinc-400">核对以下生成详情，确认无误后点击下方按钮正式写入排期。</p>
                </div>
                <div className="grid grid-cols-2 gap-4 rounded-3xl bg-zinc-50 p-5 dark:bg-zinc-900/50">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400/60 font-bold">开始执行时间</span>
                    <p className="text-[13px] font-black text-zinc-900 dark:text-zinc-100">{startDate}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400/60 font-bold">拟生成的周数</span>
                    <p className="text-[13px] font-black text-zinc-900 dark:text-zinc-100">{durationWeeks} 周</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                  <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                    📅
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black text-blue-900 dark:text-blue-100">核心排期确认</p>
                    <p className="text-[10px] font-medium text-blue-700/70 dark:text-blue-400/70">写入后您可在“训练日程”中直接开始执行这些训练。</p>
                  </div>
                </div>
              </>
            )}
          </AppCard>

          {selectedPackage ? (
            <AppCard className="space-y-4">
              <div className="space-y-1 px-1">
                <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                  排期前起算锚点确认
                </h4>
                <p className="text-[11px] font-medium text-zinc-400">
                  模板页里保存的是起算锚点草稿，不是永久处方字段。这里会把所有动作的首次默认值统一拉出来核对；你可以直接手改，也可以稍后让 AI 往同一份锚点里填建议。
                </p>
              </div>

              <div className="space-y-4">
                {selectedPackage.days.map((day) => (
                  <div
                    key={day.id}
                    className="rounded-[1.75rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">
                          {day.dayCode}
                        </p>
                        <h5 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                          {day.label}
                        </h5>
                      </div>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                        {day.units.length} 个动作
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {day.units.map((unit) => {
                        const unitKey = `${day.id}:${unit.sequenceNo}`;
                        const anchor = entryAnchorMap.get(unitKey);
                        if (!anchor) {
                          return null;
                        }

                        const supportsDuration = anchor.recordMode === "sets_time";
                        const supportsAssist = anchor.recordingMode === "assisted";
                        const supportsAdditional = anchor.recordingMode === "bodyweight_load";
                        const supportsExternalLoad =
                          anchor.loadModel === "external" &&
                          !supportsDuration &&
                          anchor.recordingMode !== "reps_only";
                        const supportsRest = true;
                        const supportsRir =
                          anchor.recordingMode === "strength" ||
                          anchor.recordingMode === "bodyweight_load" ||
                          anchor.recordingMode === "assisted";
                        const supportsTempo = supportsRir;

                        return (
                          <div
                            key={unitKey}
                            className="rounded-[1.25rem] border border-zinc-200 bg-white/90 p-4 dark:border-zinc-800 dark:bg-zinc-950/70"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h6 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                                    {anchor.exerciseName}
                                  </h6>
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                                    第 {anchor.unitSequenceNo} 项
                                  </span>
                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                    {getEntryAnchorSourceLabel(anchor.source)}
                                  </span>
                                  {anchor.trigger ? (
                                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                                      {getAiTriggerLabel(anchor.trigger)}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-[10px] font-semibold text-zinc-400">
                                  {anchor.recordingMode
                                    ? getRecordingModeLabel(anchor.recordingMode as never)
                                    : "未标记记录方式"}{" "}
                                  · 当前值：{getEntryAnchorValueSummary(anchor)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                              <label className="space-y-1">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                  组数
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={anchor.setCount ?? ""}
                                  onChange={(event) =>
                                    updateEntryAnchor(unitKey, {
                                      setCount: (() => {
                                        const parsed = parseOptionalNumber(event.target.value);
                                        return parsed === null ? null : Math.max(1, Math.trunc(parsed));
                                      })(),
                                    })
                                  }
                                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                />
                              </label>

                              {supportsDuration ? (
                                <label className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    时长（秒）
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={anchor.durationSeconds ?? ""}
                                    onChange={(event) =>
                                      updateEntryAnchor(unitKey, {
                                        durationSeconds: (() => {
                                          const parsed = parseOptionalNumber(event.target.value);
                                          return parsed === null ? null : Math.max(1, Math.trunc(parsed));
                                        })(),
                                      })
                                    }
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                </label>
                              ) : (
                                <label className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    次数
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={anchor.reps ?? ""}
                                    onChange={(event) =>
                                      updateEntryAnchor(unitKey, {
                                        reps: (() => {
                                          const parsed = parseOptionalNumber(event.target.value);
                                          return parsed === null ? null : Math.max(1, Math.trunc(parsed));
                                        })(),
                                      })
                                    }
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                </label>
                              )}

                              {supportsExternalLoad ? (
                                <label className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    重量
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={anchor.loadValue ?? ""}
                                    onChange={(event) =>
                                      updateEntryAnchor(unitKey, {
                                        loadValue: parseOptionalNumber(event.target.value),
                                      })
                                    }
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                </label>
                              ) : null}

                              {supportsAdditional ? (
                                <label className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    附重
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={anchor.additionalLoadValue ?? ""}
                                    onChange={(event) =>
                                      updateEntryAnchor(unitKey, {
                                        additionalLoadValue: parseOptionalNumber(event.target.value),
                                      })
                                    }
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                </label>
                              ) : null}

                              {supportsAssist ? (
                                <label className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    辅助重量
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={anchor.assistWeight ?? ""}
                                    onChange={(event) =>
                                      updateEntryAnchor(unitKey, {
                                        assistWeight: parseOptionalNumber(event.target.value),
                                      })
                                    }
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                </label>
                              ) : null}

                              {supportsRest ? (
                                <label className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    休息（秒）
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={anchor.restSeconds ?? ""}
                                    onChange={(event) =>
                                      updateEntryAnchor(unitKey, {
                                        restSeconds: (() => {
                                          const parsed = parseOptionalNumber(event.target.value);
                                          return parsed === null ? null : Math.max(1, Math.trunc(parsed));
                                        })(),
                                      })
                                    }
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                </label>
                              ) : null}

                              {supportsRir ? (
                                <label className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    默认 RIR
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={5}
                                    step={0.5}
                                    value={anchor.recommendedRir ?? ""}
                                    onChange={(event) =>
                                      updateEntryAnchor(unitKey, {
                                        recommendedRir: parseOptionalNumber(event.target.value),
                                      })
                                    }
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                  />
                                </label>
                              ) : null}

                              {supportsTempo ? (
                                <label className="col-span-2 space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                    动作节奏
                                  </span>
                                  <input
                                    value={formatTempoInput(anchor.tempo)}
                                    onChange={(event) =>
                                      updateEntryAnchor(unitKey, {
                                        tempo: parseTempoInput(event.target.value),
                                      })
                                    }
                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                    placeholder="例如 3-1-1-0"
                                  />
                                </label>
                              ) : null}
                            </div>

                            {anchor.logicSummary ? (
                              <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-3 py-3 text-[11px] font-medium text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-100">
                                <p className="font-black">AI 说明</p>
                                <p className="mt-1">{anchor.logicSummary}</p>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </AppCard>
          ) : null}

          {selectedPackage ? (
            <AppCard className="space-y-4">
              <div className="space-y-1 px-1">
                <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50">动作起始基准 AI 助手</h4>
                <p className="text-[11px] font-medium text-zinc-400">
                  这些动作可能是首次使用、间隔较久，或当前进步逻辑发生变化。AI 会先给首次训练默认值，真正确认发生在第一次实际训练时。
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-[1.75rem] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">待重估动作</p>
                  <p className="text-base font-black text-blue-900 dark:text-blue-100">{aiAnchorPreview.candidateCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">首次入口</p>
                  <p className="text-base font-black text-blue-900 dark:text-blue-100">{aiAnchorPreview.targetCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">已生成建议</p>
                  <p className="text-base font-black text-blue-900 dark:text-blue-100">{aiAnchorPreview.recommendedCandidateCount}</p>
                </div>
                <div className="col-span-3 rounded-2xl bg-white/80 px-3 py-3 text-[11px] font-medium text-blue-800 dark:bg-zinc-950/60 dark:text-blue-100">
                  生成后，这些动作的<strong>首次训练默认值</strong>会先按 AI 临时基准填写；第一次真正训练时不修改，就等于直接采纳。完成首次训练后，系统会用这次结果更新后续安排。
                </div>
              </div>

              {aiCandidatesLoading ? (
                <SkeletonRows rows={4} />
              ) : aiCandidates.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50/60 p-5 text-center text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
                  当前计划包里没有需要 AI 重估的动作，首次训练将直接沿用现有逻辑与默认值。
                </div>
              ) : (
                <>
                  {aiCandidatesError ? <InlineAlert tone="error">{aiCandidatesError}</InlineAlert> : null}
                  {aiAnchorPreview.pendingCandidateCount > 0 ? (
                    <InlineAlert tone="info">
                      还有 {aiAnchorPreview.pendingCandidateCount} 个动作尚未生成 AI 临时基准；如果现在直接确认排期，这些动作会继续沿用现有默认值。
                    </InlineAlert>
                  ) : null}
                  <div className="space-y-4">
                    {aiCandidates.map((candidate) => {
                      const factor = aiFactorMap[candidate.key] ?? buildDefaultAiFactor(candidate.key);
                      const recommendation = aiRecommendations[candidate.key] ?? null;
                      return (
                        <article
                          key={candidate.key}
                          className="rounded-[1.75rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h5 className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                                  {candidate.exerciseName}
                                </h5>
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                                  {getAiTriggerLabel(candidate.trigger)}
                                </span>
                              </div>
                              <p className="text-[11px] font-medium text-zinc-500">
                                将先写入：{candidate.targets.map((item) => `${item.dayCode} · 第${item.unitSequenceNo}项`).join(" / ")}
                              </p>
                              <p className="text-[10px] font-semibold text-zinc-400">
                                当前逻辑：{candidate.currentLogic.progressionPolicyType}
                                {candidate.history.daysSinceLastPerformed !== null
                                  ? ` · 距上次训练 ${candidate.history.daysSinceLastPerformed} 天`
                                  : " · 当前无动作历史"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <label className="space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">训练连续性</span>
                              <select
                                value={factor.continuity}
                                onChange={(event) =>
                                  updateAiFactor(candidate.key, "continuity", event.target.value as TrainingPlanningAiAnchorFactor["continuity"])
                                }
                                className="w-full rounded-2xl border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="unknown">系统判断即可</option>
                                <option value="consistent">一直在练</option>
                                <option value="intermittent">断断续续</option>
                                <option value="stopped">基本停练</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">相似动作</span>
                              <select
                                value={factor.similarWork}
                                onChange={(event) =>
                                  updateAiFactor(candidate.key, "similarWork", event.target.value as TrainingPlanningAiAnchorFactor["similarWork"])
                                }
                                className="w-full rounded-2xl border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="unknown">系统判断即可</option>
                                <option value="plenty">练得很多</option>
                                <option value="some">练过一些</option>
                                <option value="none">几乎没有</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">近期偏向</span>
                              <select
                                value={factor.recentFocus}
                                onChange={(event) =>
                                  updateAiFactor(candidate.key, "recentFocus", event.target.value as TrainingPlanningAiAnchorFactor["recentFocus"])
                                }
                                className="w-full rounded-2xl border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="unknown">系统判断即可</option>
                                <option value="strength">偏力量</option>
                                <option value="hypertrophy">偏增肌</option>
                                <option value="conditioning">偏体能/其它项目</option>
                                <option value="mixed">综合训练</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">身体变化</span>
                              <select
                                value={factor.bodyChange}
                                onChange={(event) =>
                                  updateAiFactor(candidate.key, "bodyChange", event.target.value as TrainingPlanningAiAnchorFactor["bodyChange"])
                                }
                                className="w-full rounded-2xl border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                              >
                                <option value="unknown">系统判断即可</option>
                                <option value="better">感觉更强/更稳</option>
                                <option value="stable">变化不大</option>
                                <option value="worse">感觉变差了</option>
                              </select>
                            </label>
                          </div>

                          {recommendation ? (
                            <div className="mt-4 rounded-[1.25rem] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-black text-blue-900 dark:text-blue-100">AI 临时起点</p>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-blue-600 dark:bg-zinc-950 dark:text-blue-300">
                                  置信度 {recommendation.confidence}
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-black text-zinc-900 dark:text-zinc-100">
                                {recommendation.recommendedSetCount
                                  ? `${recommendation.recommendedSetCount}组 · `
                                  : ""}
                                {recommendation.recommendedLoadValue !== null && recommendation.recommendedLoadValue !== undefined
                                  ? `${recommendation.recommendedLoadValue}kg`
                                  : recommendation.recommendedAssistWeight !== null && recommendation.recommendedAssistWeight !== undefined
                                    ? `辅助 ${recommendation.recommendedAssistWeight}kg`
                                  : recommendation.recommendedAdditionalLoadValue !== null && recommendation.recommendedAdditionalLoadValue !== undefined
                                    ? `附重 ${recommendation.recommendedAdditionalLoadValue}kg`
                                    : recommendation.recommendedDurationSeconds
                                      ? `${recommendation.recommendedDurationSeconds} 秒`
                                      : "-"}
                                {recommendation.recommendedReps ? ` · ${recommendation.recommendedReps}次` : ""}
                                {recommendation.recommendedRestSeconds
                                  ? ` · 休息${recommendation.recommendedRestSeconds}s`
                                  : ""}
                                {recommendation.recommendedTempo
                                  ? ` · 节奏 ${recommendation.recommendedTempo.join("-")}`
                                  : ""}
                                {recommendation.recommendedRir !== null && recommendation.recommendedRir !== undefined
                                  ? ` · RIR ${recommendation.recommendedRir}`
                                  : ""}
                              </p>
                              <p className="mt-2 text-[11px] font-medium text-zinc-500">
                                {recommendation.logicSummary}
                              </p>
                              <p className="mt-2 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                这份建议已经写入上方锚点确认表，你还可以继续手动调整。
                              </p>
                              <ul className="mt-3 space-y-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                                {recommendation.reasons.map((reason) => (
                                  <li key={reason}>• {reason}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={aiGenerating}
                    onClick={() => void handleGenerateAiRecommendations()}
                    className="w-full rounded-2xl border border-blue-200 bg-blue-50 py-3 text-sm font-black text-blue-700 transition-all active:scale-[0.98] disabled:opacity-60 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300"
                  >
                    {aiGenerating ? "AI 正在生成临时基准..." : "生成 AI 临时基准"}
                  </button>
                </>
              )}
            </AppCard>
          ) : null}

          <div className="rounded-3xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/30">
            <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-4 text-center">生成摘要快照</h5>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
              <div className="space-y-1">
                <p className="text-zinc-400 font-medium text-[10px]">拟启动计划包</p>
                <p className="truncate font-black text-zinc-900 dark:text-zinc-100">{selectedPackage?.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-zinc-400 font-medium">预计频次</p>
                <p className="font-black text-zinc-900 dark:text-zinc-100">{estimateGeneratedSessions(selectedPackage, durationWeeks)} 次训练</p>
              </div>
              <div className="space-y-1">
                <p className="text-zinc-400 font-medium">周分化</p>
                <p className="font-black text-zinc-900 dark:text-zinc-100">{selectedPackage?.microcycleSummary.slotPreview}</p>
              </div>
              <div className="space-y-1 text-right">
                 <label className="inline-flex cursor-pointer items-center gap-2">
                   <input
                     type="checkbox"
                     checked={replaceFuture}
                     onChange={(e) => setReplaceFuture(e.target.checked)}
                     className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                   />
                   <span className="text-[10px] font-bold text-zinc-500">覆盖未来</span>
                 </label>
              </div>
            </div>
          </div>

          <div className="px-1 space-y-3">
             <button
               type="button"
               disabled={saving || !canGoNextStep || !selectedPackage}
               onClick={() => setPendingScopeChoice(true)}
               className="flex h-16 w-full items-center justify-center rounded-2xl bg-zinc-900 text-sm font-black text-white shadow-2xl transition-all active:scale-95 disabled:opacity-50 dark:bg-blue-600"
             >
               {saving ? "正在注入排期..." : "确认排期并启动计划"}
             </button>
             <button
                type="button"
                disabled={saving}
                onClick={() => setStep(2)}
                className="w-full py-3 text-[11px] font-black uppercase tracking-widest text-zinc-400"
             >
                返回修改排期
             </button>
          </div>
        </div>
      ) : null}


      {pendingScopeChoice && step === 3 ? (
        <AppCard className="space-y-3" emphasis="soft">
          <p className="text-sm font-semibold text-zinc-900">Step 2 改动范围</p>
          <p className="text-xs text-zinc-600">
            请选择这次进步逻辑调整的生效范围。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleGenerate("plan_only")}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white"
            >
              仅本次计划
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleGenerate("package_default")}
              className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700"
            >
              回写计划包默认
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setPendingScopeChoice(false)}
              className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700"
            >
              取消
            </button>
          </div>
        </AppCard>
      ) : null}

      {selectedDrawerUnit ? (
        <ProgressionPolicyConfigDrawer
          open={drawerState.open}
          title={`${selectedDrawerUnit.dayCode} · ${selectedDrawerUnit.exerciseName} 进步配置`}
          value={normalizePolicyConfig({
            progressionFamily: selectedDrawerUnit.progressionFamily,
            progressionPolicyType: selectedDrawerUnit.progressionPolicyType,
            progressionPolicyConfig: selectedDrawerUnit.progressionPolicyConfig,
            adjustmentPolicyType: selectedDrawerUnit.adjustmentPolicyType as
              | "always"
              | "rotating_pool"
              | "gated"
              | "manual",
            adjustmentPolicyConfig: selectedDrawerUnit.adjustmentPolicyConfig,
            successCriteria: selectedDrawerUnit.successCriteria,
            progressTrackKey: selectedDrawerUnit.progressTrackKey,
          })}
          onApply={(next: ProgressionConfigValue) => {
            if (!drawerState.key) return;
            updateDraft(drawerState.key, (current) => ({
              ...current,
              progressionFamily: next.progressionFamily,
              progressionPolicyType: next.progressionPolicyType,
              progressionPolicyConfig: next.progressionPolicyConfig,
              adjustmentPolicyType: next.adjustmentPolicyType ?? current.adjustmentPolicyType,
              adjustmentPolicyConfig: next.adjustmentPolicyConfig ?? {},
              successCriteria: next.successCriteria ?? {},
              progressTrackKey: next.progressTrackKey ?? current.progressTrackKey,
            }));
          }}
          onClose={() => setDrawerState({ open: false, key: null })}
          advancedEnabled
          disabled={saving}
        />
      ) : null}
    </section>
  );
}
