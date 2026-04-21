"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MuscleRegionV1 } from "@/lib/exercise-library-standards";
import { compressWithinGroup } from "@/lib/muscle-region-merge";
import {
  buildToneByPathId,
  getMuscleEditorOptionByRegion,
  getPathIdsForOption,
} from "@/features/exercise-library/components/exercise-muscle-map-config";
import {
  computeNoLeaderDenseLayout,
  LeaderLayoutInput,
  SegmentBoundsByKey,
} from "@/features/exercise-library/components/muscle-label-layout";
import { getMuscleAnatomySvgTemplate } from "@/features/exercise-library/components/muscle-svg-template-cache";

type MuscleEditorAnatomyPreviewProps = {
  primaryRegions: MuscleRegionV1[];
  secondaryRegions: MuscleRegionV1[];
};
type ActiveLeaderInput = LeaderLayoutInput & { pathIds: string[] };

export function MuscleEditorAnatomyPreview({
  primaryRegions,
  secondaryRegions,
}: MuscleEditorAnatomyPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [svgTemplate, setSvgTemplate] = useState<string | null>(null);
  const [renderedSvg, setRenderedSvg] = useState<string | null>(null);
  const [segmentBoundsByKey, setSegmentBoundsByKey] = useState<SegmentBoundsByKey>({});
  const [overlayLayout, setOverlayLayout] = useState({
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });

  useEffect(() => {
    let canceled = false;
    const run = async () => {
      try {
        const text = await getMuscleAnatomySvgTemplate();
        if (!canceled) {
          setSvgTemplate(text);
        }
      } catch (error) {
        if (!canceled) {
          console.error("加载肌群 SVG 失败", error);
        }
      }
    };
    void run();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const target = containerRef.current;
    if (!target || typeof ResizeObserver === "undefined") return;

    const updateLayout = () => {
      const width = target.clientWidth;
      const height = target.clientHeight;
      const fitSize = Math.min(width, height);
      setOverlayLayout({
        width,
        height,
        offsetX: (width - fitSize) / 2,
        offsetY: (height - fitSize) / 2,
        scale: fitSize / 1024,
      });
    };

    updateLayout();
    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const canonicalPrimary = useMemo(() => compressWithinGroup(primaryRegions), [primaryRegions]);
  const canonicalSecondary = useMemo(() => compressWithinGroup(secondaryRegions), [secondaryRegions]);
  const toneByPathId = useMemo(
    () => buildToneByPathId(canonicalPrimary, canonicalSecondary),
    [canonicalPrimary, canonicalSecondary],
  );
  const toneSignature = useMemo(() => JSON.stringify(toneByPathId), [toneByPathId]);

  useEffect(() => {
    if (!svgTemplate) {
      setRenderedSvg(null);
      return;
    }
    if (typeof window === "undefined") {
      setRenderedSvg(svgTemplate);
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgTemplate, "image/svg+xml");
    doc.querySelectorAll(".muscle-region").forEach((node) => {
      node.setAttribute("data-tone", "base");
    });

    for (const [pathId, tone] of Object.entries(toneByPathId)) {
      const node = doc.getElementById(pathId);
      if (!node) continue;
      node.setAttribute("data-tone", tone);
    }

    const serialized = new XMLSerializer().serializeToString(doc.documentElement);
    setRenderedSvg(serialized);
  }, [svgTemplate, toneSignature, toneByPathId]);

  const activeLeaders = useMemo(() => {
    const lines: ActiveLeaderInput[] = [];

    const appendRegion = (
      region: MuscleRegionV1,
      tone: "primary" | "secondary",
      priorityBase: number,
    ) => {
      const option = getMuscleEditorOptionByRegion(region);
      if (!option || option.leaders.length === 0) return;
      const pathIds = getPathIdsForOption(option);
      if (pathIds.length === 0) return;
      const leader = option.leaders[0];
      lines.push({
        key: option.id,
        tone,
        anchor: leader.anchor,
        label: leader.label,
        text: option.label,
        priority: priorityBase,
        pathIds,
      });
    };

    canonicalPrimary.forEach((region, index) => appendRegion(region, "primary", index));
    canonicalSecondary
      .filter((region) => !canonicalPrimary.includes(region))
      .forEach((region, index) => appendRegion(region, "secondary", 100 + index));

    return lines;
  }, [canonicalPrimary, canonicalSecondary]);

  useEffect(() => {
    if (!renderedSvg || activeLeaders.length === 0 || overlayLayout.scale <= 0) {
      setSegmentBoundsByKey({});
      return;
    }

    const container = containerRef.current;
    if (!container) {
      setSegmentBoundsByKey({});
      return;
    }

    const svgNode = container.querySelector(".muscle-editor-anatomy-svg svg");
    if (!svgNode) {
      setSegmentBoundsByKey({});
      return;
    }

    const nextBounds: SegmentBoundsByKey = {};
    for (const leader of activeLeaders) {
      let picked:
        | {
            x: number;
            y: number;
            width: number;
            height: number;
            centerX: number;
            centerY: number;
          }
        | undefined;
      let minDist = Number.POSITIVE_INFINITY;

      for (const pathId of leader.pathIds) {
        const pathNode = svgNode.querySelector<SVGGraphicsElement>(`#${pathId}`);
        if (!pathNode) continue;
        const bbox = pathNode.getBBox();
        if (bbox.width <= 0 || bbox.height <= 0) continue;
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;
        const dist = Math.hypot(centerX - leader.anchor.x, centerY - leader.anchor.y);
        if (dist < minDist) {
          minDist = dist;
          picked = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height, centerX, centerY };
        }
      }

      if (!picked) continue;

      nextBounds[leader.key] = {
        left: overlayLayout.offsetX + picked.x * overlayLayout.scale,
        top: overlayLayout.offsetY + picked.y * overlayLayout.scale,
        width: picked.width * overlayLayout.scale,
        height: picked.height * overlayLayout.scale,
        centerX: overlayLayout.offsetX + picked.centerX * overlayLayout.scale,
        centerY: overlayLayout.offsetY + picked.centerY * overlayLayout.scale,
      };
    }

    setSegmentBoundsByKey(nextBounds);
  }, [renderedSvg, activeLeaders, overlayLayout]);

  const computedLayout = useMemo(
    () =>
      computeNoLeaderDenseLayout(activeLeaders, overlayLayout, segmentBoundsByKey, {
        fontSize: 12,
        margin: 10,
        rowGap: 4,
        labelGap: 11,
        avoidMusclePadding: 4,
      }),
    [activeLeaders, overlayLayout, segmentBoundsByKey],
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[300px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-950/40"
    >
      {renderedSvg ? (
        <>
          <div className="muscle-editor-anatomy-svg absolute inset-0" dangerouslySetInnerHTML={{ __html: renderedSvg }} />
          <div className="pointer-events-none absolute inset-0">
            {computedLayout.labels.map((label) => {
              return (
                <span
                  key={`label:${label.key}`}
                  className={`absolute whitespace-nowrap leading-none ${
                    label.tone === "primary" ? "font-extrabold" : "font-bold"
                  }`}
                  style={{
                    left: label.left,
                    top: label.top,
                    fontSize: `${label.fontSize}px`,
                    color:
                      label.tone === "primary"
                        ? "var(--muscle-highlight-primary)"
                        : "var(--muscle-highlight-secondary)",
                    textShadow:
                      "0 1px 0 rgba(255,255,255,.95), 0 -1px 0 rgba(255,255,255,.95), 1px 0 0 rgba(255,255,255,.95), -1px 0 0 rgba(255,255,255,.95), 0 2px 5px rgba(0,0,0,.07)",
                  }}
                >
                  {label.text}
                </span>
              );
            })}
          </div>
        </>
      ) : (
        <div className="h-full min-h-[180px] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900/70" />
      )}

      <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-3 rounded-lg bg-white/80 px-2 py-1 text-[10px] font-bold text-zinc-700 shadow-sm backdrop-blur dark:bg-zinc-900/80 dark:text-zinc-200">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-blue-600" />
          主要
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-blue-400" />
          次要
        </span>
      </div>

      <style jsx global>{`
        .muscle-editor-anatomy-svg svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        .muscle-editor-anatomy-svg .body-shape {
          fill: #e5e7eb !important;
        }
        .muscle-editor-anatomy-svg .muscle-region {
          fill: #d1d5db !important;
          opacity: 0.9;
          transition: fill 140ms ease, opacity 140ms ease;
        }
        .muscle-editor-anatomy-svg .muscle-region[data-tone="secondary"] {
          fill: var(--muscle-highlight-secondary) !important;
          opacity: 0.9;
        }
        .muscle-editor-anatomy-svg .muscle-region[data-tone="primary"] {
          fill: var(--muscle-highlight-primary) !important;
          opacity: 1;
        }
        .dark .muscle-editor-anatomy-svg .body-shape {
          fill: #2f3340 !important;
        }
        .dark .muscle-editor-anatomy-svg .muscle-region {
          fill: #4b5563 !important;
        }
      `}</style>
    </div>
  );
}
