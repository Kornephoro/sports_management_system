"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  getOnboardingTrainingProfile,
  OnboardingTrainingProfile,
  saveOnboardingTrainingProfile,
} from "@/features/onboarding/onboarding-api";
import {
  AppCard,
  InlineAlert,
  PageContainer,
  PageHeader,
} from "@/features/shared/components/ui-primitives";

type TrainingProfilePageClientProps = {
  userId: string;
};

type ConfidenceLevel = "low" | "medium" | "high";
type ExperienceLevel = "beginner" | "intermediate" | "advanced";
type MovementCompetency = "none" | "basic" | "confident";
type EquipmentEnvironment = "commercial_gym" | "home_gym" | "limited" | "bodyweight_only";
type PainStatus = "none" | "minor" | "active";
type ReturnState = "no_break" | "short_break" | "long_break" | "rehab_return";

type FormState = {
  experienceLevel: ExperienceLevel;
  trainingAgeMonths: string;
  recentFrequencyPerWeek: string;
  followedFormalProgram: boolean | null;
  tracksLoadAndReps: boolean | null;
  understandsRpeRir: boolean | null;
  weeklyTrainingDays: string;
  sessionDurationMin: string;
  detrainingGapDays: string;
  recoveryConfidence: ConfidenceLevel;
  equipmentEnvironment: EquipmentEnvironment;
  currentPainStatus: PainStatus;
  restrictedRegionsText: string;
  restrictedMovementsText: string;
  extraSportsText: string;
  movementCompetencies: {
    squat: MovementCompetency;
    hipHinge: MovementCompetency;
    horizontalPush: MovementCompetency;
    horizontalPull: MovementCompetency;
    verticalPush: MovementCompetency;
    verticalPull: MovementCompetency;
  };
  notes: string;
};

const EXPERIENCE_OPTIONS: Array<{ value: ExperienceLevel; label: string }> = [
  { value: "beginner", label: "新手" },
  { value: "intermediate", label: "中级" },
  { value: "advanced", label: "高级" },
];

const CONFIDENCE_OPTIONS: Array<{ value: ConfidenceLevel; label: string }> = [
  { value: "low", label: "偏低" },
  { value: "medium", label: "一般" },
  { value: "high", label: "较高" },
];

const COMPETENCY_OPTIONS: Array<{ value: MovementCompetency; label: string }> = [
  { value: "none", label: "不会 / 很不熟" },
  { value: "basic", label: "会做基础版本" },
  { value: "confident", label: "比较熟练" },
];

const EQUIPMENT_OPTIONS: Array<{ value: EquipmentEnvironment; label: string }> = [
  { value: "commercial_gym", label: "商业健身房" },
  { value: "home_gym", label: "家庭健身房" },
  { value: "limited", label: "器械有限" },
  { value: "bodyweight_only", label: "只能徒手" },
];

const PAIN_OPTIONS: Array<{ value: PainStatus; label: string }> = [
  { value: "none", label: "没有明显疼痛" },
  { value: "minor", label: "有轻微不适" },
  { value: "active", label: "当前有明显问题" },
];

const MOVEMENT_LABELS: Array<{
  key: keyof FormState["movementCompetencies"];
  label: string;
}> = [
  { key: "squat", label: "深蹲模式" },
  { key: "hipHinge", label: "髋铰链" },
  { key: "horizontalPush", label: "水平推" },
  { key: "horizontalPull", label: "水平拉" },
  { key: "verticalPush", label: "垂直推" },
  { key: "verticalPull", label: "垂直拉" },
];

