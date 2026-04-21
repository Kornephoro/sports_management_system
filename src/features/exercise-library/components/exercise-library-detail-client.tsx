"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Save } from "lucide-react";

import {
  EXERCISE_CATEGORY_OPTIONS,
  getMuscleRegionLabel,
  MuscleRegionV1,
  MovementPatternV1,
  MOVEMENT_PATTERN_OPTIONS,
} from "@/lib/exercise-library-standards";
import {
  areRegionsOverlapping,
  canReachLogicalLimit,
  compressWithinGroup,
  expandForConflictAndHighlight,
  MERGE_GROUPS,
} from "@/lib/muscle-region-merge";
import {
  ExerciseLibraryItemDetail,
  getExerciseLibraryItem,
  updateExerciseLibraryItem,
} from "@/features/exercise-library/exercise-library-api";
import { AppCard } from "@/features/shared/components/ui-primitives";
import { ExerciseDetailAnatomyCard } from "@/features/exercise-library/components/exercise-detail-anatomy-card";
import { ExerciseMetaEditorBottomSheet } from "@/features/exercise-library/components/exercise-meta-editor-bottom-sheet";
import { MuscleEditorTab } from "@/features/exercise-library/components/muscle-editor-panel-content";

type ExerciseLibraryDetailClientProps = {
  userId: string;
  itemId: string;
};

