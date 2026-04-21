"use client";

import { AppCard } from "@/features/shared/components/ui-primitives";
import { getMuscleRegionLabel, MuscleRegionV1 } from "@/lib/exercise-library-standards";
import { expandForConflictAndHighlight } from "@/lib/muscle-region-merge";
import { MUSCLE_EDITOR_BUTTON_OPTIONS } from "@/features/exercise-library/components/exercise-muscle-map-config";
import { MuscleEditorAnatomyPreview } from "@/features/exercise-library/components/muscle-editor-anatomy-preview";

export type MuscleEditorTab = "primary" | "secondary";

type MuscleEditorPanelContentProps = {
  editorTab: MuscleEditorTab;
  primaryRegions: MuscleRegionV1[];
  secondaryRegions: MuscleRegionV1[];
  saveError: string | null;
  mergeHint: string | null;
  onEditorTabChange: (next: MuscleEditorTab) => void;
  onTogglePrimary: (regions: MuscleRegionV1[]) => void;
  onToggleSecondary: (regions: MuscleRegionV1[]) => void;
  className?: string;
};

function isOptionActive(optionRegions: MuscleRegionV1[], selectedRegions: MuscleRegionV1[]) {
  const expandedSelected = new Set(expandForConflictAndHighlight(selectedRegions));
  return optionRegions.every((region) => expandedSelected.has(region));
}

export function MuscleEditorPanelContent({
  editorTab,
  primaryRegions,
  secondaryRegions,
  saveError,
  mergeHint,
  onEditorTabChange,
  onTogglePrimary,
  onToggleSecondary,
  className,
}: MuscleEditorPanelContentProps) {
  const currentRegions = editorTab === "primary" ? primaryRegions : secondaryRegions;
  const currentLimit = editorTab === "primary" ? 3 : 4;
  const sectionTitle = editorTab === "primary" ? "主要训练部位" : "次要训练部位";
  const sectionHint =
    editorTab === "primary" ? "请选择 1-3 个主要训练部位" : "请选择 0-4 个次要训练部位";
  const toggleHandler = editorTab === "primary" ? onTogglePrimary : onToggleSecondary;

  return (
    <div className={className}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">编辑分组</p>
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          {currentRegions.length} / {currentLimit}
        </p>
      </div>

      <div className="mt-2 flex items-center gap-1 rounded-[1.2rem] bg-zinc-100/90 p-1.5 shadow-inner dark:bg-zinc-900/70">
        <button
          type="button"
          onClick={() => onEditorTabChange("primary")}
          className={`flex-1 rounded-[1rem] px-3 py-1.5 text-xs font-black transition-all ${
            editorTab === "primary"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          主要训练部位
        </button>
        <button
          type="button"
          onClick={() => onEditorTabChange("secondary")}
          className={`flex-1 rounded-[1rem] px-3 py-1.5 text-xs font-black transition-all ${
            editorTab === "secondary"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          次要训练部位
        </button>
      </div>

      <div className="mt-3">
        <AppCard className="space-y-2.5" emphasis="soft">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">{sectionTitle}</h3>
            <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{sectionHint}</p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">已选结果</p>
            <div className="flex min-h-8 flex-wrap items-center gap-1.5">
              {currentRegions.length > 0 ? (
                currentRegions.map((region) => (
                  <span
                    key={`${editorTab}:selected:${region}`}
                    className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
                  >
                    {getMuscleRegionLabel(region)}
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-medium text-zinc-400">尚未选择</span>
              )}
            </div>
            <div className="h-5">
              <div
                className={`inline-flex max-w-full rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 transition-all duration-280 dark:border-blue-900/70 dark:bg-blue-950/35 dark:text-blue-300 ${
                  mergeHint ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
                }`}
              >
                {mergeHint ?? " "}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {MUSCLE_EDITOR_BUTTON_OPTIONS.map((option) => {
              const active = isOptionActive(option.regions, currentRegions);
              return (
                <button
                  key={`${editorTab}:${option.id}`}
                  type="button"
                  onClick={() => toggleHandler(option.regions)}
                  className={`min-h-9 rounded-md px-1 py-1 text-[10px] font-bold leading-tight transition-all ${
                    active
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </AppCard>
      </div>

      {saveError ? (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {saveError}
        </p>
      ) : null}

      <div className="mt-3 h-[min(42dvh,380px)] min-h-[300px]">
        <MuscleEditorAnatomyPreview
          primaryRegions={primaryRegions}
          secondaryRegions={secondaryRegions}
        />
      </div>
    </div>
  );
}