function createDefaultFormState(): FormState {
  return {
    experienceLevel: "beginner",
    trainingAgeMonths: "",
    recentFrequencyPerWeek: "",
    followedFormalProgram: null,
    tracksLoadAndReps: null,
    understandsRpeRir: null,
    weeklyTrainingDays: "",
    sessionDurationMin: "",
    detrainingGapDays: "",
    recoveryConfidence: "medium",
    equipmentEnvironment: "commercial_gym",
    currentPainStatus: "none",
    restrictedRegionsText: "",
    restrictedMovementsText: "",
    extraSportsText: "",
    movementCompetencies: {
      squat: "none",
      hipHinge: "none",
      horizontalPush: "none",
      horizontalPull: "none",
      verticalPush: "none",
      verticalPull: "none",
    },
    notes: "",
  };
}

function parseNumberText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function parseListText(value: string) {
  return value
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatListText(values: string[]) {
  return values.join("、");
}

function toCompetencyScore(value: MovementCompetency) {
  if (value === "confident") return 2;
  if (value === "basic") return 1;
  return 0;
}

function deriveTechniqueConfidence(movementCompetencies: FormState["movementCompetencies"]) {
  const total = Object.values(movementCompetencies).reduce(
    (sum, item) => sum + toCompetencyScore(item),
    0,
  );
  if (total >= 9) return "high" as const;
  if (total >= 4) return "medium" as const;
  return "low" as const;
}

function deriveProgressionLiteracy(args: {
  followedFormalProgram: boolean | null;
  tracksLoadAndReps: boolean | null;
  understandsRpeRir: boolean | null;
}) {
  const score = [
    args.followedFormalProgram,
    args.tracksLoadAndReps,
    args.understandsRpeRir,
  ].filter(Boolean).length;
  if (score >= 3) return "high" as const;
  if (score >= 2) return "medium" as const;
  return "low" as const;
}

function deriveReturnState(args: {
  detrainingGapDays: number | null;
  currentPainStatus: PainStatus;
  restrictedRegionCount: number;
}): ReturnState {
  if (args.currentPainStatus === "active" && args.restrictedRegionCount > 0) {
    return "rehab_return";
  }
  if ((args.detrainingGapDays ?? 0) >= 84) {
    return "long_break";
  }
  if ((args.detrainingGapDays ?? 0) >= 14) {
    return "short_break";
  }
  return "no_break";
}

function deriveSuggestedLevel(args: {
  trainingAgeMonths: number | null;
  recentFrequencyPerWeek: number | null;
  techniqueConfidence: ConfidenceLevel;
  progressionLiteracy: ConfidenceLevel;
  followedFormalProgram: boolean | null;
  returnState: ReturnState;
}): ExperienceLevel {
  let score = 0;
  if ((args.trainingAgeMonths ?? 0) >= 24) score += 2;
  else if ((args.trainingAgeMonths ?? 0) >= 6) score += 1;
  if ((args.recentFrequencyPerWeek ?? 0) >= 4) score += 1;
  else if ((args.recentFrequencyPerWeek ?? 0) >= 2) score += 0.5;
  if (args.techniqueConfidence === "high") score += 1.5;
  else if (args.techniqueConfidence === "medium") score += 0.5;
  if (args.progressionLiteracy === "high") score += 1.5;
  else if (args.progressionLiteracy === "medium") score += 0.5;
  if (args.followedFormalProgram) score += 1;
  if (args.returnState === "long_break" || args.returnState === "rehab_return") score -= 1.5;
  else if (args.returnState === "short_break") score -= 0.5;

  if (score >= 5) return "advanced";
  if (score >= 2) return "intermediate";
  return "beginner";
}

function getConfidenceLabel(value: ConfidenceLevel) {
  return CONFIDENCE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function getExperienceLabel(value: ExperienceLevel) {
  return EXPERIENCE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function getReturnStateLabel(value: ReturnState) {
  switch (value) {
    case "short_break":
      return "短期停练后回归";
    case "long_break":
      return "长期停练后回归";
    case "rehab_return":
      return "带限制回归训练";
    case "no_break":
    default:
      return "正常连续训练";
  }
}

function createFormStateFromProfile(profile: OnboardingTrainingProfile): FormState {
  return {
    experienceLevel: profile.experience_level,
    trainingAgeMonths:
      profile.training_age_months !== null ? String(profile.training_age_months) : "",
    recentFrequencyPerWeek:
      profile.recent_frequency_per_week !== null
        ? String(profile.recent_frequency_per_week)
        : "",
    followedFormalProgram: profile.followed_formal_program,
    tracksLoadAndReps: profile.tracks_load_and_reps,
    understandsRpeRir: profile.understands_rpe_rir,
    weeklyTrainingDays:
      profile.weekly_training_days !== null ? String(profile.weekly_training_days) : "",
    sessionDurationMin:
      profile.session_duration_min !== null ? String(profile.session_duration_min) : "",
    detrainingGapDays:
      profile.detraining_gap_days !== null ? String(profile.detraining_gap_days) : "",
    recoveryConfidence: profile.recovery_confidence,
    equipmentEnvironment: profile.equipment_environment,
    currentPainStatus: profile.current_pain_status,
    restrictedRegionsText: formatListText(profile.restricted_regions),
    restrictedMovementsText: formatListText(profile.restricted_movements),
    extraSportsText: formatListText(profile.extra_sports),
    movementCompetencies: {
      squat: profile.movement_competencies.squat,
      hipHinge: profile.movement_competencies.hip_hinge,
      horizontalPush: profile.movement_competencies.horizontal_push,
      horizontalPull: profile.movement_competencies.horizontal_pull,
      verticalPush: profile.movement_competencies.vertical_push,
      verticalPull: profile.movement_competencies.vertical_pull,
    },
    notes: profile.notes ?? "",
  };
}

function BooleanChoiceField(props: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  const options: Array<{ value: boolean | null; label: string }> = [
    { value: true, label: "是" },
    { value: false, label: "否" },
    { value: null, label: "不确定" },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-black text-zinc-600 dark:text-zinc-300">{props.label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = props.value === option.value;
          return (
            <button
              key={`${props.label}:${String(option.value)}`}
              type="button"
              onClick={() => props.onChange(option.value)}
              className={
                active
                  ? "rounded-full border border-blue-500 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200"
                  : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TrainingProfilePageClient({ userId }: TrainingProfilePageClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(createDefaultFormState);
  const [savedProfile, setSavedProfile] = useState<OnboardingTrainingProfile | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await getOnboardingTrainingProfile(userId);
        if (cancelled) {
          return;
        }
        setSavedProfile(result.profile);
        if (result.profile) {
          setForm(createFormStateFromProfile(result.profile));
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "首次画像加载失败",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const preview = useMemo(() => {
    const trainingAgeMonths = parseNumberText(form.trainingAgeMonths);
    const recentFrequencyPerWeek = parseNumberText(form.recentFrequencyPerWeek);
    const detrainingGapDays = parseNumberText(form.detrainingGapDays);
    const restrictedRegions = parseListText(form.restrictedRegionsText);
    const techniqueConfidence = deriveTechniqueConfidence(form.movementCompetencies);
    const progressionLiteracy = deriveProgressionLiteracy({
      followedFormalProgram: form.followedFormalProgram,
      tracksLoadAndReps: form.tracksLoadAndReps,
      understandsRpeRir: form.understandsRpeRir,
    });
    const returnState = deriveReturnState({
      detrainingGapDays,
      currentPainStatus: form.currentPainStatus,
      restrictedRegionCount: restrictedRegions.length,
    });
    const suggestedLevel = deriveSuggestedLevel({
      trainingAgeMonths,
      recentFrequencyPerWeek,
      techniqueConfidence,
      progressionLiteracy,
      followedFormalProgram: form.followedFormalProgram,
      returnState,
    });

    return {
      techniqueConfidence,
      progressionLiteracy,
      returnState,
      suggestedLevel,
      restrictedRegions,
    };
  }, [form]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const saved = await saveOnboardingTrainingProfile({
        userId,
        experienceLevel: form.experienceLevel,
        trainingAgeMonths: parseNumberText(form.trainingAgeMonths),
        recentFrequencyPerWeek: parseNumberText(form.recentFrequencyPerWeek),
        followedFormalProgram: form.followedFormalProgram,
        tracksLoadAndReps: form.tracksLoadAndReps,
        understandsRpeRir: form.understandsRpeRir,
        weeklyTrainingDays: parseNumberText(form.weeklyTrainingDays),
        sessionDurationMin: parseNumberText(form.sessionDurationMin),
        detrainingGapDays: parseNumberText(form.detrainingGapDays),
        recoveryConfidence: form.recoveryConfidence,
        equipmentEnvironment: form.equipmentEnvironment,
        currentPainStatus: form.currentPainStatus,
        restrictedRegions: parseListText(form.restrictedRegionsText),
        restrictedMovements: parseListText(form.restrictedMovementsText),
        extraSports: parseListText(form.extraSportsText),
        movementCompetencies: form.movementCompetencies,
        notes: form.notes.trim() ? form.notes.trim() : null,
      });
      setSavedProfile(saved);
      setForm(createFormStateFromProfile(saved));
      setMessage({
        tone: "success",
        text: "首次训练画像已保存，后续 AI 建包和起算锚点推荐都会读取这份画像。",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "首次画像保存失败",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer className="space-y-6 py-8">
      <PageHeader
        title="首次训练画像"
        description="这不是一次性问卷，而是一份会持续喂给 AI 的结构化训练画像。建包、起算锚点、恢复判断和回归训练都会读这里。"
      />

      {message ? <InlineAlert tone={message.tone}>{message.text}</InlineAlert> : null}

      <AppCard className="space-y-4">
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-500">
            AI Shared Factors
          </p>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50">
            当前画像摘要
          </h2>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            保存后系统会同时拿到你的基础分级、回归状态、器械环境、限制信息和动作熟练度。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">系统建议等级</p>
            <p className="mt-2 text-lg font-black text-zinc-900 dark:text-zinc-100">
              {getExperienceLabel(preview.suggestedLevel)}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">回归状态</p>
            <p className="mt-2 text-sm font-black text-zinc-900 dark:text-zinc-100">
              {getReturnStateLabel(preview.returnState)}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">动作信心</p>
            <p className="mt-2 text-sm font-black text-zinc-900 dark:text-zinc-100">
              {getConfidenceLabel(preview.techniqueConfidence)}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">进步逻辑理解</p>
            <p className="mt-2 text-sm font-black text-zinc-900 dark:text-zinc-100">
              {getConfidenceLabel(preview.progressionLiteracy)}
            </p>
          </div>
        </div>

        {savedProfile ? (
          <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            上次更新：{new Date(savedProfile.updated_at).toLocaleString("zh-CN")}
          </p>
        ) : (
          <InlineAlert tone="info">
            当前还没有已保存画像。填完后，后续首次上计划和 AI 建包就不会再用空白背景做判断。
          </InlineAlert>
        )}
      </AppCard>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <AppCard className="space-y-4">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">训练背景</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">你当前自评等级</span>
              <select
                value={form.experienceLevel}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    experienceLevel: event.target.value as ExperienceLevel,
                  }))
                }
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {EXPERIENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">累计训练月数</span>
              <input
                value={form.trainingAgeMonths}
                onChange={(event) =>
                  setForm((current) => ({ ...current, trainingAgeMonths: event.target.value }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="例如 6 / 24 / 60"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">最近每周训练频次</span>
              <input
                value={form.recentFrequencyPerWeek}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    recentFrequencyPerWeek: event.target.value,
                  }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="例如 3"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">最近停练天数</span>
              <input
                value={form.detrainingGapDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, detrainingGapDays: event.target.value }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="没有就填 0"
              />
            </label>
          </div>

          <BooleanChoiceField
            label="是否跟过正式训练计划"
            value={form.followedFormalProgram}
            onChange={(value) =>
              setForm((current) => ({ ...current, followedFormalProgram: value }))
            }
          />
          <BooleanChoiceField
            label="是否会持续记录重量与次数"
            value={form.tracksLoadAndReps}
            onChange={(value) =>
              setForm((current) => ({ ...current, tracksLoadAndReps: value }))
            }
          />
          <BooleanChoiceField
            label="是否理解 RPE / RIR"
            value={form.understandsRpeRir}
            onChange={(value) =>
              setForm((current) => ({ ...current, understandsRpeRir: value }))
            }
          />
        </AppCard>

        <AppCard className="space-y-4">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">时间、恢复与环境</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">你准备每周练几天</span>
              <input
                value={form.weeklyTrainingDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, weeklyTrainingDays: event.target.value }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="例如 4"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">单次可训练时长（分钟）</span>
              <input
                value={form.sessionDurationMin}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sessionDurationMin: event.target.value }))
                }
                inputMode="numeric"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                placeholder="例如 60 / 90"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">恢复信心</span>
              <select
                value={form.recoveryConfidence}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    recoveryConfidence: event.target.value as ConfidenceLevel,
                  }))
                }
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {CONFIDENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">训练环境</span>
              <select
                value={form.equipmentEnvironment}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    equipmentEnvironment: event.target.value as EquipmentEnvironment,
                  }))
                }
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {EQUIPMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </AppCard>

        <AppCard className="space-y-4">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">限制与额外运动</h3>
          <label className="space-y-2">
            <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">当前疼痛 / 限制状态</span>
            <select
              value={form.currentPainStatus}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  currentPainStatus: event.target.value as PainStatus,
                }))
              }
              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {PAIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">受限部位</span>
            <textarea
              value={form.restrictedRegionsText}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  restrictedRegionsText: event.target.value,
                }))
              }
              rows={2}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="例如 肩、下背、右膝"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">受限动作 / 避免动作</span>
            <textarea
              value={form.restrictedMovementsText}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  restrictedMovementsText: event.target.value,
                }))
              }
              rows={2}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="例如 过头推、深度卧推、冲刺跑"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">额外运动 / 体力背景</span>
            <textarea
              value={form.extraSportsText}
              onChange={(event) =>
                setForm((current) => ({ ...current, extraSportsText: event.target.value }))
              }
              rows={2}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="例如 篮球、跑步、体力劳动、骑行"
            />
          </label>
        </AppCard>

        <AppCard className="space-y-4">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">基础动作熟练度</h3>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            这些字段会直接影响系统对动作选择、首次起算锚点和回归训练保守程度的判断。
          </p>

          <div className="space-y-4">
            {MOVEMENT_LABELS.map((item) => (
              <label key={item.key} className="space-y-2">
                <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">
                  {item.label}
                </span>
                <select
                  value={form.movementCompetencies[item.key]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      movementCompetencies: {
                        ...current.movementCompetencies,
                        [item.key]: event.target.value as MovementCompetency,
                      },
                    }))
                  }
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {COMPETENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </AppCard>

        <AppCard className="space-y-4">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">补充说明</h3>
          <label className="space-y-2">
            <span className="text-xs font-black text-zinc-600 dark:text-zinc-300">备注</span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
              rows={4}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              placeholder="例如 哪些动作有心理压力、近期想优先恢复哪个部位、有哪些器械一定能用或一定用不了。"
            />
          </label>
        </AppCard>

        <div className="space-y-3">
          <button
            type="submit"
            disabled={loading || saving}
            className="w-full rounded-2xl bg-zinc-900 px-4 py-4 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-blue-600"
          >
            {saving ? "正在保存画像..." : "保存训练画像"}
          </button>
          <p className="text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            这份画像会持续影响 AI，但不是一劳永逸。你的训练背景、停练情况、限制和环境变化后，建议回来更新。
          </p>
        </div>
      </form>
    </PageContainer>
  );
}
