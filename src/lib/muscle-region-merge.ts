import { MUSCLE_REGION_VALUES, MuscleRegionV1 } from "@/lib/exercise-library-standards";

export type ParentMuscleRegion = "chest" | "biceps" | "glutes" | "core";

export type MuscleMergeRule = {
  parent: ParentMuscleRegion;
  children: MuscleRegionV1[];
};

export const MERGE_GROUPS: MuscleMergeRule[] = [
  { parent: "chest", children: ["chest_upper", "chest_mid_lower"] },
  { parent: "biceps", children: ["biceps_inner", "biceps_outer"] },
  { parent: "glutes", children: ["glutes_max", "glutes_med"] },
  { parent: "core", children: ["abs", "obliques", "erector_spinae"] },
];

const RULE_BY_PARENT = new Map<ParentMuscleRegion, MuscleMergeRule>(
  MERGE_GROUPS.map((rule) => [rule.parent, rule]),
);

function dedupeRegions(regions: MuscleRegionV1[]) {
  return [...new Set(regions)];
}

export function expandForConflictAndHighlight(regions: MuscleRegionV1[]) {
  const expanded = new Set<MuscleRegionV1>();

  for (const region of dedupeRegions(regions)) {
    const rule = RULE_BY_PARENT.get(region as ParentMuscleRegion);
    if (!rule) {
      expanded.add(region);
      continue;
    }
    for (const child of rule.children) {
      expanded.add(child);
    }
  }

  return [...expanded];
}

export function compressWithinGroup(regions: MuscleRegionV1[]) {
  const atomic = new Set<MuscleRegionV1>(expandForConflictAndHighlight(regions));
  const collapsed = new Set<MuscleRegionV1>(atomic);

  for (const rule of MERGE_GROUPS) {
    if (!rule.children.every((child) => atomic.has(child))) {
      continue;
    }
    for (const child of rule.children) {
      collapsed.delete(child);
    }
    collapsed.add(rule.parent);
  }

  return MUSCLE_REGION_VALUES.filter((region) => collapsed.has(region));
}

export function areRegionsOverlapping(primary: MuscleRegionV1[], secondary: MuscleRegionV1[]) {
  const primaryExpanded = new Set(expandForConflictAndHighlight(primary));
  const secondaryExpanded = new Set(expandForConflictAndHighlight(secondary));
  for (const region of primaryExpanded) {
    if (secondaryExpanded.has(region)) {
      return true;
    }
  }
  return false;
}

export function getOptimisticLogicalCount(regions: MuscleRegionV1[]) {
  const atomic = new Set<MuscleRegionV1>(expandForConflictAndHighlight(regions));
  const currentLogicalCount = compressWithinGroup([...atomic]).length;

  let optimisticReduction = 0;
  for (const rule of MERGE_GROUPS) {
    const selectedChildren = rule.children.filter((child) => atomic.has(child)).length;
    if (selectedChildren >= 2 && selectedChildren < rule.children.length) {
      optimisticReduction += selectedChildren - 1;
    }
  }

  return Math.max(0, currentLogicalCount - optimisticReduction);
}

export function canReachLogicalLimit(regions: MuscleRegionV1[], limit: number) {
  return getOptimisticLogicalCount(regions) <= limit;
}
