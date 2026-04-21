import { MuscleRegionV1 } from "@/lib/exercise-library-standards";
import { expandForConflictAndHighlight } from "@/lib/muscle-region-merge";

export type SegmentTone = "primary" | "secondary" | "base";

export type MuscleLeaderLine = {
  anchor: { x: number; y: number };
  label: { x: number; y: number };
};

export type MuscleEditorOption = {
  id: string;
  label: string;
  regions: MuscleRegionV1[];
  leaders: MuscleLeaderLine[];
  buttonHidden?: boolean;
};

type ManualSegmentId =
  | "chestUpper"
  | "chestMidLower"
  | "lats"
  | "trapsUpper"
  | "trapsMidLower"
  | "rotatorCuffs"
  | "lowerBack"
  | "frontDelts"
  | "sideDelts"
  | "rearDelts"
  | "triceps"
  | "bicepsInner"
  | "bicepsOuter"
  | "forearms"
  | "abs"
  | "obliques"
  | "glutesUpper"
  | "glutesMidLower"
  | "quads"
  | "hamstrings"
  | "adductors"
  | "abductors"
  | "calves"
  | "neck";

export const MUSCLE_EDITOR_OPTIONS: MuscleEditorOption[] = [
  {
    id: "traps_mid_upper",
    label: "中上斜方肌",
    regions: ["traps_mid_upper"],
    leaders: [
      {
        anchor: { x: 272, y: 188 },
        label: { x: 120, y: 142 },
      },
      {
        anchor: { x: 773, y: 220 },
        label: { x: 930, y: 176 },
      },
    ],
  },
  {
    id: "chest",
    label: "胸肌",
    regions: ["chest"],
    leaders: [{ anchor: { x: 272, y: 270 }, label: { x: 86, y: 238 } }],
    buttonHidden: true,
  },
  {
    id: "chest_upper",
    label: "上胸",
    regions: ["chest_upper"],
    leaders: [{ anchor: { x: 272, y: 234 }, label: { x: 86, y: 208 } }],
  },
  {
    id: "chest_mid_lower",
    label: "中下胸",
    regions: ["chest_mid_lower"],
    leaders: [{ anchor: { x: 272, y: 302 }, label: { x: 70, y: 284 } }],
  },
  {
    id: "lats",
    label: "背阔肌",
    regions: ["lats"],
    leaders: [
      { anchor: { x: 206, y: 426 }, label: { x: 54, y: 446 } },
      { anchor: { x: 717, y: 448 }, label: { x: 564, y: 462 } },
    ],
  },
  {
    id: "erector_spinae",
    label: "竖脊肌",
    regions: ["erector_spinae"],
    leaders: [{ anchor: { x: 773, y: 372 }, label: { x: 942, y: 372 } }],
  },
  {
    id: "delt_front",
    label: "三角肌前束",
    regions: ["delt_front"],
    leaders: [{ anchor: { x: 238, y: 248 }, label: { x: 84, y: 242 } }],
  },
  {
    id: "delt_mid",
    label: "三角肌中束",
    regions: ["delt_mid"],
    leaders: [
      { anchor: { x: 186, y: 278 }, label: { x: 42, y: 316 } },
      { anchor: { x: 864, y: 288 }, label: { x: 990, y: 310 } },
    ],
  },
  {
    id: "delt_rear",
    label: "三角肌后束",
    regions: ["delt_rear"],
    leaders: [{ anchor: { x: 740, y: 298 }, label: { x: 566, y: 332 } }],
  },
  {
    id: "biceps",
    label: "肱二头肌",
    regions: ["biceps"],
    leaders: [{ anchor: { x: 160, y: 302 }, label: { x: 26, y: 362 } }],
    buttonHidden: true,
  },
  {
    id: "biceps_inner",
    label: "肱二头肌内侧",
    regions: ["biceps_inner"],
    leaders: [{ anchor: { x: 158, y: 300 }, label: { x: 32, y: 362 } }],
  },
  {
    id: "biceps_outer",
    label: "肱二头肌外侧",
    regions: ["biceps_outer"],
    leaders: [{ anchor: { x: 358, y: 308 }, label: { x: 486, y: 322 } }],
  },
  {
    id: "triceps",
    label: "肱三头肌",
    regions: ["triceps"],
    leaders: [
      { anchor: { x: 368, y: 350 }, label: { x: 476, y: 368 } },
      { anchor: { x: 860, y: 354 }, label: { x: 980, y: 348 } },
    ],
  },
  {
    id: "forearms",
    label: "小臂肌群",
    regions: ["forearms"],
    leaders: [
      { anchor: { x: 168, y: 412 }, label: { x: 30, y: 418 } },
      { anchor: { x: 862, y: 410 }, label: { x: 980, y: 416 } },
    ],
  },
  {
    id: "core",
    label: "核心肌群",
    regions: ["core"],
    leaders: [{ anchor: { x: 280, y: 382 }, label: { x: 84, y: 504 } }],
    buttonHidden: true,
  },
  {
    id: "abs",
    label: "腹肌",
    regions: ["abs"],
    leaders: [
      {
        anchor: { x: 272, y: 386 },
        label: { x: 84, y: 506 },
      },
    ],
  },
  {
    id: "obliques",
    label: "侧腹",
    regions: ["obliques"],
    leaders: [
      {
        anchor: { x: 338, y: 392 },
        label: { x: 492, y: 444 },
      },
      {
        anchor: { x: 700, y: 382 },
        label: { x: 542, y: 420 },
      },
    ],
  },
  {
    id: "rhomboids",
    label: "菱形肌",
    regions: ["rhomboids"],
    leaders: [{ anchor: { x: 726, y: 232 }, label: { x: 560, y: 248 } }],
  },
  {
    id: "rotator_cuff",
    label: "肩袖肌群",
    regions: ["rotator_cuff"],
    leaders: [{ anchor: { x: 773, y: 264 }, label: { x: 948, y: 256 } }],
  },
  {
    id: "glutes_med",
    label: "臀中肌",
    regions: ["glutes_med"],
    leaders: [{ anchor: { x: 738, y: 542 }, label: { x: 546, y: 536 } }],
  },
  {
    id: "glutes_max",
    label: "臀大肌",
    regions: ["glutes_max"],
    leaders: [{ anchor: { x: 812, y: 562 }, label: { x: 998, y: 556 } }],
  },
  {
    id: "glutes",
    label: "臀部肌群",
    regions: ["glutes"],
    leaders: [{ anchor: { x: 804, y: 566 }, label: { x: 998, y: 556 } }],
    buttonHidden: true,
  },
  {
    id: "adductors",
    label: "内收肌群",
    regions: ["adductors"],
    leaders: [
      { anchor: { x: 298, y: 584 }, label: { x: 484, y: 598 } },
      { anchor: { x: 744, y: 594 }, label: { x: 548, y: 612 } },
    ],
  },
  {
    id: "quads",
    label: "股四头肌",
    regions: ["quads"],
    leaders: [
      {
        anchor: { x: 270, y: 556 },
        label: { x: 78, y: 688 },
      },
    ],
  },
  {
    id: "it_band",
    label: "髂胫束",
    regions: ["it_band"],
    leaders: [
      { anchor: { x: 355, y: 566 }, label: { x: 486, y: 548 } },
      { anchor: { x: 700, y: 560 }, label: { x: 552, y: 566 } },
    ],
  },
  {
    id: "hamstrings",
    label: "腘绳肌",
    regions: ["hamstrings"],
    leaders: [{ anchor: { x: 775, y: 622 }, label: { x: 970, y: 648 } }],
  },
  {
    id: "calves",
    label: "小腿肌群",
    regions: ["calves"],
    leaders: [
      { anchor: { x: 356, y: 716 }, label: { x: 480, y: 642 } },
      { anchor: { x: 768, y: 720 }, label: { x: 944, y: 730 } },
    ],
  },
  {
    id: "neck",
    label: "颈部肌群",
    regions: ["neck"],
    leaders: [{ anchor: { x: 272, y: 160 }, label: { x: 94, y: 120 } }],
  },
];

