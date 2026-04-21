"use client";

import {
  EXERCISE_CATEGORY_OPTIONS,
  MovementPatternV1,
  MOVEMENT_PATTERN_OPTIONS,
  MuscleRegionV1,
} from "@/lib/exercise-library-standards";
import {
  MuscleEditorPanelContent,
  MuscleEditorTab,
} from "@/features/exercise-library/components/muscle-editor-panel-content";

type ExerciseCreateBottomSheetProps = {
  open: boolean;
  name: string;
  description: string;
  movementPattern: MovementPatternV1;
  category: "compound" | "isolation";
  primaryRegions: MuscleRegionV1[];
  secondaryRegions: MuscleRegionV1[];
  editorTab: MuscleEditorTab;
  muscleSaveError: string | null;
  mergeHint: string | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  onNameChange: (next: string) => void;
  onDescriptionChange: (next: string) => void;
  onMovementPatternChange: (next: MovementPatternV1) => void;
  onCategoryChange: (next: "compound" | "isolation") => void;
  onEditorTabChange: (next: MuscleEditorTab) => void;
  onTogglePrimary: (regions: MuscleRegionV1[]) => void;
  onToggleSecondary: (regions: MuscleRegionV1[]) => void;
};

export function ExerciseCreateBottomSheet({
  open,
  name,
  description,
  movementPattern,
  category,
  primaryRegions,
  secondaryRegions,
  editorTab,
  muscleSaveError,
  mergeHint,
  saving,
  error,
  onClose,
  onSave,
  onNameChange,
  onDescriptionChange,
  onMovementPatternChange,
  onCategoryChange,
  onEditorTabChange,
  onTogglePrimary,
  onToggleSecondary,
}: ExerciseCreateBottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[72] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <section className="relative flex h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-[2.2rem] border border-zinc-200 bg-white shadow-2xl animate-in slide-in-from-bottom-8 duration-300 dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <p className="text-base font-black tracking-tight text-zinc-900 dark:text-zinc-50">新建动作</p>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">动作名称</p>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="例如：杠铃卧推"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
            <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">动作模式</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MOVEMENT_PATTERN_OPTIONS.map((option) => {
                const active = movementPattern === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onMovementPatternChange(option.value)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
            <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">技术分类</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {EXERCISE_CATEGORY_OPTIONS.map((option) => {
                const active = category === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onCategoryChange(option.value)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
            <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">肌群信息</p>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              直接在当前页面编辑主要/次要训练部位
            </p>
            <div className="mt-2">
              <MuscleEditorPanelContent
                editorTab={editorTab}
                primaryRegions={primaryRegions}
                secondaryRegions={secondaryRegions}
                saveError={muscleSaveError}
                mergeHint={mergeHint}
                onEditorTabChange={onEditorTabChange}
                onTogglePrimary={onTogglePrimary}
                onToggleSecondary={onToggleSecondary}
              />
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-black text-zinc-800 dark:text-zinc-100">动作做法</p>
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              rows={4}
              placeholder="输入动作做法与注意事项"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </section>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-zinc-100 bg-white/95 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "创建中..." : "创建"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
