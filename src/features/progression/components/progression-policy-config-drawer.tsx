"use client";

import { useEffect, useMemo, useState } from "react";
import {
  asRecord,
  extractTrainingZoneFromSuccessCriteria,
  applyTrainingZoneToSuccessCriteria,
  normalizePolicyConfig,
  ProgressionConfigValue,
} from "@/features/progression/progression-policy-normalizer";
import {
  getClassicProgressionDefinitionByPolicyType,
  getClassicProgressionDefinitions,
  isClassicPolicyType,
  StrategyFieldDef,
  LinearPeriodizationStep,
} from "@/features/progression/progression-policy-schema";
import { summarizeProgressionPolicyConfig as generatePathPreview } from "@/features/progression/progression-policy-summary";
import {
  Stepper,
  InlineAlert,
  AppCard,
} from "@/features/shared/components/ui-primitives";
import { getAdjustmentPolicyTypeLabel } from "@/features/shared/ui-zh";
import { ADJUSTMENT_POLICY_TYPE_VALUES } from "@/lib/progression-standards";

export interface ProgressionPolicyConfigDrawerProps {
  open: boolean;
  onClose: () => void;
  onApply: (value: ProgressionConfigValue) => void;
  value: ProgressionConfigValue;
  title: string;
  disabled?: boolean;
  advancedEnabled?: boolean;
}

const TRAINING_ZONE_FIELDS = [
  { key: "targetRepsMin", labelZh: "次数下限" },
  { key: "targetRepsMax", labelZh: "次数上限" },
  { key: "rpeMin", labelZh: "RPE下限" },
  { key: "rpeMax", labelZh: "RPE上限" },
];

function parseLinearPeriodizationSteps(val: unknown): LinearPeriodizationStep[] {
  if (Array.isArray(val)) {
    return val as LinearPeriodizationStep[];
  }
  return [];
}

/**
 * ChoiceGroup: A mobile-friendly alternative to <select>
 */