const MANUAL_SEGMENT_PATH_IDS: Record<ManualSegmentId, string[]> = {
  chestUpper: ["muscle_chestUpper", "muscle_chestUpper_2"],
  chestMidLower: ["muscle_chestMidLower", "muscle_chestMidLower_2"],
  lats: ["muscle_lats"],
  trapsUpper: [
    "muscle_trapsUpper",
    "muscle_trapsUpper_2",
    "muscle_trapsUpper_3",
    "muscle_trapsUpper_4",
  ],
  trapsMidLower: ["muscle_trapsMidLower"],
  rotatorCuffs: ["muscle_rotatorCuffs", "muscle_rotatorCuffs_2"],
  lowerBack: ["muscle_lowerBack"],
  frontDelts: ["muscle_frontDelts"],
  sideDelts: ["muscle_sideDelts", "muscle_sideDelts_2", "muscle_sideDelts_3"],
  rearDelts: ["muscle_rearDelts", "muscle_rearDelts_2"],
  triceps: ["muscle_triceps"],
  bicepsInner: ["muscle_bicepsInner", "muscle_bicepsInner_2"],
  bicepsOuter: ["muscle_bicepsOuter", "muscle_bicepsOuter_2"],
  forearms: ["muscle_forearms"],
  abs: ["muscle_abs"],
  obliques: ["muscle_obliques", "muscle_obliques_2", "muscle_obliques_3"],
  glutesUpper: ["muscle_glutesUpper", "muscle_glutesUpper_2"],
  glutesMidLower: ["muscle_glutesMidLower"],
  quads: ["muscle_quads"],
  hamstrings: ["muscle_hamstrings"],
  adductors: ["muscle_adductors"],
  abductors: ["muscle_abductors"],
  calves: ["muscle_calves"],
  neck: ["muscle_neck"],
};

