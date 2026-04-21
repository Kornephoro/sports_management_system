"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createAndBindTemplateDay,
  createTemplatePackage,
  deleteTemplatePackage,
  getTemplatePackage,
  updateTemplatePackage,
  TemplatePackageDetail,
  TemplatePackageSplitType,
  TemplatePackageSlot,
  TemplatePackageUnitOverride,
} from "@/features/training/training-api";
import {
  createTemplateLibraryItem,
  getTemplateLibraryItem,
  listTemplateLibraryItems,
  TemplateLibraryItemDetail,
  TemplateLibraryUnit,
} from "@/features/template-library/template-library-api";
import {
  AppCard,
  EmptyState,
  InlineAlert,
  SkeletonRows,
} from "@/features/shared/components/ui-primitives";
import {
  SLOT_PRESETS,
  PackageDraft,
  PackageDraftDay,
  createEmptyPackageDraft,
  applySlotPreset,
  sanitizeSlots,
  computeSlotSummary,
} from "@/features/training/components/template-package-draft-core";
import { TEMPLATE_PACKAGE_SPLIT_TYPE_OPTIONS } from "@/lib/template-package-standards";
import { TemplateSplitType } from "@/lib/template-library-standards";
import { getClassicProgressionStrategyByPolicyType } from "@/features/progression/progression-strategy-catalog";
import { ProgressionPolicyConfigDrawer } from "@/features/progression/components/progression-policy-config-drawer";
import { normalizePolicyConfig } from "@/features/progression/progression-policy-normalizer";
import { summarizeProgressionPolicyConfig } from "@/features/progression/progression-policy-summary";
import { getUnitRoleLabel } from "@/features/shared/ui-zh";

type TemplatePackageEditorClientProps = {
  userId: string;
  packageId?: string; // If undefined, "create" mode
  onCompleted?: (result: { packageId: string; packageName: string }) => void;
};

type WizardStep = 1 | 2; // Step 1: Framework (Days & Slots), Step 2: Logic (Progression)

