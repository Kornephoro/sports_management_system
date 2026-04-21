"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";

import { ExerciseLibraryItem } from "@/features/exercise-library/exercise-library-api";
import { getMovementPatternLabel } from "@/lib/exercise-library-standards";
import {
  ACTION_MOVEMENT_FILTER_OPTIONS,
  ACTION_MOVEMENT_FILTER_TO_PATTERNS,
  ACTION_PRIMARY_MUSCLE_FILTER_OPTIONS,
  ACTION_PRIMARY_MUSCLE_TO_REGIONS,
  ActionMovementFilterValue,
  ActionPrimaryMuscleFilterValue,
  toPrimaryMuscleLabels,
} from "@/lib/action-filter-standards";
import { AppCard, EmptyState } from "@/features/shared/components/ui-primitives";

type ActionArsenalDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  actions: ExerciseLibraryItem[];
  onSelect: (action: ExerciseLibraryItem) => void;
  onCreateSuperset?: (actions: ExerciseLibraryItem[]) => void;
  selectedActionIds?: string[];
};

function toggleMultiSelect<T extends string>(current: T[], value: T) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

export function ActionArsenalDrawer({
  isOpen,
  onClose,
  actions,
  onSelect,
  onCreateSuperset,
  selectedActionIds = [],
}: ActionArsenalDrawerProps) {
  const [mode, setMode] = useState<"single" | "superset">("single");
  const [keyword, setKeyword] = useState("");
  const [movementFilters, setMovementFilters] = useState<ActionMovementFilterValue[]>([]);
  const [muscleFilters, setMuscleFilters] = useState<ActionPrimaryMuscleFilterValue[]>([]);
  const [showMovementFilters, setShowMovementFilters] = useState(false);
  const [showMuscleFilters, setShowMuscleFilters] = useState(false);
  const [supersetDraftIds, setSupersetDraftIds] = useState<string[]>([]);

  const selectedSet = useMemo(() => new Set(selectedActionIds), [selectedActionIds]);
  const supersetDraftSet = useMemo(() => new Set(supersetDraftIds), [supersetDraftIds]);
  const activeFilterCount = movementFilters.length + muscleFilters.length;

  useEffect(() => {
    if (!isOpen) {
      setMode("single");
      setKeyword("");
      setMovementFilters([]);
      setMuscleFilters([]);
      setShowMovementFilters(false);
      setShowMuscleFilters(false);
      setSupersetDraftIds([]);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    return actions.filter((item) => {
      const keywordMatch =
        keyword.trim().length === 0 ||
        item.name.toLowerCase().includes(keyword.trim().toLowerCase()) ||
        item.aliases.some((alias) => alias.toLowerCase().includes(keyword.trim().toLowerCase()));
      if (!keywordMatch) {
        return false;
      }

      const movementMatch =
        movementFilters.length === 0 ||
        movementFilters.some((filter) =>
          ACTION_MOVEMENT_FILTER_TO_PATTERNS[filter].includes(item.movementPattern),
        );
      if (!movementMatch) {
        return false;
      }

      const muscleMatch =
        muscleFilters.length === 0 ||
        muscleFilters.some((filter) => {
          const regions = ACTION_PRIMARY_MUSCLE_TO_REGIONS[filter];
          return item.primaryRegions.some((region) => regions.includes(region));
        });
      return muscleMatch;
    });
  }, [actions, keyword, movementFilters, muscleFilters]);

  if (!isOpen) return null;

  const supersetDraftActions = supersetDraftIds
    .map((actionId) => actions.find((item) => item.id === actionId) ?? null)
    .filter((item): item is ExerciseLibraryItem => item !== null);

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <section className="relative flex h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-[2.2rem] border border-zinc-200 bg-white shadow-2xl animate-in slide-in-from-bottom-8 duration-300 dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <p className="text-base font-black tracking-tight text-zinc-900 dark:text-zinc-50">加入动作</p>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">从动作库中选择并加入模板</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`rounded-[1rem] px-3 py-2 text-xs font-black transition-colors ${
                  mode === "single"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                单动作
              </button>
              <button
                type="button"
                onClick={() => setMode("superset")}
                className={`rounded-[1rem] px-3 py-2 text-xs font-black transition-colors ${
                  mode === "superset"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                组建超级组
              </button>
            </div>
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

          {mode === "superset" ? (
            <AppCard className="space-y-2.5 p-3" emphasis="soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                    超级组草稿
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    选择 2-3 个动作，系统会按 A-B-(C)-回合休息 的结构创建一个特殊槽位
                  </p>
                </div>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {supersetDraftIds.length}/3
                </span>
              </div>

              {supersetDraftActions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {supersetDraftActions.map((item, index) => (
                    <span
                      key={`superset-draft:${item.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-1 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      {String.fromCharCode(65 + index)} · {item.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400">还未选择子动作</p>
              )}
            </AppCard>
          ) : null}

          <AppCard className="space-y-2.5 p-3" emphasis="soft">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">筛选</p>
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  已选 {activeFilterCount}
                </span>
              ) : null}
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

          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 min-[430px]:grid-cols-3">
              {filtered.map((item) => {
                const alreadySelected = selectedSet.has(item.id);
                const inSupersetDraft = supersetDraftSet.has(item.id);
                const supersetDisabled =
                  mode === "superset" &&
                  !inSupersetDraft &&
                  (supersetDraftIds.length >= 3 || alreadySelected);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={mode === "single" ? alreadySelected : supersetDisabled}
                    onClick={() => {
                      if (mode === "single") {
                        onSelect(item);
                        return;
                      }
                      setSupersetDraftIds((current) =>
                        current.includes(item.id)
                          ? current.filter((entry) => entry !== item.id)
                          : current.length >= 3
                            ? current
                            : [...current, item.id],
                      );
                    }}
                    className={`flex min-h-[112px] flex-col rounded-xl border px-2.5 py-2.5 text-left transition-colors ${
                      mode === "single" && alreadySelected
                        ? "border-zinc-200 bg-zinc-100/70 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/70"
                        : mode === "superset" && inSupersetDraft
                          ? "border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/25"
                        : "border-zinc-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-700 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <h3 className="line-clamp-2 text-sm font-black leading-tight text-zinc-900 dark:text-zinc-50">
                      {item.name}
                    </h3>
                    <div className="mt-auto flex flex-wrap gap-1 pt-2">
                      <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        {getMovementPatternLabel(item.movementPattern)}
                      </span>
                      {(toPrimaryMuscleLabels(item.primaryRegions, 2).length > 0
                        ? toPrimaryMuscleLabels(item.primaryRegions, 2)
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
                    <div className="mt-2 flex items-center justify-end">
                      {mode === "single" && alreadySelected ? (
                        <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">已添加</span>
                      ) : mode === "superset" && inSupersetDraft ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          已选入超级组
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <Plus className="h-3 w-3" />
                          {mode === "single" ? "加入" : "选择"}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState title="未找到符合条件的动作" hint="尝试放宽筛选条件或修改关键词" />
          )}
        </div>

        {mode === "superset" ? (
          <footer className="border-t border-zinc-100 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={() => setSupersetDraftIds([])}
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                清空
              </button>
              <button
                type="button"
                disabled={supersetDraftActions.length < 2 || !onCreateSuperset}
                onClick={() => {
                  if (!onCreateSuperset || supersetDraftActions.length < 2) {
                    return;
                  }
                  onCreateSuperset(supersetDraftActions);
                  setSupersetDraftIds([]);
                  onClose();
                }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                生成超级组
              </button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