function ChoiceGroup({ 
  label, 
  value, 
  options, 
  onChange 
}: { 
  label: string; 
  value: string; 
  options: Array<{ value: string; labelZh: string }>; 
  onChange: (val: string) => void 
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-400">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = String(value) === String(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-all active:scale-95 ${
                active 
                  ? "bg-zinc-900 text-white shadow-lg shadow-zinc-900/10 dark:bg-zinc-100 dark:text-zinc-900" 
                  : "bg-white border border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400"
              }`}
            >
              {opt.labelZh}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProgressionPolicyConfigDrawer({
  open,
  title,
  value,
  onApply,
  onClose,
  advancedEnabled = true,
  disabled = false,
}: ProgressionPolicyConfigDrawerProps) {
  const initialValue = normalizePolicyConfig(value);
  const [draft, setDraft] = useState<ProgressionConfigValue>(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const normalized = normalizePolicyConfig(value);
      setDraft(normalized);
    }
  }, [open, value]);

  const selectedDefinition = useMemo(
    () => getClassicProgressionDefinitionByPolicyType(draft.progressionPolicyType),
    [draft.progressionPolicyType]
  );

  const policyConfigRecord = useMemo(() => asRecord(draft.progressionPolicyConfig), [draft]);
  const successCriteriaRecord = useMemo(() => asRecord(draft.successCriteria), [draft]);

  const updateField = (field: StrategyFieldDef, rawValue: unknown) => {
    setDraft((current: ProgressionConfigValue) => {
      const nextPolicy = asRecord(current.progressionPolicyConfig);
      const nextSuccess = asRecord(current.successCriteria);

      if (field.source === "policy") {
        nextPolicy[field.key] = rawValue;
      } else {
        nextSuccess[field.key] = rawValue;
      }

      return normalizePolicyConfig({
        ...current,
        progressionPolicyConfig: nextPolicy,
        successCriteria: nextSuccess,
      });
    });
  };

  const updateSteps = (steps: LinearPeriodizationStep[]) => {
    setDraft((current: ProgressionConfigValue) =>
      normalizePolicyConfig({
        ...current,
        progressionPolicyConfig: { ...asRecord(current.progressionPolicyConfig), steps },
      })
    );
  };

  const switchPolicyType = (policyType: string) => {
    if (!isClassicPolicyType(policyType)) return;
    const definition = getClassicProgressionDefinitionByPolicyType(policyType);
    if (!definition) return;
    setDraft((current: ProgressionConfigValue) =>
      normalizePolicyConfig({
        ...current,
        progressionFamily: definition.progressionFamily,
        progressionPolicyType: definition.policyType,
        progressionPolicyConfig: definition.defaults.progressionPolicyConfig,
        successCriteria: applyTrainingZoneToSuccessCriteria(
          definition.defaults.successCriteria,
          extractTrainingZoneFromSuccessCriteria(current.successCriteria)
        ),
      })
    );
  };

  const handleApply = () => {
    try {
      const normalized = normalizePolicyConfig(draft);
      onApply(normalized);
      onClose();
    } catch (error) {
      setLocalError("进步逻辑配置保存失败，请检查输入后重试");
    }
  };

  const renderStrategyField = (
    field: StrategyFieldDef,
    value: unknown,
  ) => {
    if (field.input === "number") {
      return (
        <Stepper
          key={field.key}
          label={field.labelZh}
          unit={field.unit}
          value={typeof value === "number" ? value : ""}
          onValueChange={(nextValue: number) => updateField(field, nextValue)}
        />
      );
    }

    if (field.input === "select") {
      return (
        <ChoiceGroup
          key={field.key}
          label={field.labelZh}
          value={String(value ?? "")}
          options={field.options || []}
          onChange={(nextValue) => updateField(field, nextValue)}
        />
      );
    }

    if (field.input === "switch") {
      const switchOn = Boolean(value);
      return (
        <div key={field.key} className="flex items-center justify-between py-1">
          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{field.labelZh}</span>
          <button
            type="button"
            onClick={() => updateField(field, !switchOn)}
            className={`h-6 w-11 rounded-full p-1 transition-colors ${
              switchOn ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                switchOn ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      );
    }

    if (field.input === "step_table") {
      const steps = parseLinearPeriodizationSteps(value);
      return (
        <div key={field.key} className="space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {field.labelZh}
          </p>
          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div
                key={`step-${idx}`}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <input
                    value={step.name}
                    onChange={(event) => {
                      const next = [...steps];
                      next[idx] = { ...step, name: event.target.value };
                      updateSteps(next);
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs font-bold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => updateSteps(steps.filter((_, stepIndex) => stepIndex !== idx))}
                    className="rounded-lg border border-zinc-300 px-2 py-1 text-[10px] font-bold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    删除
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                  <p>组数 {step.sets}</p>
                  <p>次数 {step.reps}</p>
                  <p className="text-blue-600 dark:text-blue-400">步进 +{step.loadChange}kg</p>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateSteps([
                  ...steps,
                  { name: `Phase ${steps.length + 1}`, sets: 3, reps: 8, loadChange: 2.5 },
                ])
              }
              className="w-full rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-2 text-xs font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              添加步进阶段
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-white dark:bg-zinc-950"
      role="dialog"
      aria-modal="true"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-100 px-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-zinc-100 p-2 text-zinc-500 active:scale-95 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 px-3 text-center">
          <h2 className="truncate text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <span className="text-[10px] font-bold text-zinc-400">Progression Logic</span>
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={disabled}
          className="text-sm font-black text-blue-600 active:opacity-70 disabled:opacity-50 dark:text-blue-400"
        >
          保存
        </button>
      </header>

      <main className="flex-1 overflow-y-auto bg-zinc-50 pb-28 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-[480px] space-y-4 px-4 py-4">
          <div className="sticky top-0 z-20 isolate py-1">
            <div className="rounded-2xl bg-zinc-900 p-3.5 text-white shadow-xl ring-1 ring-zinc-800 dark:bg-zinc-900">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
                逻辑路径预览
              </p>
              <p className="mt-2 text-lg font-black leading-tight">{generatePathPreview(draft)}</p>
            </div>
          </div>

          <section className="space-y-2">
            <p className="px-1 text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              第一步：选择进阶核心策略
            </p>
            <div className="space-y-2">
              {getClassicProgressionDefinitions().map((definition) => {
                const selected = draft.progressionPolicyType === definition.policyType;
                return (
                  <button
                    key={definition.policyType}
                    type="button"
                    onClick={() => switchPolicyType(definition.policyType)}
                    className={`w-full rounded-2xl border p-3.5 text-left transition-colors ${
                      selected
                        ? "border-blue-500 bg-blue-50/70 dark:border-blue-700 dark:bg-blue-950/30"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                          {definition.labelZh}
                        </p>
                        <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {definition.bestFor}
                        </p>
                      </div>
                      {selected ? (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
                          已选
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedDefinition ? (
            <>
              <AppCard emphasis="soft" className="space-y-3 p-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  第二步：配置核心参数
                </p>
                <div className="space-y-3">
                  {selectedDefinition.requiredFields.map((field) => {
                    const fieldValue =
                      field.source === "policy"
                        ? policyConfigRecord[field.key]
                        : successCriteriaRecord[field.key];
                    return renderStrategyField(field, fieldValue);
                  })}
                </div>
              </AppCard>

              {advancedEnabled && selectedDefinition.optionalFields.length > 0 ? (
                <AppCard emphasis="soft" className="space-y-3 p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    第三步：细化规则
                  </p>
                  <div className="space-y-3">
                    {selectedDefinition.optionalFields.map((field) => {
                      const fieldValue =
                        policyConfigRecord[field.key] ?? successCriteriaRecord[field.key];
                      return renderStrategyField(field, fieldValue);
                    })}
                  </div>
                </AppCard>
              ) : null}

              <AppCard emphasis="soft" className="space-y-3 p-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  总体调整模式
                </p>
                <ChoiceGroup
                  label="总体调整模式"
                  value={draft.adjustmentPolicyType || "always"}
                  options={ADJUSTMENT_POLICY_TYPE_VALUES.map((policyType: string) => ({
                    value: policyType,
                    labelZh: getAdjustmentPolicyTypeLabel(policyType),
                  }))}
                  onChange={(nextValue) =>
                    setDraft({
                      ...draft,
                      adjustmentPolicyType: nextValue as ProgressionConfigValue["adjustmentPolicyType"],
                    })
                  }
                />
              </AppCard>
            </>
          ) : null}

          {localError ? <InlineAlert tone="error">{localError}</InlineAlert> : null}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-100 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <button
          type="button"
          onClick={handleApply}
          disabled={disabled}
          className="w-full rounded-2xl bg-zinc-900 py-3.5 text-sm font-black text-white active:scale-[0.99] disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          确认并应用配置
        </button>
      </div>
    </div>
  );
}
