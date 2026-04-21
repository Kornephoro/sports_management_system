import { SegmentTone } from "@/features/exercise-library/components/exercise-muscle-map-config";

export type LeaderLayoutInput = {
  key: string;
  text: string;
  tone: Exclude<SegmentTone, "base">;
  anchor: { x: number; y: number };
  label: { x: number; y: number };
  priority?: number;
};

export type LabelLayoutMetrics = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type ComputedLeaderLabel = {
  key: string;
  text: string;
  tone: Exclude<SegmentTone, "base">;
  left: number;
  top: number;
  width: number;
  height: number;
  align: "left" | "right" | "center";
  fontSize: number;
};

export type ComputedLeaderLayout = {
  labels: ComputedLeaderLabel[];
  lines: [];
};

export type SegmentBoundRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type SegmentBoundsByKey = Record<string, SegmentBoundRect>;

type DenseNoLeaderOptions = {
  fontSize?: number;
  margin?: number;
  rowGap?: number;
  labelGap?: number;
  avoidMusclePadding?: number;
};

type NoLeaderCandidateEval = {
  key: string;
  tone: Exclude<SegmentTone, "base">;
  text: string;
  align: "left" | "right" | "center";
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  score: number;
};

function toPx(point: { x: number; y: number }, metrics: LabelLayoutMetrics) {
  return {
    x: metrics.offsetX + point.x * metrics.scale,
    y: metrics.offsetY + point.y * metrics.scale,
  };
}

function estimateLabelBox(text: string, fontSize: number) {
  const width = Math.max(Math.round(text.length * (fontSize * 0.95)) + 8, fontSize * 2);
  const height = Math.round(fontSize * 1.3);
  return { width, height };
}

function overlapAreaRect(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
) {
  const x = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return x * y;
}

function buildNoLeaderCandidate(
  leader: LeaderLayoutInput,
  target: SegmentBoundRect,
  metrics: LabelLayoutMetrics,
  fontSize: number,
  margin: number,
  labelGap: number,
  avoidMusclePadding: number,
  type: "left" | "right" | "top" | "top_left" | "top_right" | "mid_upper",
  extraY: number,
): NoLeaderCandidateEval {
  const box = estimateLabelBox(leader.text, fontSize);
  let align: "left" | "right" | "center" = "left";
  let x = target.centerX;
  let y = target.centerY;

  if (type === "left") {
    align = "right";
    x = target.left - labelGap;
    y = target.centerY;
  } else if (type === "right") {
    align = "left";
    x = target.left + target.width + labelGap;
    y = target.centerY;
  } else if (type === "top") {
    align = "center";
    x = target.centerX;
    y = target.top - labelGap;
  } else if (type === "top_left") {
    align = "right";
    x = target.left - labelGap * 0.8;
    y = target.top - labelGap * 0.66;
  } else if (type === "top_right") {
    align = "left";
    x = target.left + target.width + labelGap * 0.8;
    y = target.top - labelGap * 0.66;
  } else {
    align = "center";
    x = target.centerX;
    y = target.top + Math.max(target.height * 0.2, fontSize * 0.8);
  }

  y += extraY;

  const boxLeft = align === "left" ? x : align === "right" ? x - box.width : x - box.width / 2;
  const boxTop = y - box.height / 2;
  const labelRect = {
    left: boxLeft,
    top: boxTop,
    width: box.width,
    height: box.height,
  };

  const overLeft = Math.max(0, margin - boxLeft);
  const overRight = Math.max(0, boxLeft + box.width - (metrics.width - margin));
  const overTop = Math.max(0, margin - boxTop);
  const overBottom = Math.max(0, boxTop + box.height - (metrics.height - margin));
  const overflowPenalty = (overLeft + overRight + overTop + overBottom) * 300;

  const avoidRect = {
    left: target.left - avoidMusclePadding,
    top: target.top - avoidMusclePadding,
    width: target.width + avoidMusclePadding * 2,
    height: target.height + avoidMusclePadding * 2,
  };
  const muscleOverlapPenalty = overlapAreaRect(labelRect, avoidRect) * 1.45;

  const labelCenterX = boxLeft + box.width / 2;
  const labelCenterY = boxTop + box.height / 2;
  const distancePenalty = Math.hypot(labelCenterX - target.centerX, labelCenterY - target.centerY) * 0.09;

  const typeWeight =
    type === "left" || type === "right"
      ? 0
      : type === "top"
        ? 5
        : type === "top_left" || type === "top_right"
          ? 8
          : 12;

  return {
    key: leader.key,
    tone: leader.tone,
    text: leader.text,
    align,
    boxLeft,
    boxTop,
    boxWidth: box.width,
    boxHeight: box.height,
    score: overflowPenalty + muscleOverlapPenalty + distancePenalty + typeWeight,
  };
}

function buildFallbackTarget(leader: LeaderLayoutInput, metrics: LabelLayoutMetrics): SegmentBoundRect {
  const anchorPx = toPx(leader.anchor, metrics);
  const size = Math.max(28, metrics.scale * 72);
  return {
    left: anchorPx.x - size / 2,
    top: anchorPx.y - size / 2,
    width: size,
    height: size,
    centerX: anchorPx.x,
    centerY: anchorPx.y,
  };
}

export function computeNoLeaderDenseLayout(
  leaders: LeaderLayoutInput[],
  metrics: LabelLayoutMetrics,
  segmentBoundsByKey: SegmentBoundsByKey,
  options: DenseNoLeaderOptions = {},
): ComputedLeaderLayout {
  if (metrics.width <= 0 || metrics.height <= 0 || metrics.scale <= 0) {
    return { labels: [], lines: [] };
  }

  const fontSize = options.fontSize ?? 12;
  const margin = options.margin ?? 8;
  const rowGap = options.rowGap ?? 4;
  const labelGap = options.labelGap ?? 12;
  const avoidMusclePadding = options.avoidMusclePadding ?? 5;
  const placed: NoLeaderCandidateEval[] = [];
  const sorted = [...leaders].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  for (const leader of sorted) {
    const target = segmentBoundsByKey[leader.key] ?? buildFallbackTarget(leader, metrics);
    const candidates: NoLeaderCandidateEval[] = [];
    const placements: Array<"left" | "right" | "top" | "top_left" | "top_right" | "mid_upper"> = [
      "left",
      "right",
      "top",
      "top_left",
      "top_right",
      "mid_upper",
    ];
    const nudges = [0, -1, 1, -2, 2].map((n) => n * (fontSize + rowGap) * 0.45);

    for (const placement of placements) {
      for (const nudge of nudges) {
        const candidate = buildNoLeaderCandidate(
          leader,
          target,
          metrics,
          fontSize,
          margin,
          labelGap,
          avoidMusclePadding,
          placement,
          nudge,
        );
        for (const exists of placed) {
          const overlap = overlapAreaRect(
            {
              left: candidate.boxLeft,
              top: candidate.boxTop,
              width: candidate.boxWidth,
              height: candidate.boxHeight,
            },
            {
              left: exists.boxLeft,
              top: exists.boxTop,
              width: exists.boxWidth,
              height: exists.boxHeight,
            },
          );
          if (overlap > 0) {
            candidate.score += overlap * 0.1;
          }
        }
        candidates.push(candidate);
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    if (candidates[0]) {
      placed.push(candidates[0]);
    }
  }

  return {
    labels: placed.map((item) => ({
      key: item.key,
      text: item.text,
      tone: item.tone,
      left: item.boxLeft,
      top: item.boxTop,
      width: item.boxWidth,
      height: item.boxHeight,
      align: item.align,
      fontSize,
    })),
    lines: [],
  };
}
