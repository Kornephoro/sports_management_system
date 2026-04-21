import {
  getMuscleEditorOptionByRegion,
  buildToneByPathId,
} from "@/features/exercise-library/components/exercise-muscle-map-config";
import { MuscleRegionV1 } from "@/lib/exercise-library-standards";
import { compressWithinGroup } from "@/lib/muscle-region-merge";

const TRAINING_RECORD_PRIMARY_COLOR = "#ef4444";
const TRAINING_RECORD_SECONDARY_COLOR = "#f59e0b";
const TRAINING_RECORD_BASE_COLOR = "#cbd5e1";
const TRAINING_RECORD_BODY_COLOR = "#eef2f7";
const TRAINING_RECORD_BORDER_COLOR = "#d4d4d8";
const TRAINING_RECORD_LABEL_SHADOW =
  "0 1px 0 rgba(255,255,255,.96), 0 -1px 0 rgba(255,255,255,.96), 1px 0 0 rgba(255,255,255,.96), -1px 0 0 rgba(255,255,255,.96), 0 2px 5px rgba(0,0,0,.08)";

function uniqueRegions(regions: MuscleRegionV1[]) {
  return compressWithinGroup(regions);
}

function buildVisibleLabels(primary: MuscleRegionV1[], secondary: MuscleRegionV1[]) {
  const rows: Array<{
    key: string;
    tone: "primary" | "secondary";
    text: string;
    left: number;
    top: number;
  }> = [];

  uniqueRegions(primary).forEach((region) => {
    const option = getMuscleEditorOptionByRegion(region);
    const leader = option?.leaders[0];
    if (!option || !leader) return;
    rows.push({
      key: `primary:${option.id}`,
      tone: "primary",
      text: option.label,
      left: leader.label.x,
      top: leader.label.y,
    });
  });

  uniqueRegions(secondary)
    .filter((region) => !primary.includes(region))
    .forEach((region) => {
      const option = getMuscleEditorOptionByRegion(region);
      const leader = option?.leaders[0];
      if (!option || !leader) return;
      rows.push({
        key: `secondary:${option.id}`,
        tone: "secondary",
        text: option.label,
        left: leader.label.x,
        top: leader.label.y,
      });
    });

  return rows;
}

export function renderTrainingRecordAnatomySvg(args: {
  template: string;
  primary: MuscleRegionV1[];
  secondary: MuscleRegionV1[];
  showLabels?: boolean;
}) {
  const { template, primary, secondary, showLabels = true } = args;

  if (typeof window === "undefined") {
    return template;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(template, "image/svg+xml");
  const root = doc.documentElement;

  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", "训练肌群高亮图");

  const toneByPathId = buildToneByPathId(uniqueRegions(primary), uniqueRegions(secondary));
  doc.querySelectorAll(".muscle-region").forEach((node) => {
    node.setAttribute("data-tone", "base");
  });

  for (const [pathId, tone] of Object.entries(toneByPathId)) {
    const node = doc.getElementById(pathId);
    if (!node) continue;
    node.setAttribute("data-tone", tone);
  }

  const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .body-shape{fill:${TRAINING_RECORD_BODY_COLOR}!important;}
    .muscle-region{fill:${TRAINING_RECORD_BASE_COLOR}!important;opacity:.92;transition:fill 140ms ease,opacity 140ms ease;}
    .muscle-region[data-tone="secondary"]{fill:${TRAINING_RECORD_SECONDARY_COLOR}!important;opacity:.96;}
    .muscle-region[data-tone="primary"]{fill:${TRAINING_RECORD_PRIMARY_COLOR}!important;opacity:1;}
    .training-record-label{font-family:Arial,sans-serif;font-size:28px;letter-spacing:0;}
    .training-record-label.primary{fill:${TRAINING_RECORD_PRIMARY_COLOR};font-weight:800;}
    .training-record-label.secondary{fill:${TRAINING_RECORD_SECONDARY_COLOR};font-weight:700;}
  `;
  root.insertBefore(style, root.firstChild);

  if (showLabels) {
    const labelLayer = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    labelLayer.setAttribute("class", "training-record-label-layer");
    buildVisibleLabels(uniqueRegions(primary), uniqueRegions(secondary)).forEach((item) => {
      const text = doc.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(item.left));
      text.setAttribute("y", String(item.top));
      text.setAttribute("class", `training-record-label ${item.tone}`);
      text.setAttribute("paint-order", "stroke");
      text.setAttribute("stroke", "rgba(255,255,255,.96)");
      text.setAttribute("stroke-width", "6");
      text.setAttribute("stroke-linejoin", "round");
      text.setAttribute("style", `text-shadow:${TRAINING_RECORD_LABEL_SHADOW};`);
      text.textContent = item.text;
      labelLayer.appendChild(text);
    });
    root.appendChild(labelLayer);
  }

  return new XMLSerializer().serializeToString(root);
}

export function buildTrainingRecordAnatomyDataUri(args: {
  template: string;
  primary: MuscleRegionV1[];
  secondary: MuscleRegionV1[];
  showLabels?: boolean;
}) {
  const svg = renderTrainingRecordAnatomySvg(args);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function getTrainingRecordAnatomyLegend() {
  return {
    primaryLabel: "主要肌群",
    secondaryLabel: "次要肌群",
    primaryColor: TRAINING_RECORD_PRIMARY_COLOR,
    secondaryColor: TRAINING_RECORD_SECONDARY_COLOR,
    borderColor: TRAINING_RECORD_BORDER_COLOR,
  };
}