export function ExerciseLibraryDetailClient({ userId, itemId }: ExerciseLibraryDetailClientProps) {
  const [item, setItem] = useState<ExerciseLibraryItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMetaEditorOpen, setIsMetaEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<MuscleEditorTab>("primary");
  const [draftPrimaryRegions, setDraftPrimaryRegions] = useState<MuscleRegionV1[]>([]);
  const [draftSecondaryRegions, setDraftSecondaryRegions] = useState<MuscleRegionV1[]>([]);
  const [draftMovementPattern, setDraftMovementPattern] = useState<MovementPatternV1>("horizontal_push");
  const [draftCategory, setDraftCategory] = useState<"compound" | "isolation">("compound");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mergeHint, setMergeHint] = useState<string | null>(null);
  const mergeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [curveWindow, setCurveWindow] = useState(12);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const detail = await getExerciseLibraryItem(itemId, userId);
      setItem(detail);
      setDescriptionDraft(detail.description ?? "");
      setDescriptionError(null);
    } catch (error) {
      setItem(null);
      setLoadError(error instanceof Error ? error.message : "无法获取动作详情");
    } finally {
      setLoading(false);
    }
  }, [itemId, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return () => {
      if (mergeHintTimerRef.current) {
        clearTimeout(mergeHintTimerRef.current);
      }
    };
  }, []);

  const showMergeHint = (message: string) => {
    if (mergeHintTimerRef.current) {
      clearTimeout(mergeHintTimerRef.current);
    }
    setMergeHint(message);
    mergeHintTimerRef.current = setTimeout(() => {
      setMergeHint(null);
      mergeHintTimerRef.current = null;
    }, 1450);
  };

  const pickMergeHint = (
    previousCanonical: MuscleRegionV1[],
    expandedAfterToggle: Set<MuscleRegionV1>,
    nextCanonical: MuscleRegionV1[],
  ) => {
    const previousSet = new Set(previousCanonical);
    const nextSet = new Set(nextCanonical);

    for (const rule of MERGE_GROUPS) {
      if (previousSet.has(rule.parent) || !nextSet.has(rule.parent)) continue;
      if (!rule.children.every((child) => expandedAfterToggle.has(child))) continue;
      const childNames = rule.children.map((child) => getMuscleRegionLabel(child)).join(" + ");
      return `${childNames} 合并为 ${getMuscleRegionLabel(rule.parent)}`;
    }
    return null;
  };

  const openMetaEditor = () => {
    if (!item) return;
    setDraftMovementPattern(item.movementPattern);
    setDraftCategory(item.category);
    setDraftPrimaryRegions(compressWithinGroup(item.primaryRegions));
    setDraftSecondaryRegions(compressWithinGroup(item.secondaryRegions));
    setEditorTab("primary");
    setSaveError(null);
    setMergeHint(null);
    setIsMetaEditorOpen(true);
  };

  const closeMetaEditor = () => {
    if (isSaving) return;
    setSaveError(null);
    setIsMetaEditorOpen(false);
  };

  const applyToggleByGroup = (targetGroup: "primary" | "secondary", regions: MuscleRegionV1[]) => {
    setSaveError(null);
    const previousPrimary = compressWithinGroup(draftPrimaryRegions);
    const previousSecondary = compressWithinGroup(draftSecondaryRegions);

    const primaryExpanded = new Set(expandForConflictAndHighlight(previousPrimary));
    const secondaryExpanded = new Set(expandForConflictAndHighlight(previousSecondary));

    const targetExpanded = targetGroup === "primary" ? primaryExpanded : secondaryExpanded;
    const oppositeExpanded = targetGroup === "primary" ? secondaryExpanded : primaryExpanded;

    const allActive = regions.every((region) => targetExpanded.has(region));
    for (const region of regions) {
      if (allActive) {
        targetExpanded.delete(region);
      } else {
        targetExpanded.add(region);
      }
      oppositeExpanded.delete(region);
    }

    const expandedAfterTarget = new Set(targetExpanded);
    const nextPrimary = compressWithinGroup([...primaryExpanded]);
    const nextSecondary = compressWithinGroup([...secondaryExpanded]);

    if (!canReachLogicalLimit([...primaryExpanded], 3)) {
      setSaveError("主训练部位最多 3 个");
      return;
    }
    if (!canReachLogicalLimit([...secondaryExpanded], 4)) {
      setSaveError("次训练部位最多 4 个");
      return;
    }
    if (areRegionsOverlapping(nextPrimary, nextSecondary)) {
      setSaveError("同一部位不能同时作为主训练部位和次训练部位");
      return;
    }

    setDraftPrimaryRegions(nextPrimary);
    setDraftSecondaryRegions(nextSecondary);

    const mergeHintText =
      targetGroup === "primary"
        ? pickMergeHint(previousPrimary, expandedAfterTarget, nextPrimary)
        : pickMergeHint(previousSecondary, expandedAfterTarget, nextSecondary);

    if (mergeHintText) {
      showMergeHint(mergeHintText);
    } else {
      setMergeHint(null);
    }
  };

  const togglePrimaryRegions = (regions: MuscleRegionV1[]) => {
    applyToggleByGroup("primary", regions);
  };

  const toggleSecondaryRegions = (regions: MuscleRegionV1[]) => {
    applyToggleByGroup("secondary", regions);
  };

  const saveMetaInfo = async () => {
    if (!item) return;
    const normalizedPrimary = compressWithinGroup(draftPrimaryRegions);
    const normalizedSecondary = compressWithinGroup(draftSecondaryRegions);
    if (normalizedPrimary.length < 1) {
      setSaveError("至少选择 1 个主训练部位");
      return;
    }
    if (normalizedPrimary.length > 3) {
      setSaveError("主训练部位最多 3 个");
      return;
    }
    if (normalizedSecondary.length > 4) {
      setSaveError("次训练部位最多 4 个");
      return;
    }
    if (areRegionsOverlapping(normalizedPrimary, normalizedSecondary)) {
      setSaveError("同一部位不能同时作为主训练部位和次训练部位");
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateExerciseLibraryItem(item.id, {
        userId,
        movementPattern: draftMovementPattern,
        category: draftCategory,
        primaryRegions: normalizedPrimary,
        secondaryRegions: normalizedSecondary,
      });
      const refreshed = await getExerciseLibraryItem(item.id, userId);
      setItem(refreshed);
      setIsMetaEditorOpen(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
    }
  };

  const saveDescription = async () => {
    if (!item) return;
    setIsSavingDescription(true);
    setDescriptionError(null);
    try {
      await updateExerciseLibraryItem(item.id, {
        userId,
        description: descriptionDraft,
      });
      const refreshed = await getExerciseLibraryItem(item.id, userId);
      setItem(refreshed);
      setDescriptionDraft(refreshed.description ?? "");
    } catch (error) {
      setDescriptionError(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setIsSavingDescription(false);
    }
  };

  const visibleWeightPoints = useMemo(() => {
    if (!item) return [];
    const sorted = [...item.weightTrendPoints].sort((a, b) =>
      a.performedAt.localeCompare(b.performedAt),
    );
    const safeWindow = Math.min(20, Math.max(1, curveWindow));
    return sorted.slice(-safeWindow);
  }, [item, curveWindow]);

  const trendPath = useMemo(() => {
    if (visibleWeightPoints.length < 2) return "";
    const width = 320;
    const height = 120;
    const pad = 10;
    const values = visibleWeightPoints.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);

    const coords = visibleWeightPoints.map((point, index) => {
      const x = pad + (index / (visibleWeightPoints.length - 1)) * (width - pad * 2);
      const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
      return `${x},${y}`;
    });
    return `M ${coords.join(" L ")}`;
  }, [visibleWeightPoints]);

  if (loading) {
    return (
      <div className="p-8 text-center text-zinc-500 animate-pulse uppercase tracking-[0.2em] font-black italic">
        数据同步中 / Syncing Data...
      </div>
    );
  }

  if (loadError) {
    return (
      <AppCard emphasis="warn" className="mx-auto w-full max-w-[480px] space-y-3 p-4">
        <p className="text-sm font-black text-orange-700 dark:text-orange-300">动作详情加载失败</p>
        <p className="text-xs text-orange-700/90 dark:text-orange-300/90">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-orange-300 bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-800 hover:bg-orange-200 dark:border-orange-700 dark:bg-orange-900/40 dark:text-orange-200 dark:hover:bg-orange-900/60"
        >
          重新加载
        </button>
      </AppCard>
    );
  }

  if (!item) {
    return (
      <AppCard emphasis="warn" className="mx-auto w-full max-w-[480px] p-4">
        <p className="text-xs font-medium text-orange-700 dark:text-orange-300">当前动作不存在或已被删除。</p>
      </AppCard>
    );
  }

  const hasPrimaryRegions = item.primaryRegions.length > 0;

  return (
    <div className="mx-auto w-full max-w-[480px] space-y-4 px-3 py-4 sm:px-4">
      <header className="px-1">
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">{item.name}</h1>
      </header>

      {!hasPrimaryRegions ? (
        <AppCard emphasis="warn" className="space-y-2 p-3">
          <p className="text-xs font-black text-orange-700 dark:text-orange-300">
            当前动作尚未配置主训练部位
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-orange-700/90 dark:text-orange-300/90">
              先补齐主训练部位后，动作推荐和筛选会更准确。
            </p>
            <button
              type="button"
              onClick={openMetaEditor}
              className="shrink-0 rounded-lg border border-orange-300 bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-800 hover:bg-orange-200 dark:border-orange-700 dark:bg-orange-900/40 dark:text-orange-200 dark:hover:bg-orange-900/60"
            >
              立即配置
            </button>
          </div>
        </AppCard>
      ) : null}

      <AppCard className="space-y-2.5 p-3" emphasis="soft">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">动作属性</h3>
          <button
            type="button"
            onClick={openMetaEditor}
            className="rounded-lg border border-blue-600 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/45"
          >
            修改动作信息
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-zinc-200 bg-white/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-[10px] font-bold text-zinc-500">动作模式</p>
            <p className="mt-1 text-sm font-black text-zinc-900 dark:text-zinc-100">
              {MOVEMENT_PATTERN_OPTIONS.find((option) => option.value === item.movementPattern)?.label}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-[10px] font-bold text-zinc-500">技术分类</p>
            <p className="mt-1 text-sm font-black text-zinc-900 dark:text-zinc-100">
              {EXERCISE_CATEGORY_OPTIONS.find((option) => option.value === item.category)?.label}
            </p>
          </div>
        </div>
      </AppCard>

      <ExerciseDetailAnatomyCard
        primary={item.primaryRegions}
        secondary={item.secondaryRegions}
      />

      <AppCard className="space-y-2.5 p-3" emphasis="soft">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">动作做法</h3>
          <button
            type="button"
            onClick={() => void saveDescription()}
            disabled={isSavingDescription}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {isSavingDescription ? "保存中" : "保存"}
          </button>
        </div>
        <textarea
          value={descriptionDraft}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          placeholder="输入动作做法与注意事项"
        />
        {descriptionError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {descriptionError}
          </p>
        ) : null}
      </AppCard>

      <AppCard className="space-y-3 p-3" emphasis="soft">
        <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">统计与引用</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white/80 px-2 py-2 text-center dark:bg-zinc-900/60">
            <p className="text-[10px] font-bold text-zinc-500">执行次数</p>
            <p className="mt-1 text-base font-black text-zinc-900 dark:text-zinc-100">{item.summary.totalExecutions}</p>
          </div>
          <div className="rounded-xl bg-white/80 px-2 py-2 text-center dark:bg-zinc-900/60">
            <p className="text-[10px] font-bold text-zinc-500">最佳重量</p>
            <p className="mt-1 text-base font-black text-zinc-900 dark:text-zinc-100">{item.summary.bestLoadValue ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-white/80 px-2 py-2 text-center dark:bg-zinc-900/60">
            <p className="text-[10px] font-bold text-zinc-500">趋势</p>
            <p className="mt-1 text-base font-black text-zinc-900 dark:text-zinc-100">{item.summary.trend}</p>
          </div>
        </div>
        <details className="rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60" open>
          <summary className="cursor-pointer text-xs font-black text-zinc-900 dark:text-zinc-100">
            模板引用（{item.references.template.length}）
          </summary>
          <div className="mt-2 space-y-1">
            {item.references.template.length > 0 ? (
              item.references.template.slice(0, 6).map((reference) => (
                <p key={reference.unitTemplateId} className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  {reference.programName} / {reference.sessionTemplateName} / {reference.unitName}
                </p>
              ))
            ) : (
              <p className="text-[11px] text-zinc-400">暂无</p>
            )}
          </div>
        </details>
        <details className="rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <summary className="cursor-pointer text-xs font-black text-zinc-900 dark:text-zinc-100">
            计划引用（{item.references.planned.length}）
          </summary>
          <div className="mt-2 space-y-1">
            {item.references.planned.length > 0 ? (
              item.references.planned.slice(0, 6).map((reference) => (
                <p key={reference.plannedUnitId} className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  {reference.programName} / 第{reference.sequenceIndex}次 / {reference.status}
                </p>
              ))
            ) : (
              <p className="text-[11px] text-zinc-400">暂无</p>
            )}
          </div>
        </details>
        <details className="rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60">
          <summary className="cursor-pointer text-xs font-black text-zinc-900 dark:text-zinc-100">
            最近执行（{item.references.recentUsage.length}）
          </summary>
          <div className="mt-2 space-y-1">
            {item.references.recentUsage.length > 0 ? (
              item.references.recentUsage.slice(0, 6).map((reference) => (
                <p key={reference.unitExecutionId} className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  {new Date(reference.performedAt).toLocaleDateString()} / {reference.completionStatus}
                </p>
              ))
            ) : (
              <p className="text-[11px] text-zinc-400">暂无</p>
            )}
          </div>
        </details>
      </AppCard>

      <AppCard className="space-y-3 p-3" emphasis="soft">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">重量进步曲线</h3>
          </div>
          <select
            value={curveWindow}
            onChange={(event) => setCurveWindow(Number(event.target.value))}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {Array.from({ length: 20 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                最近{value}次
              </option>
            ))}
          </select>
        </div>
        {visibleWeightPoints.length >= 2 ? (
          <div className="rounded-xl border border-zinc-200 bg-white/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/60">
            <svg viewBox="0 0 320 120" className="h-28 w-full" preserveAspectRatio="none">
              <path d={trendPath} fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-600" strokeLinecap="round" />
            </svg>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white/80 px-3 py-6 text-center text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
            数据不足，至少需要 2 条重量记录
          </div>
        )}
      </AppCard>

      <ExerciseMetaEditorBottomSheet
        open={isMetaEditorOpen}
        movementPattern={draftMovementPattern}
        category={draftCategory}
        editorTab={editorTab}
        primaryRegions={draftPrimaryRegions}
        secondaryRegions={draftSecondaryRegions}
        saving={isSaving}
        saveError={saveError}
        muscleSaveError={saveError}
        mergeHint={mergeHint}
        onClose={closeMetaEditor}
        onSave={() => void saveMetaInfo()}
        onMovementPatternChange={setDraftMovementPattern}
        onCategoryChange={setDraftCategory}
        onEditorTabChange={setEditorTab}
        onTogglePrimary={togglePrimaryRegions}
        onToggleSecondary={toggleSecondaryRegions}
      />
    </div>
  );
}
