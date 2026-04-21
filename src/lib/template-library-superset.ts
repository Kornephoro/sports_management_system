export const SUPERSET_SELECTION_MODE_VALUES = [
  "auto_rotation",
  "fixed_order",
  "manual",
] as const;

export type SupersetSelectionMode = (typeof SUPERSET_SELECTION_MODE_VALUES)[number];

export type SupersetGroupValue = {
  groupId: string;
  groupName: string | null;
  orderIndex: number;
  totalUnits: number;
  betweenExercisesRestSeconds: number | null;
  betweenRoundsRestSeconds: number | null;
  progressionBudgetPerExposure: number;
  selectionMode: SupersetSelectionMode;
};

export function isSupersetSelectionMode(value: unknown): value is SupersetSelectionMode {
  return (
    typeof value === "string" &&
    (SUPERSET_SELECTION_MODE_VALUES as readonly string[]).includes(value)
  );
}

export function normalizeSupersetProgressionBudget(value: unknown, fallback = 1) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(Math.max(Math.trunc(parsed), 1), 3);
  }
  return fallback;
}

export function countLogicalTemplateSlots<T extends { supersetGroup?: SupersetGroupValue | null }>(
  units: T[],
) {
  let count = 0;
  const seenGroupIds = new Set<string>();
  for (const unit of units) {
    const groupId = unit.supersetGroup?.groupId?.trim();
    if (!groupId) {
      count += 1;
      continue;
    }
    if (seenGroupIds.has(groupId)) {
      continue;
    }
    seenGroupIds.add(groupId);
    count += 1;
  }
  return count;
}
