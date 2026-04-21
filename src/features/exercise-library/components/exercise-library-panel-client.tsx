"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";

import {
  ACTION_MOVEMENT_FILTER_OPTIONS,
  ACTION_PRIMARY_MUSCLE_FILTER_OPTIONS,
  ActionMovementFilterValue,
  ActionPrimaryMuscleFilterValue,
  toPrimaryMuscleLabels,
} from "@/lib/action-filter-standards";
import {
  MovementPatternV1,
  MuscleRegionV1,
  getMovementPatternLabel,
} from "@/lib/exercise-library-standards";
import {
  areRegionsOverlapping,
  canReachLogicalLimit,
  compressWithinGroup,
  expandForConflictAndHighlight,
  MERGE_GROUPS,
} from "@/lib/muscle-region-merge";
import {
  createExerciseLibraryItem,
  ExerciseLibraryItem,
  listExerciseLibraryItems,
} from "@/features/exercise-library/exercise-library-api";
import { ExerciseCreateBottomSheet } from "@/features/exercise-library/components/exercise-create-bottom-sheet";
import { MuscleEditorTab } from "@/features/exercise-library/components/muscle-editor-panel-content";
import { AppCard, EmptyState } from "@/features/shared/components/ui-primitives";

type ExerciseLibraryPanelClientProps = {
  userId: string;
};

function toggleMultiSelect<T extends string>(current: T[], value: T) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

