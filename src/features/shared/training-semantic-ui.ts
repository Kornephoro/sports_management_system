import type { ActionProgressVisualStatus } from "@/features/progression/progression-visual-state";

export function getTrainingStatusBadgeClass(status: string) {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "partial") {
    return "bg-amber-100 text-amber-700";
  }
  if (status === "skipped" || status === "canceled") {
    return "bg-rose-100 text-rose-700";
  }
  if (status === "planned" || status === "ready") {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-zinc-100 text-zinc-700";
}

type VisualToneConfig = {
  toneClassName: string;
  detailChipClassName: string;
  matrixCellClassName: string;
};

const VISUAL_STATUS_STYLE: Record<ActionProgressVisualStatus, VisualToneConfig> = {
  no_change: {
    // 维持轮/留白 (Maintained / White / Hollow) - Normal executed but held wait
    toneClassName: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    detailChipClassName: "border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    matrixCellClassName: "border-zinc-200 bg-white text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200", 
  },
  threshold_progress: {
    // 逼近阈值但还在积累期 (Treat as Accumulation or Maintenance? Treat as White/Amber outline)
    toneClassName: "bg-amber-100 text-amber-800",
    detailChipClassName: "border-amber-300 bg-amber-50 text-amber-800",
    matrixCellClassName: "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600/50 dark:bg-amber-950/40 dark:text-amber-300",
  },
  regular_progress: {
    // 进步轮 (Accumulation - Added volume, maintained load) - Yellow (Solid)
    toneClassName: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-400",
    detailChipClassName: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-900/60",
    matrixCellClassName: "border-transparent bg-amber-400 text-amber-950 shadow-md ring-1 ring-amber-500/50 dark:bg-amber-500 dark:text-amber-950",
  },
  realization_round: {
    // 实现轮 (Realization - Added Load) - Red (Solid)
    toneClassName: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
    detailChipClassName: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/40",
    matrixCellClassName: "border-transparent bg-rose-500 text-white shadow-md ring-1 ring-rose-600/50 dark:bg-rose-600",
  },
  planned_deload: {
    // 减载 (Deload / Regression) - Blue
    toneClassName: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    detailChipClassName: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/40",
    matrixCellClassName: "border-transparent bg-blue-500 text-white shadow-md ring-1 ring-blue-600/50 dark:bg-blue-600",
  },
  exception_adjustment: {
    // 异常调整 (Failed/Regression) - Blue (Downwards adjusted)
    toneClassName: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    detailChipClassName: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/40",
    matrixCellClassName: "border-transparent bg-blue-500 text-white shadow-md ring-1 ring-blue-600/50 dark:bg-blue-600",
  },
};

export function getProgressVisualTone(status: ActionProgressVisualStatus) {
  return VISUAL_STATUS_STYLE[status];
}

export function getProgressForecastClassName() {
  return "border border-sky-300 bg-sky-50 text-sky-700";
}

export function getProgressSourceHintClassName(kind: "skipped" | "partial" | "unmet") {
  if (kind === "skipped") {
    return "border border-amber-300 bg-amber-50 text-amber-700";
  }
  if (kind === "partial") {
    return "border border-orange-300 bg-orange-50 text-orange-700";
  }
  return "border border-zinc-300 bg-zinc-50 text-zinc-700";
}