type CreateUnitDraft = {
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

type BindTemplateDialogState = {
  open: boolean;
  dayIndex: number | null;
  mode: "existing" | "create";
  existingTemplateId: string;
  templateName: string;
  description: string;
  notes: string;
};

type DrawerState = {
  open: boolean;
  key: string | null;
};

const QUICK_STRATEGY_OPTIONS = [
  { value: "double_progression", label: "双进阶" },
  { value: "linear_load_step", label: "线性加重" },
  { value: "total_reps_threshold", label: "阈值推进" },
  { value: "manual", label: "手动" },
] as const;

const UNIT_ROLE_OPTIONS = [
  "main", "secondary", "accessory", "skill", "conditioning", "warmup", "cooldown", "mobility", "prehab",
] as const;

function mapPackageSplitTypeToTemplateSplitType(splitType: TemplatePackageSplitType): TemplateSplitType {
  if (splitType === "single_day") return "full_body";
  if (splitType === "two_way") return "upper_lower";
  if (splitType === "three_way") return "push_pull_legs";
  return "custom";
}

function buildDraftFromTemplateUnit(dayCode: string, unit: TemplateLibraryUnit): CreateUnitDraft {
  return {
    dayCode,
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
  };
}

function getTemplateName(options: Array<{ id: string; name: string }>, id: string) {
  return options.find((item) => item.id === id)?.name ?? "未命名模板";
}

function toDraft(detail: TemplatePackageDetail): PackageDraft {
  const days = detail.days
    .map((day, index) => ({
      id: day.id,
      dayCode: day.dayCode,
      sequenceInMicrocycle: day.sequenceInMicrocycle ?? index + 1,
      templateLibraryItemId: day.templateLibraryItemId,
      label: day.label ?? "",
      notes: day.notes ?? "",
      progressionOverrides: day.progressionOverrides ?? [],
    }))
    .sort((a, b) => a.sequenceInMicrocycle - b.sequenceInMicrocycle);

  return {
    name: detail.name,
    splitType: detail.splitType,
    notes: detail.notes ?? "",
    enabled: detail.enabled,
    days,
    microcycleSlots: sanitizeSlots(detail.microcycleSlots, days),
  };
}

export function TemplatePackageEditorClient({
  userId,
  packageId,
  onCompleted,
}: TemplatePackageEditorClientProps) {
  const router = useRouter();
  // Ensure we strictly detect 'create' vs 'edit' mode from the packageId prop.
  // Note: packageId could be undefined, null, or the string 'new' for creation.
  const isCreate = !packageId || packageId === "new" || packageId === "undefined";

  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [draft, setDraft] = useState<PackageDraft>(() => createEmptyPackageDraft());
  const [templateOptions, setTemplateOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [templateDetails, setTemplateDetails] = useState<Map<string, TemplateLibraryItemDetail>>(new Map());
  const [progressionDraftMap, setProgressionDraftMap] = useState<Map<string, CreateUnitDraft>>(new Map());
  const [activeDayCode, setActiveDayCode] = useState<string | null>(null);
  
  const [drawerState, setDrawerState] = useState<DrawerState>({ open: false, key: null });
  const [bindDialog, setBindDialog] = useState<BindTemplateDialogState>({
    open: false,
    dayIndex: null,
    mode: "existing",
    existingTemplateId: "",
    templateName: "",
    description: "",
    notes: "",
  });

  // Load basic data (templates and package detail if editing)
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const templates = await listTemplateLibraryItems(userId, { enabled: "true" });
      const options = templates.map((t) => ({ id: t.id, name: t.name }));
      setTemplateOptions(options);

      if (!isCreate && packageId) {
        const detail = await getTemplatePackage(packageId, userId);
        const detailDraft = toDraft(detail);
        setDraft(detailDraft);

        // Initialize progression draft from existing overrides
        const nextProgression = new Map<string, CreateUnitDraft>();
        for (const day of detailDraft.days) {
          for (const override of day.progressionOverrides) {
            const key = `${day.dayCode}:${override.unitSequenceNo}`;
            // We need the exercise name which might not be in override but in template
            // We'll fill this in the useEffect that loads template details
            nextProgression.set(key, {
              dayCode: day.dayCode,
              unitSequenceNo: override.unitSequenceNo,
              exerciseName: "加载中...", // placeholder
              unitRole: override.unitRole ?? "",
              progressTrackKey: override.progressTrackKey ?? "",
              progressionFamily: override.progressionFamily ?? "",
              progressionPolicyType: override.progressionPolicyType ?? "",
              progressionPolicyConfig: override.progressionPolicyConfig ?? {},
              adjustmentPolicyType: override.adjustmentPolicyType ?? "always",
              adjustmentPolicyConfig: override.adjustmentPolicyConfig ?? {},
              successCriteria: override.successCriteria ?? {},
            });
          }
        }
        setProgressionDraftMap(nextProgression);
      } else {
        const defaultTemplateId = templates[0]?.id ?? "";
        setDraft((curr) => ({
          ...curr,
          days: curr.days.map(d => ({ ...d, templateLibraryItemId: d.templateLibraryItemId || defaultTemplateId }))
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [userId, packageId, isCreate]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Load template details when days or step changes
  useEffect(() => {
    if (loading) return; // Wait for initial package load

    const templateIds = Array.from(new Set(
      draft.days.map(d => d.templateLibraryItemId).filter(id => Boolean(id?.trim()))
    ));

    if (templateIds.length === 0) {
      setTemplateDetails(new Map());
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoadingUnits(true);
      try {
        const entries = await Promise.all(
          templateIds.map(async (tid) => {
            const detail = await getTemplateLibraryItem(tid, userId);
            return [tid, detail] as const;
          })
        );
        if (cancelled) return;

        const detailMap = new Map<string, TemplateLibraryItemDetail>(entries);
        setTemplateDetails(detailMap);

        // Merge template units into progression draft
        setProgressionDraftMap((current) => {
          const next = new Map(current);
          for (const day of draft.days) {
            const detail = detailMap.get(day.templateLibraryItemId);
            if (!detail) continue;
            for (const unit of detail.units) {
              const key = `${day.dayCode}:${unit.sequenceNo}`;
              const existing = next.get(key);
              if (!existing || existing.exerciseName === "加载中...") {
                next.set(key, buildDraftFromTemplateUnit(day.dayCode, unit));
              }
            }
          }
          return next;
        });

        if (!activeDayCode) {
          setActiveDayCode(draft.days[0]?.dayCode ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载动作为空或失败");
      } finally {
        if (!cancelled) setLoadingUnits(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [draft.days, userId, loading, isCreate]);

  const slotSummary = useMemo(() => computeSlotSummary(draft), [draft]);
  const activeDay = useMemo(() => draft.days.find(d => d.dayCode === activeDayCode) ?? draft.days[0] ?? null, [draft.days, activeDayCode]);
  const activeDayUnits = useMemo(() => {
    if (!activeDay) return [];
    const detail = templateDetails.get(activeDay.templateLibraryItemId);
    return detail?.units ?? [];
  }, [activeDay, templateDetails]);

  const selectedDrawerUnit = useMemo(() => {
    if (!drawerState.open || !drawerState.key) return null;
    return progressionDraftMap.get(drawerState.key) ?? null;
  }, [drawerState, progressionDraftMap]);

  // Handlers
  const handleOpenBindDialog = (index: number) => {
    const day = draft.days[index];
    if (!day) return;
    setBindDialog({
      open: true,
      dayIndex: index,
      mode: "existing",
      existingTemplateId: day.templateLibraryItemId || templateOptions[0]?.id || "",
      templateName: `${draft.name || "新计划包"} · ${day.dayCode}`,
      description: "",
      notes: "",
    });
  };

  const handleConfirmBind = async () => {
    if (bindDialog.dayIndex === null) return;
    const targetDay = draft.days[bindDialog.dayIndex];
    if (!targetDay) return;

    if (bindDialog.mode === "existing") {
      setDraft(curr => ({
        ...curr,
        days: curr.days.map((d, i) => i === bindDialog.dayIndex ? { ...d, templateLibraryItemId: bindDialog.existingTemplateId } : d)
      }));
      setDrawerState((next: DrawerState) => ({ ...next, open: false, key: null }));
      setBindDialog(prev => ({ ...prev, open: false }));
      return;
    }

    // Create new template path
    setSaving(true);
    try {
      const created = await createTemplateLibraryItem({
        userId,
        name: bindDialog.templateName,
        description: bindDialog.description || undefined,
        splitType: mapPackageSplitTypeToTemplateSplitType(draft.splitType),
        aliases: [],
        notes: bindDialog.notes || undefined,
        units: [],
      });
      setTemplateOptions(curr => [...curr, { id: created.id, name: created.name }]);
      setDraft(curr => ({
        ...curr,
        days: curr.days.map((d, i) => i === bindDialog.dayIndex ? { ...d, templateLibraryItemId: created.id } : d)
      }));
      setBindDialog(prev => ({ ...prev, open: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建模板失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (!draft.name.trim()) {
      setError("请输入计划包名称");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        userId,
        name: draft.name.trim(),
        splitType: draft.splitType,
        enabled: true,
        notes: draft.notes.trim() || undefined,
        days: draft.days.map((day, idx) => ({
          id: day.id,
          dayCode: day.dayCode,
          sequenceInMicrocycle: idx + 1,
          templateLibraryItemId: day.templateLibraryItemId,
          label: day.label || undefined,
          notes: day.notes || undefined,
          progressionOverrides: Array.from(progressionDraftMap.values())
            .filter(v => v.dayCode === day.dayCode)
            .map(v => ({
              unitSequenceNo: v.unitSequenceNo,
              unitRole: v.unitRole,
              progressionFamily: v.progressionFamily,
              progressionPolicyType: v.progressionPolicyType,
              progressionPolicyConfig: v.progressionPolicyConfig,
              adjustmentPolicyType: v.adjustmentPolicyType,
              adjustmentPolicyConfig: v.adjustmentPolicyConfig,
              successCriteria: v.successCriteria,
              progressTrackKey: v.progressTrackKey,
            }))
        })),
        microcycleSlots: draft.microcycleSlots.map((s, i) => ({ 
          type: s.type,
          dayCode: s.dayCode || undefined,
          label: s.label || undefined,
          slotIndex: i + 1 
        })),
      };

      let result;
      if (isCreate) {
        result = await createTemplatePackage(payload);
      } else {
        result = await updateTemplatePackage(packageId, payload);
      }

      setMessage(isCreate ? "计划包已成功创建" : "修改已保存");
      if (onCompleted) {
        onCompleted({ packageId: result.id, packageName: result.name });
      } else {
        router.push("/training?view=planning");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isCreate || !packageId) return;
    if (!window.confirm("确认要永久删除这个计划包吗？该操作不可撤销。")) return;
    
    setSaving(true);
    try {
      await deleteTemplatePackage(packageId, userId);
      router.replace("/training?view=planning");
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageContainer><SkeletonRows rows={10} /></PageContainer>;

  return (
    <div className="min-h-screen bg-zinc-50 pb-32 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-30 flex flex-col gap-4 bg-white/80 px-4 py-4 backdrop-blur-xl dark:bg-zinc-900/80 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
             ←
          </button>
          <div className="text-center">
            <h1 className="text-base font-black text-zinc-900 dark:text-zinc-50">{isCreate ? "新建计划包" : "编辑计划包项目"}</h1>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{isCreate ? "Create Plan Design" : `EDITING: ${draft.name || packageId.slice(-6)}`}</p>
          </div>
          <div className="w-10" /> {/* Spacer */}
        </div>

        {/* Step Indicator */}
        <div className="flex gap-2">
          <button 
            onClick={() => setStep(1)}
            className={`flex-1 h-1.5 rounded-full transition-all ${step === 1 ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-800"}`} 
          />
          <button 
            onClick={() => setStep(2)}
            className={`flex-1 h-1.5 rounded-full transition-all ${step === 2 ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-800"}`} 
          />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] space-y-6 p-4">
        {error && <InlineAlert tone="error">{error}</InlineAlert>}
        {message && <InlineAlert tone="success">{message}</InlineAlert>}

        {step === 1 ? (
          <div className="space-y-6">
            <SectionBlock title="基础信息">
               <AppCard className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">计划包名称</label>
                    <input 
                      value={draft.name}
                      onChange={e => setDraft(curr => ({ ...curr, name: e.target.value }))}
                      placeholder="例如：高级三分化-2026"
                      className="w-full rounded-2xl border-zinc-100 bg-zinc-50 px-4 py-3 text-sm font-bold focus:border-blue-500 focus:ring-0 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">分化类型</label>
                    <div className="grid grid-cols-2 gap-2">
                      {TEMPLATE_PACKAGE_SPLIT_TYPE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setDraft(curr => ({ ...curr, splitType: opt.value as TemplatePackageSplitType }))}
                          className={`rounded-2xl border-2 p-3 text-center transition-all ${draft.splitType === opt.value ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600" : "border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-500"}`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
               </AppCard>
            </SectionBlock>

            <SectionBlock title="训练日序列 (ABC)">
               <div className="space-y-3">
                  {draft.days.map((day, idx) => (
                    <AppCard key={idx} className="relative overflow-hidden">
                       <div className="flex items-center justify-between gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-lg font-black text-white dark:bg-zinc-100 dark:text-zinc-900">
                             {day.dayCode}
                          </div>
                          <div className="flex-1 space-y-1">
                             <input 
                               value={day.label}
                               onChange={e => setDraft(curr => ({
                                 ...curr,
                                 days: curr.days.map((d, i) => i === idx ? { ...d, label: e.target.value } : d)
                               }))}
                               placeholder="日名称"
                               className="w-full bg-transparent text-sm font-black text-zinc-900 dark:text-zinc-50 focus:outline-none"
                             />
                             <p className="text-[10px] font-bold text-zinc-400">
                                绑定模板：{getTemplateName(templateOptions, day.templateLibraryItemId)}
                             </p>
                          </div>
                          <button 
                            onClick={() => handleOpenBindDialog(idx)}
                            className="rounded-xl bg-zinc-100 px-3 py-2 text-[10px] font-black text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          >
                            更换
                          </button>
                       </div>
                       
                       <div className="mt-4 flex gap-2">
                          <ActionButton label="上移" disabled={idx === 0} onClick={() => setDraft(curr => {
                            const next = [...curr.days];
                            [next[idx-1], next[idx]] = [next[idx], next[idx-1]];
                            return { ...curr, days: next, microcycleSlots: sanitizeSlots(curr.microcycleSlots, next) };
                          })} />
                          <ActionButton label="下移" disabled={idx === draft.days.length - 1} onClick={() => setDraft(curr => {
                            const next = [...curr.days];
                            [next[idx], next[idx+1]] = [next[idx+1], next[idx]];
                            return { ...curr, days: next, microcycleSlots: sanitizeSlots(curr.microcycleSlots, next) };
                          })} />
                          <ActionButton label="删除" tone="danger" disabled={draft.days.length <= 1} onClick={() => setDraft(curr => {
                            const next = curr.days.filter((_, i) => i !== idx);
                            return { ...curr, days: next, microcycleSlots: sanitizeSlots(curr.microcycleSlots, next) };
                          })} />
                       </div>
                    </AppCard>
                  ))}
                  <button 
                    onClick={() => setDraft(curr => {
                      const nextCode = String.fromCharCode(65 + curr.days.length);
                      const nextDays = [...curr.days, { 
                        dayCode: nextCode, 
                        sequenceInMicrocycle: curr.days.length + 1, 
                        templateLibraryItemId: templateOptions[0]?.id ?? "",
                        label: `训练日 ${nextCode}`,
                        notes: "",
                        progressionOverrides: []
                      }];
                      return { ...curr, days: nextDays, microcycleSlots: sanitizeSlots(curr.microcycleSlots, nextDays) };
                    })}
                    className="w-full rounded-2xl border-2 border-dashed border-zinc-200 py-4 text-xs font-black text-zinc-400 hover:border-blue-300 hover:text-blue-500 dark:border-zinc-800"
                  >
                    + 新增训练阶段
                  </button>
               </div>
            </SectionBlock>

            <SectionBlock title="微周期槽位 (周间节奏)">
               <AppCard className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                     {SLOT_PRESETS.map(p => (
                       <button 
                         key={p.id}
                         onClick={() => setDraft(curr => ({ ...curr, microcycleSlots: applySlotPreset(p.id, curr.days) }))}
                         className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[10px] font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                       >
                         {p.label}
                       </button>
                     ))}
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950/40">
                     <p className="text-[11px] font-bold text-zinc-500">
                        当前节奏：<span className="text-zinc-900 dark:text-zinc-100 font-black">{slotSummary.slotLabel}</span>
                     </p>
                     <p className="mt-1 text-[10px] text-zinc-400">
                        训练 {slotSummary.trainCount} / 休息 {slotSummary.restCount} · 每周预计 {slotSummary.weeklyTrainFrequency} 次
                     </p>
                  </div>
                  
                  <div className="space-y-2">
                     {draft.microcycleSlots.map((slot, sIdx) => (
                       <div key={sIdx} className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                          <span className="w-6 text-[10px] font-black text-zinc-400">#{sIdx + 1}</span>
                          <div className={`flex-1 flex items-center justify-between rounded-xl px-3 py-2 ${slot.type === "train" ? "bg-blue-50 dark:bg-blue-900/20" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                             <span className="text-[11px] font-black text-zinc-700 dark:text-zinc-300">{slot.type === "train" ? "训练" : "休息"}</span>
                             {slot.type === "train" ? (
                               <select 
                                 value={slot.dayCode ?? "A"}
                                 onChange={e => setDraft(curr => ({
                                   ...curr,
                                   microcycleSlots: curr.microcycleSlots.map((s, i) => i === sIdx ? { ...s, dayCode: e.target.value } : s)
                                 }))}
                                 className="bg-transparent text-[11px] font-black text-blue-600 outline-none"
                               >
                                  {draft.days.map(d => <option key={d.dayCode} value={d.dayCode}>{d.dayCode}</option>)}
                               </select>
                             ) : null}
                          </div>
                          <button 
                            disabled={draft.microcycleSlots.length <= 1}
                            onClick={() => setDraft(curr => ({
                              ...curr,
                              microcycleSlots: curr.microcycleSlots.filter((_, i) => i !== sIdx)
                            }))}
                            className="text-red-500 opacity-50 hover:opacity-100 p-1"
                          >
                             ✕
                          </button>
                       </div>
                     ))}
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                     <button 
                        onClick={() => setDraft(curr => ({
                          ...curr,
                          microcycleSlots: [...curr.microcycleSlots, { slotIndex: curr.microcycleSlots.length + 1, type: "train", dayCode: curr.days[0].dayCode, label: null }]
                        }))}
                        className="flex-1 rounded-xl border border-blue-200 py-3 text-[10px] font-black text-blue-600"
                     >
                        + 训练槽位
                     </button>
                     <button 
                        onClick={() => setDraft(curr => ({
                          ...curr,
                          microcycleSlots: [...curr.microcycleSlots, { slotIndex: curr.microcycleSlots.length + 1, type: "rest", dayCode: null, label: "休息" }]
                        }))}
                        className="flex-1 rounded-xl border border-zinc-200 py-3 text-[10px] font-black text-zinc-600"
                     >
                        + 休息槽位
                     </button>
                  </div>
               </AppCard>
            </SectionBlock>
          </div>
        ) : (
          <div className="space-y-4">
            <AppCard className="space-y-5">
              <div className="flex flex-col gap-1 px-1 text-center">
                <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50">进步逻辑深度配置</h4>
                <p className="text-[11px] font-medium text-zinc-400">为每个训练日内的动作单独设定进化规则。</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2.5">
                {draft.days.map((day) => (
                  <button
                    key={day.dayCode}
                    type="button"
                    onClick={() => setActiveDayCode(day.dayCode)}
                    className={`rounded-2xl border-2 px-5 py-3 transition-all ${
                      activeDayCode === day.dayCode
                        ? "border-blue-500 bg-blue-50/50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400"
                        : "border-zinc-100 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400"
                    }`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{day.dayCode}</p>
                    <p className="mt-0.5 text-xs font-bold leading-tight truncate max-w-[100px]">{day.label || day.dayCode}</p>
                  </button>
                ))}
              </div>
            </AppCard>

            <div className="space-y-3">
              {loadingUnits ? (
                 <AppCard><SkeletonRows rows={6} /></AppCard>
              ) : activeDayUnits.length > 0 ? (
                activeDayUnits.map((unit) => {
                  const key = `${activeDayCode}:${unit.sequenceNo}`;
                  const pDraft = progressionDraftMap.get(key);
                  if (!pDraft) return null;
                  const summary = summarizeProgressionPolicyConfig(
                    normalizePolicyConfig({
                      progressionFamily: pDraft.progressionFamily,
                      progressionPolicyType: pDraft.progressionPolicyType,
                      progressionPolicyConfig: pDraft.progressionPolicyConfig,
                      adjustmentPolicyType: pDraft.adjustmentPolicyType as any,
                      adjustmentPolicyConfig: pDraft.adjustmentPolicyConfig,
                      successCriteria: pDraft.successCriteria,
                      progressTrackKey: pDraft.progressTrackKey,
                    }),
                  );
                  return (
                    <AppCard key={key} className="relative group">
                      <div className="flex items-start justify-between">
                         <div className="space-y-1">
                            <h5 className="text-sm font-black text-zinc-900 dark:text-zinc-50">{unit.exerciseNameSnapshot}</h5>
                            <p className="text-[11px] font-bold text-zinc-400 tracking-tight leading-relaxed">{summary}</p>
                         </div>
                         <button
                           onClick={() => setDrawerState({ open: true, key })}
                           className="rounded-xl bg-zinc-100 px-3 py-1.5 text-[10px] font-black text-blue-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-blue-400"
                         >
                           高级配置
                         </button>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">默认策略</span>
                          <select
                            value={pDraft.progressionPolicyType}
                            onChange={(e) => {
                              const strategy = getClassicProgressionStrategyByPolicyType(e.target.value);
                              if (strategy) {
                                setProgressionDraftMap(curr => new Map(curr).set(key, {
                                  ...pDraft,
                                  progressionFamily: strategy.progressionFamily,
                                  progressionPolicyType: strategy.policyType,
                                  progressionPolicyConfig: strategy.defaultPolicyConfig,
                                  successCriteria: strategy.defaultSuccessCriteria,
                                }));
                              }
                            }}
                            className="w-full rounded-xl border-zinc-100 bg-zinc-50 px-3 py-2.5 text-xs font-bold text-zinc-800 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                          >
                            {QUICK_STRATEGY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">动作角色</span>
                          <select
                            value={pDraft.unitRole}
                            onChange={(e) => setProgressionDraftMap(curr => new Map(curr).set(key, { ...pDraft, unitRole: e.target.value }))}
                            className="w-full rounded-xl border-zinc-100 bg-zinc-50 px-3 py-2.5 text-xs font-bold text-zinc-800 outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                          >
                            {UNIT_ROLE_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{getUnitRoleLabel(opt)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </AppCard>
                  );
                })
              ) : (
                <EmptyState title="暂无动作" hint="该训练层级似乎没有配置基础动作模板。" />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer Navigation */}
      <footer className="fixed inset-x-0 bottom-0 z-40 bg-white/90 p-4 border-t border-zinc-100 backdrop-blur-xl dark:bg-zinc-950/90 dark:border-zinc-800">
        <div className="mx-auto flex max-w-[480px] gap-3">
          <button
            disabled={saving}
            onClick={() => setStep(curr => (curr === 1 ? 1 : 1) as WizardStep)}
            className={`flex h-14 w-14 items-center justify-center rounded-[1.25rem] border-2 transition-all active:scale-95 ${step === 1 ? "border-zinc-100 bg-white text-zinc-300 dark:border-zinc-800 dark:bg-zinc-900" : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900"}`}
          >
             {step === 1 ? "🏠" : "←"}
          </button>
          
          <div className="flex-1 flex gap-2">
            {step === 1 ? (
               <button
                 disabled={saving || !draft.name.trim()}
                 onClick={() => setStep(2)}
                 className="flex h-14 w-full items-center justify-center rounded-[1.25rem] bg-blue-600 text-sm font-black text-white shadow-xl shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-50"
               >
                 下一步：配置进阶逻辑
               </button>
            ) : (
               <>
                 {!isCreate && (
                    <button
                      disabled={saving}
                      onClick={handleDelete}
                      className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-red-50 text-red-500 dark:bg-red-950/20"
                    >
                       🗑️
                    </button>
                 )}
                 <button
                   disabled={saving}
                   onClick={handleSave}
                   className="flex-1 flex h-14 items-center justify-center rounded-[1.25rem] bg-zinc-900 text-sm font-black text-white shadow-xl transition-all active:scale-95 disabled:opacity-50 dark:bg-blue-600"
                 >
                   {saving ? "正在同步..." : isCreate ? "保存计划包设计" : "应用更新并保存"}
                 </button>
               </>
            )}
          </div>
        </div>
      </footer>

      {/* Expansion Drawer */}
      {selectedDrawerUnit && (
        <ProgressionPolicyConfigDrawer
          open={drawerState.open}
          title={`${selectedDrawerUnit.dayCode} · ${selectedDrawerUnit.exerciseName} 配置`}
          value={normalizePolicyConfig({
            progressionFamily: selectedDrawerUnit.progressionFamily,
            progressionPolicyType: selectedDrawerUnit.progressionPolicyType,
            progressionPolicyConfig: selectedDrawerUnit.progressionPolicyConfig,
            adjustmentPolicyType: selectedDrawerUnit.adjustmentPolicyType as any,
            adjustmentPolicyConfig: selectedDrawerUnit.adjustmentPolicyConfig,
            successCriteria: selectedDrawerUnit.successCriteria,
            progressTrackKey: selectedDrawerUnit.progressTrackKey,
          })}
          onApply={(next) => {
            if (!drawerState.key) return;
            setProgressionDraftMap(curr => new Map(curr).set(drawerState.key!, {
              ...selectedDrawerUnit,
              progressionFamily: next.progressionFamily,
              progressionPolicyType: next.progressionPolicyType,
              progressionPolicyConfig: next.progressionPolicyConfig,
              adjustmentPolicyType: next.adjustmentPolicyType ?? selectedDrawerUnit.adjustmentPolicyType,
              adjustmentPolicyConfig: next.adjustmentPolicyConfig ?? {},
              successCriteria: next.successCriteria ?? {},
              progressTrackKey: next.progressTrackKey ?? selectedDrawerUnit.progressTrackKey,
            }));
          }}
          onClose={() => setDrawerState({ open: false, key: null })}
          advancedEnabled
        />
      )}

      {/* Template Selection Drawer (Upgraded from simple dialog) */}
      {bindDialog.open && (
         <div className="fixed inset-0 z-[60] flex flex-col bg-white pt-[env(safe-area-inset-top)] dark:bg-zinc-950 animate-in slide-in-from-bottom duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
               <button 
                 onClick={() => setBindDialog(p => ({ ...p, open: false }))}
                 className="flex h-10 items-center justify-center rounded-xl bg-zinc-50 px-3 text-[10px] font-black text-zinc-400 dark:bg-zinc-900"
               >
                  取消
               </button>
               <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50">绑定计划模板</h3>
               <div className="w-10" />
            </div>

            {/* Mode Switcher */}
            <div className="p-3">
               <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
                  <button 
                    onClick={() => setBindDialog(p => ({ ...p, mode: "existing" }))}
                    className={`flex-1 rounded-lg py-2 text-[10px] font-black transition-all ${bindDialog.mode === "existing" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-400"}`}
                  >
                    从库中选择计划
                  </button>
                  <button 
                    onClick={() => setBindDialog(p => ({ ...p, mode: "create" }))}
                    className={`flex-1 rounded-lg py-2 text-[10px] font-black transition-all ${bindDialog.mode === "create" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-400"}`}
                  >
                    现场新建计划
                  </button>
               </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-4 pb-10">
               {bindDialog.mode === "existing" ? (
                  <TemplateLibrarySearchList 
                    options={templateOptions} 
                    selectedId={bindDialog.existingTemplateId}
                    onSelect={(id) => {
                       setBindDialog(p => ({ ...p, existingTemplateId: id }));
                    }}
                  />
               ) : (
                  <div className="space-y-6 pt-2">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">模板名称</label>
                        <input 
                          value={bindDialog.templateName}
                          onChange={e => setBindDialog(p => ({ ...p, templateName: e.target.value }))}
                          placeholder="例如：推力日 A-1"
                          className="w-full rounded-2xl border-zinc-100 bg-zinc-50 px-4 py-3 text-sm font-bold dark:border-zinc-800 dark:bg-zinc-900"
                        />
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">功能描述</label>
                        <textarea 
                          value={bindDialog.description}
                          onChange={e => setBindDialog(p => ({ ...p, description: e.target.value }))}
                          rows={3}
                          placeholder="简述该模板的侧重点..."
                          className="w-full rounded-2xl border-zinc-100 bg-zinc-50 px-4 py-3 text-sm font-bold dark:border-zinc-800 dark:bg-zinc-900"
                        />
                     </div>
                  </div>
               )}
            </div>

            {/* Sticky Action Footer */}
            <div className="border-t border-zinc-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-950">
               <button 
                 disabled={saving || (bindDialog.mode === "existing" && !bindDialog.existingTemplateId)}
                 onClick={handleConfirmBind}
                 className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50"
               >
                 {saving ? "正在创建并绑定..." : "确认绑定并关闭"}
               </button>
            </div>
         </div>
      )}
    </div>
  );
}

// Inner Component for Searchable Template List
function TemplateLibrarySearchList({ 
  options, 
  selectedId, 
  onSelect 
}: { 
  options: Array<{ id: string; name: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()));
  }, [options, query]);

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-white pt-2 pb-3 dark:bg-zinc-950">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs">🔍</span>
          <input 
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索已有计划模板..."
            className="w-full rounded-xl border-zinc-100 bg-zinc-50 py-2.5 pl-10 pr-4 text-[11px] font-bold focus:border-blue-500 focus:ring-0 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          />
        </div>
      </div>

      {/* Results List */}
      <div className="grid gap-2">
        {filtered.length === 0 ? (
           <div className="py-10 text-center text-xs font-bold text-zinc-400 uppercase tracking-widest">
              未搜索到相关模板
           </div>
        ) : (
          filtered.map(opt => (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 transition-all ${selectedId === opt.id ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20" : "border-zinc-50 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40"}`}
            >
              <div className="text-left">
                <p className={`text-[11px] font-black ${selectedId === opt.id ? "text-blue-700 dark:text-blue-400" : "text-zinc-900 dark:text-zinc-100"}`}>
                  {opt.name}
                </p>
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Plan Template Item</p>
              </div>
              {selectedId === opt.id && <span className="text-[10px] text-blue-500">✓</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">{title}</h3>
      {children}
    </div>
  );
}

function ActionButton({ label, onClick, disabled, tone = "neutral" }: { label: string; onClick: () => void; disabled?: boolean; tone?: "neutral" | "danger" }) {
  const base = "flex-1 rounded-xl py-2.5 text-[10px] font-black transition-all active:scale-95 disabled:opacity-30";
  const styles = tone === "danger" 
    ? "bg-red-50 text-red-600 dark:bg-red-950/20" 
    : "bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  
  return (
    <button disabled={disabled} onClick={onClick} className={`${base} ${styles}`}>
      {label}
    </button>
  );
}

function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[480px] p-4">{children}</div>;
}