const REGION_TO_SEGMENTS: Record<MuscleRegionV1, ManualSegmentId[]> = {
  neck: ["neck"],
  chest: ["chestUpper", "chestMidLower"],
  chest_upper: ["chestUpper"],
  chest_mid_lower: ["chestMidLower"],
  traps_mid_upper: ["trapsUpper"],
  rhomboids: ["rotatorCuffs"],
  rotator_cuff: ["trapsMidLower"],
  lats: ["lats"],
  erector_spinae: ["lowerBack"],
  delt_front: ["frontDelts"],
  delt_mid: ["sideDelts"],
  delt_rear: ["rearDelts"],
  biceps: ["bicepsInner", "bicepsOuter"],
  biceps_inner: ["bicepsInner"],
  biceps_outer: ["bicepsOuter"],
  triceps: ["triceps"],
  forearms: ["forearms"],
  core: ["abs", "obliques", "lowerBack"],
  abs: ["abs"],
  obliques: ["obliques"],
  glutes: ["glutesUpper", "glutesMidLower"],
  glutes_max: ["glutesMidLower"],
  glutes_med: ["glutesUpper"],
  adductors: ["adductors"],
  quads: ["quads"],
  it_band: ["abductors"],
  hamstrings: ["hamstrings"],
  calves: ["calves"],
};

function expandMuscleRegions(regions: MuscleRegionV1[]) {
  return new Set<MuscleRegionV1>(expandForConflictAndHighlight(regions));
}

export function buildToneByPathId(primaryRegions: MuscleRegionV1[], secondaryRegions: MuscleRegionV1[]) {
  const expandedPrimary = expandMuscleRegions(primaryRegions);
  const expandedSecondary = expandMuscleRegions(secondaryRegions);
  const toneByPathId: Record<string, SegmentTone> = {};

  const applyTone = (region: MuscleRegionV1, tone: SegmentTone) => {
    const segmentIds = REGION_TO_SEGMENTS[region] ?? [];
    for (const segmentId of segmentIds) {
      const pathIds = MANUAL_SEGMENT_PATH_IDS[segmentId] ?? [];
      for (const pathId of pathIds) {
        if (tone === "primary" || !toneByPathId[pathId]) {
          toneByPathId[pathId] = tone;
        }
      }
    }
  };

  for (const region of expandedPrimary) {
    applyTone(region, "primary");
  }
  for (const region of expandedSecondary) {
    applyTone(region, "secondary");
  }

  return toneByPathId;
}

export function getPathIdsForRegion(region: MuscleRegionV1) {
  const pathIds: string[] = [];
  const segmentIds = REGION_TO_SEGMENTS[region] ?? [];
  for (const segmentId of segmentIds) {
    pathIds.push(...(MANUAL_SEGMENT_PATH_IDS[segmentId] ?? []));
  }
  return [...new Set(pathIds)];
}

export function getPathIdsForOption(option: MuscleEditorOption) {
  const pathIds: string[] = [];
  for (const region of option.regions) {
    pathIds.push(...getPathIdsForRegion(region));
  }
  return [...new Set(pathIds)];
}

export const MUSCLE_EDITOR_BUTTON_OPTIONS = MUSCLE_EDITOR_OPTIONS.filter((option) => !option.buttonHidden);

export function getMuscleEditorOptionByRegion(region: MuscleRegionV1) {
  return MUSCLE_EDITOR_OPTIONS.find((option) => option.regions.includes(region));
}
