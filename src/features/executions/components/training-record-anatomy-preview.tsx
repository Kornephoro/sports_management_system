"use client";

import { useEffect, useState } from "react";

import { getMuscleAnatomySvgTemplate } from "@/features/exercise-library/components/muscle-svg-template-cache";
import { MuscleRegionV1 } from "@/lib/exercise-library-standards";
import {
  getTrainingRecordAnatomyLegend,
  renderTrainingRecordAnatomySvg,
} from "@/features/executions/training-record-anatomy";

type Props = {
  primary: MuscleRegionV1[];
  secondary: MuscleRegionV1[];
};

export function TrainingRecordAnatomyPreview({ primary, secondary }: Props) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const legend = getTrainingRecordAnatomyLegend();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const template = await getMuscleAnatomySvgTemplate();
        if (cancelled) return;
        setSvgMarkup(
          renderTrainingRecordAnatomySvg({
            template,
            primary,
            secondary,
            showLabels: true,
          }),
        );
      } catch (error) {
        if (!cancelled) {
          console.error("加载训练肌群图失败", error);
          setSvgMarkup(null);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [primary, secondary]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/40">
        {svgMarkup ? (
          <div
            className="aspect-[1.36] w-full [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : (
          <div className="aspect-[1.36] w-full animate-pulse bg-zinc-100 dark:bg-zinc-900/70" />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: legend.primaryColor }} />
          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{legend.primaryLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: legend.secondaryColor }} />
          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{legend.secondaryLabel}</span>
        </div>
      </div>
    </div>
  );
}