export function ExerciseLibraryPanelClient({ userId }: ExerciseLibraryPanelClientProps) {
  const [items, setItems] = useState<ExerciseLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [movementFilters, setMovementFilters] = useState<ActionMovementFilterValue[]>([]);
  const [muscleFilters, setMuscleFilters] = useState<ActionPrimaryMuscleFilterValue[]>([]);
  const [showMovementFilters, setShowMovementFilters] = useState(false);
  const [showMuscleFilters, setShowMuscleFilters] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createMovementPattern, setCreateMovementPattern] = useState<MovementPatternV1>("horizontal_push");
  const [createCategory, setCreateCategory] = useState<"compound" | "isolation">("compound");
  const [createPrimaryRegions, setCreatePrimaryRegions] = useState<MuscleRegionV1[]>([]);
  const [createSecondaryRegions, setCreateSecondaryRegions] = useState<MuscleRegionV1[]>([]);

  const [createEditorTab, setCreateEditorTab] = useState<MuscleEditorTab>("primary");
  const [createMuscleSaveError, setCreateMuscleSaveError] = useState<string | null>(null);
  const [createMergeHint, setCreateMergeHint] = useState<string | null>(null);
  const createMergeHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (createMergeHintTimerRef.current) {
        clearTimeout(createMergeHintTimerRef.current);
      }
    };
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listExerciseLibraryItems(userId, {
        enabled: "true",
        keyword: keyword.trim() || undefined,
        movementPatterns: movementFilters,
        primaryMuscles: muscleFilters,
      });
      setItems(next);
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "加载动作库失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, movementFilters, muscleFilters, userId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const activeFilterCount = movementFilters.length + muscleFilters.length;

  const clearFilters = () => {
    setMovementFilters([]);
    setMuscleFilters([]);
    setKeyword("");
  };

  const cardMeta = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        name: item.name,
        movementPatternLabel: getMovementPatternLabel(item.movementPattern),
        primaryMuscleLabels: toPrimaryMuscleLabels(item.primaryRegions, 2),
      })),
    [items],
  );

  const resetCreateForm = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateMovementPattern("horizontal_push");
    setCreateCategory("compound");
    setCreatePrimaryRegions([]);
    setCreateSecondaryRegions([]);
    setCreateError(null);
    setCreateMuscleSaveError(null);
    setCreateMergeHint(null);
    setCreateEditorTab("primary");
  };

  const openCreateSheet = () => {
    resetCreateForm();
    setIsCreateOpen(true);
  };

  const closeCreateSheet = () => {
    if (isCreating) return;
    setCreateError(null);
    setIsCreateOpen(false);
  };

  const showCreateMergeHint = (message: string) => {
    if (createMergeHintTimerRef.current) {
      clearTimeout(createMergeHintTimerRef.current);
    }
    setCreateMergeHint(message);
    createMergeHintTimerRef.current = setTimeout(() => {
      setCreateMergeHint(null);
      createMergeHintTimerRef.current = null;
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
      return `${rule.children.length} 个子项已合并`;
    }
    return null;
  };

  const applyCreateToggleByGroup = (targetGroup: "primary" | "secondary", regions: MuscleRegionV1[]) => {
    setCreateMuscleSaveError(null);
    const previousPrimary = compressWithinGroup(createPrimaryRegions);
    const previousSecondary = compressWithinGroup(createSecondaryRegions);

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
      setCreateMuscleSaveError("主训练部位最多 3 个");
      return;
    }
    if (!canReachLogicalLimit([...secondaryExpanded], 4)) {
      setCreateMuscleSaveError("次训练部位最多 4 个");
      return;
    }
    if (areRegionsOverlapping(nextPrimary, nextSecondary)) {
      setCreateMuscleSaveError("同一部位不能同时作为主训练部位和次训练部位");
      return;
    }

    setCreatePrimaryRegions(nextPrimary);
    setCreateSecondaryRegions(nextSecondary);

    const mergeHintText =
      targetGroup === "primary"
        ? pickMergeHint(previousPrimary, expandedAfterTarget, nextPrimary)
        : pickMergeHint(previousSecondary, expandedAfterTarget, nextSecondary);
    if (mergeHintText) {
      showCreateMergeHint(mergeHintText);
    } else {
      setCreateMergeHint(null);
    }
  };

  const submitCreate = async () => {
    setCreateError(null);
    const trimmedName = createName.trim();
    if (!trimmedName) {
      setCreateError("请输入动作名称");
      return;
    }

    const normalizedPrimary = compressWithinGroup(createPrimaryRegions);
    const normalizedSecondary = compressWithinGroup(createSecondaryRegions);
    if (normalizedPrimary.length < 1) {
      setCreateError("至少需要设置 1 个主训练部位");
      return;
    }
    if (areRegionsOverlapping(normalizedPrimary, normalizedSecondary)) {
      setCreateError("主次训练部位存在冲突，请检查");
      return;
    }

    setIsCreating(true);
    try {
      await createExerciseLibraryItem({
        userId,
        name: trimmedName,
        aliases: [],
        category: createCategory,
        movementPattern: createMovementPattern,
        primaryRegions: normalizedPrimary,
        secondaryRegions: normalizedSecondary,
        tags: [],
        description: createDescription.trim(),
      });
      setIsCreateOpen(false);
      await loadItems();
    } catch (saveError) {
      setCreateError(saveError instanceof Error ? saveError.message : "新建动作失败，请稍后重试");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[480px] space-y-3 px-3 py-4 sm:px-4">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">动作库</h1>
          <button
            type="button"
            onClick={openCreateSheet}
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-black text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" />
            新建动作
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索动作名称"
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </header>

      <AppCard className="space-y-2.5 p-3" emphasis="soft">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">筛选</p>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                已选 {activeFilterCount}
              </span>
            ) : null}
            {(activeFilterCount > 0 || keyword.trim().length > 0) && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                清空
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/60">
            <button
              type="button"
              onClick={() => setShowMovementFilters((current) => !current)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">按动作模式筛选</span>
              <ChevronDown
                className={`h-4 w-4 text-zinc-500 transition-transform ${showMovementFilters ? "rotate-180" : ""}`}
              />
            </button>
            {showMovementFilters ? (
              <div className="flex flex-wrap gap-1.5 border-t border-zinc-200 px-2.5 py-2.5 dark:border-zinc-800">
                {ACTION_MOVEMENT_FILTER_OPTIONS.map((option) => {
                  const active = movementFilters.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setMovementFilters((current) => toggleMultiSelect(current, option.value))
                      }
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                        active
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/60">
            <button
              type="button"
              onClick={() => setShowMuscleFilters((current) => !current)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">按肌群筛选</span>
              <ChevronDown
                className={`h-4 w-4 text-zinc-500 transition-transform ${showMuscleFilters ? "rotate-180" : ""}`}
              />
            </button>
            {showMuscleFilters ? (
              <div className="flex flex-wrap gap-1.5 border-t border-zinc-200 px-2.5 py-2.5 dark:border-zinc-800">
                {ACTION_PRIMARY_MUSCLE_FILTER_OPTIONS.map((option) => {
                  const active = muscleFilters.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setMuscleFilters((current) => toggleMultiSelect(current, option.value))
                      }
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                        active
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </AppCard>

      {error ? (
        <AppCard emphasis="warn" className="p-3">
          <p className="text-xs font-medium text-orange-700 dark:text-orange-300">{error}</p>
        </AppCard>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-3">
          {Array.from({ length: 9 }, (_, index) => (
            <div
              key={`skeleton:${index}`}
              className="h-28 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/60"
            />
          ))}
        </div>
      ) : cardMeta.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-3">
          {cardMeta.map((item) => (
            <Link
              key={item.id}
              href={`/exercise-library/${item.id}`}
              className="flex min-h-[112px] flex-col rounded-xl border border-zinc-200 bg-white px-2.5 py-2.5 transition-colors hover:border-blue-400 hover:bg-blue-50/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-700 dark:hover:bg-zinc-900"
            >
              <h3 className="line-clamp-2 text-sm font-black leading-tight text-zinc-900 dark:text-zinc-50">
                {item.name}
              </h3>
              <div className="mt-auto flex flex-wrap gap-1 pt-2">
                <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {item.movementPatternLabel}
                </span>
                {(item.primaryMuscleLabels.length > 0
                  ? item.primaryMuscleLabels
                  : ["未配置肌群"]
                ).map((label) => (
                  <span
                    key={`${item.id}:${label}`}
                    className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="未找到符合条件的动作"
          hint="尝试放宽筛选条件或修改关键词"
          actions={
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <X className="h-3.5 w-3.5" />
              清空筛选
            </button>
          }
        />
      )}

      <ExerciseCreateBottomSheet
        open={isCreateOpen}
        name={createName}
        description={createDescription}
        movementPattern={createMovementPattern}
        category={createCategory}
        primaryRegions={createPrimaryRegions}
        secondaryRegions={createSecondaryRegions}
        editorTab={createEditorTab}
        muscleSaveError={createMuscleSaveError}
        mergeHint={createMergeHint}
        saving={isCreating}
        error={createError}
        onClose={closeCreateSheet}
        onSave={() => void submitCreate()}
        onNameChange={setCreateName}
        onDescriptionChange={setCreateDescription}
        onMovementPatternChange={setCreateMovementPattern}
        onCategoryChange={setCreateCategory}
        onEditorTabChange={setCreateEditorTab}
        onTogglePrimary={(regions) => applyCreateToggleByGroup("primary", regions)}
        onToggleSecondary={(regions) => applyCreateToggleByGroup("secondary", regions)}
      />
    </div>
  );
}
