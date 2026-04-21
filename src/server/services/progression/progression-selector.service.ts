import { ProgressTrackStatus } from "@prisma/client";
import { UnitRoleValue } from "@/lib/progression-standards";
import { ProgressTrackState } from "@/lib/progression-types";

type RotationCandidateUnit = {
  progressTrackKey: string;
  unitRole: UnitRoleValue | string;
  progressionPolicyType: string;
  progressionPolicyConfig: Record<string, unknown>;
  adjustmentPolicyType: string;
  adjustmentPolicyConfig: Record<string, unknown>;
  movementPatterns?: string[];
  primaryMuscles?: string[];
};

type RotationTrackRuntime = {
  status: ProgressTrackStatus;
  lastProgressionAt: Date | null;
  currentState: ProgressTrackState;
};

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return fallback;
}

function getCooldownUntil(state: ProgressTrackState) {
  if (typeof state.cooldown_until !== "string" || state.cooldown_until.trim().length === 0) {
    return null;
  }
  const parsed = new Date(state.cooldown_until);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeTagArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeDiversifyDimensions(value: unknown) {
  const fallback: Array<"primary_muscle" | "movement_pattern"> = [
    "primary_muscle",
    "movement_pattern",
  ];

  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(
      (item): item is "primary_muscle" | "movement_pattern" =>
        item === "primary_muscle" || item === "movement_pattern",
    );

  const unique = Array.from(new Set(normalized));
  return unique.length > 0 ? unique : fallback;
}

function canJoinRotationPool(
  unit: RotationCandidateUnit,
  track: RotationTrackRuntime,
  now: Date,
) {
  if (track.status === "paused" || track.status === "completed") {
    return false;
  }

  if (unit.progressionPolicyType === "manual" || unit.progressionPolicyType === "hold_or_manual") {
    return false;
  }

  const cooldownUntil = getCooldownUntil(track.currentState);
  if (cooldownUntil && cooldownUntil.getTime() > now.getTime()) {
    return false;
  }

  if (toBoolean(unit.progressionPolicyConfig.progression_enabled, true) === false) {
    return false;
  }

  if (toBoolean(unit.adjustmentPolicyConfig.progression_enabled, true) === false) {
    return false;
  }

  if (unit.unitRole === "accessory") {
    if (unit.adjustmentPolicyType === "manual") {
      return false;
    }
    return true;
  }

  if (unit.unitRole === "secondary") {
    if (unit.adjustmentPolicyType === "rotating_pool") {
      return true;
    }
    return (
      toBoolean(unit.progressionPolicyConfig.enable_rotation, false) ||
      toBoolean(unit.adjustmentPolicyConfig.enable_rotation, false)
    );
  }

  return false;
}

function compareLastProgressionAsc(
  a: { lastProgressionAt: Date | null; trackKey: string; pendingRetry: boolean },
  b: { lastProgressionAt: Date | null; trackKey: string; pendingRetry: boolean },
) {
  if (a.pendingRetry !== b.pendingRetry) {
    return a.pendingRetry ? -1 : 1;
  }
  if (!a.lastProgressionAt && !b.lastProgressionAt) {
    return a.trackKey.localeCompare(b.trackKey);
  }
  if (!a.lastProgressionAt) {
    return -1;
  }
  if (!b.lastProgressionAt) {
    return 1;
  }
  if (a.lastProgressionAt.getTime() === b.lastProgressionAt.getTime()) {
    return a.trackKey.localeCompare(b.trackKey);
  }
  return a.lastProgressionAt.getTime() - b.lastProgressionAt.getTime();
}

export function selectRotationTrackKeys(params: {
  units: RotationCandidateUnit[];
  tracksByKey: Map<string, RotationTrackRuntime>;
  now: Date;
  rotationQuota: number;
  diversifyDimensions?: string[];
}) {
  const { units, tracksByKey, now, rotationQuota, diversifyDimensions } = params;
  const normalizedQuota = Math.min(Math.max(Math.trunc(rotationQuota), 1), 5);
  const normalizedDimensions = normalizeDiversifyDimensions(diversifyDimensions);

  const candidateTrackMap = new Map<
    string,
    {
      trackKey: string;
      lastProgressionAt: Date | null;
      pendingRetry: boolean;
      movementPatterns: Set<string>;
      primaryMuscles: Set<string>;
    }
  >();

  for (const unit of units) {
    const track = tracksByKey.get(unit.progressTrackKey);
    if (!track) {
      continue;
    }
    if (!canJoinRotationPool(unit, track, now)) {
      continue;
    }

    const current = candidateTrackMap.get(unit.progressTrackKey);
    if (!current) {
      candidateTrackMap.set(unit.progressTrackKey, {
        trackKey: unit.progressTrackKey,
        lastProgressionAt: track.lastProgressionAt,
        pendingRetry: track.currentState.pending_retry === true,
        movementPatterns: new Set(normalizeTagArray(unit.movementPatterns)),
        primaryMuscles: new Set(normalizeTagArray(unit.primaryMuscles)),
      });
      continue;
    }

    normalizeTagArray(unit.movementPatterns).forEach((item) => current.movementPatterns.add(item));
    normalizeTagArray(unit.primaryMuscles).forEach((item) => current.primaryMuscles.add(item));
  }

  const ranked = Array.from(candidateTrackMap.values()).sort(compareLastProgressionAsc);
  const remaining = [...ranked];
  const selected: string[] = [];
  const usedByDimension = {
    primary_muscle: new Set<string>(),
    movement_pattern: new Set<string>(),
  };

  while (selected.length < normalizedQuota && remaining.length > 0) {
    let selectedIndex = -1;

    for (const dimension of normalizedDimensions) {
      const candidateIndex = remaining.findIndex((item) => {
        const values =
          dimension === "primary_muscle"
            ? Array.from(item.primaryMuscles)
            : Array.from(item.movementPatterns);
        if (values.length === 0) {
          return false;
        }
        return values.some((value) => !usedByDimension[dimension].has(value));
      });

      if (candidateIndex >= 0) {
        selectedIndex = candidateIndex;
        break;
      }
    }

    if (selectedIndex < 0) {
      selectedIndex = 0;
    }

    const [picked] = remaining.splice(selectedIndex, 1);
    if (!picked) {
      break;
    }

    picked.primaryMuscles.forEach((value) => usedByDimension.primary_muscle.add(value));
    picked.movementPatterns.forEach((value) => usedByDimension.movement_pattern.add(value));
    selected.push(picked.trackKey);
  }

  return new Set(selected);
}
