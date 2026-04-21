import {
  ACTION_MOVEMENT_FILTER_TO_PATTERNS,
  ACTION_MOVEMENT_FILTER_VALUES,
  ActionMovementFilterValue,
  ActionPrimaryMuscleFilterValue,
  getActionMovementFilterLabel,
  getActionPrimaryMuscleFilterLabel,
  inferActionCapabilities,
} from "@/lib/action-filter-standards";
import { ExerciseSelectionInput, ExerciseSuggestion } from "@/lib/exercise-selection-standards";
import {
  getMovementPatternLabel,
  MovementPatternV1,
  MuscleRegionV1,
} from "@/lib/exercise-library-standards";
import type { ExerciseRecordingModeValue } from "@/lib/recording-mode-standards";
import type { ExerciseLibraryRecord } from "@/server/repositories/exercise-library/exercise-library.repository";

type NormalizedSelectionInput = {
  movementPatterns: MovementPatternV1[] | null;
  movementLabel: string | null;
  primaryMuscle: ActionPrimaryMuscleFilterValue | null;
  primaryMuscleLabel: string | null;
  recordingMode: ExerciseRecordingModeValue | null;
  recordingModeLabel: string | null;
  role: "main" | "secondary" | "accessory" | null;
  requireBodyweight: boolean;
  allowExtraLoad: boolean | undefined;
  allowAssistance: boolean | undefined;
  excludeExerciseIds: Set<string>;
  limit: number;
};

type Candidate = {
  item: ExerciseLibraryRecord;
  score: number;
  reasons: string[];
};

const BASIC_MAIN_PATTERNS = new Set<MovementPatternV1>([
  "squat_knee_dominant",
  "hip_hinge",
  "horizontal_push",
  "horizontal_pull",
  "vertical_push",
  "vertical_pull",
]);

const REGION_TO_PRIMARY_GROUP: Partial<Record<MuscleRegionV1, ActionPrimaryMuscleFilterValue>> = {
  chest: "chest",
  chest_upper: "chest",
  chest_mid_lower: "chest",
  lats: "lats",
  quads: "quads",
  glutes: "glutes",
  hamstrings: "hamstrings",
  delt_front: "delts",
  delt_mid: "delts",
  delt_rear: "delts",
  biceps: "biceps",
  triceps: "triceps",
  core: "core",
  abs: "core",
  obliques: "core",
  erector_spinae: "core",
};

const MOVEMENT_PATTERN_ALIASES: Record<string, ActionMovementFilterValue> = {
  horizontal_push: "horizontal_push",
  水平推: "horizontal_push",
  horizontal_pull: "horizontal_pull",
  水平拉: "horizontal_pull",
  vertical_push: "vertical_push",
  垂直推: "vertical_push",
  vertical_pull: "vertical_pull",
  垂直拉: "vertical_pull",
  squat: "squat",
  蹲类: "squat",
  蹲类膝主导: "squat",
  hip_hinge: "hip_hinge",
  髋主导: "hip_hinge",
  髋铰链: "hip_hinge",
  lunge: "lunge",
  弓步: "lunge",
  split_lunge: "lunge",
  分腿: "lunge",
  core_stability: "core_stability",
  核心稳定: "core_stability",
  rotation: "rotation",
  旋转: "rotation",
  flexion: "flexion",
  屈曲: "flexion",
  躯干屈曲: "flexion",
};

const PRIMARY_MUSCLE_ALIASES: Record<string, ActionPrimaryMuscleFilterValue> = {
  chest: "chest",
  胸肌: "chest",
  胸大肌: "chest",
  lats: "lats",
  背阔肌: "lats",
  quads: "quads",
  股四头肌: "quads",
  glutes: "glutes",
  臀大肌: "glutes",
  hamstrings: "hamstrings",
  腘绳肌: "hamstrings",
  delts: "delts",
  三角肌: "delts",
  biceps: "biceps",
  肱二头肌: "biceps",
  triceps: "triceps",
  肱三头肌: "triceps",
  core: "core",
  核心: "core",
  腹直肌: "core",
  腹斜肌: "core",
};

const RECORDING_MODE_ALIASES: Record<string, ExerciseRecordingModeValue> = {
  strength: "strength",
  reps_only: "reps_only",
  duration_only: "duration_only",
  duration: "duration_only",
  time_only: "duration_only",
  bodyweight_load: "bodyweight_load",
  assisted: "assisted_bodyweight",
  assisted_bodyweight: "assisted_bodyweight",
  intervals: "intervals_conditioning",
  intervals_conditioning: "intervals_conditioning",
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s/_-]+/g, "");
}

function toCanonicalMovement(raw: string | undefined) {
  if (!raw) {
    return null;
  }
  const key = normalizeKey(raw);
  const aliasEntry = Object.entries(MOVEMENT_PATTERN_ALIASES).find(
    ([alias]) => normalizeKey(alias) === key,
  );
  const movementValue = aliasEntry?.[1] ?? null;
  if (!movementValue || !(ACTION_MOVEMENT_FILTER_VALUES as readonly string[]).includes(movementValue)) {
    return null;
  }
  return {
    movementPatterns: ACTION_MOVEMENT_FILTER_TO_PATTERNS[movementValue],
    movementLabel: getActionMovementFilterLabel(movementValue),
  };
}

function toCanonicalPrimaryMuscle(raw: string | undefined) {
  if (!raw) {
    return null;
  }
  const key = normalizeKey(raw);
  const aliasEntry = Object.entries(PRIMARY_MUSCLE_ALIASES).find(
    ([alias]) => normalizeKey(alias) === key,
  );
  const value = aliasEntry?.[1] ?? null;
  if (!value) {
    return null;
  }
  return {
    primaryMuscle: value,
    primaryMuscleLabel: getActionPrimaryMuscleFilterLabel(value),
  };
}

function toCanonicalRecordingMode(raw: string | undefined) {
  if (!raw) {
    return null;
  }
  const key = normalizeKey(raw);
  const aliasEntry = Object.entries(RECORDING_MODE_ALIASES).find(
    ([alias]) => normalizeKey(alias) === key,
  );
  const value = aliasEntry?.[1] ?? null;
  if (!value) {
    return null;
  }

  const labelMap: Record<ExerciseRecordingModeValue, string> = {
    strength: "strength",
    reps_only: "reps_only",
    duration_only: "duration_only",
    bodyweight_load: "bodyweight_load",
    assisted_bodyweight: "assisted",
    intervals_conditioning: "intervals",
  };

  return {
    recordingMode: value,
    recordingModeLabel: labelMap[value],
  };
}

function toPrimaryGroups(item: ExerciseLibraryRecord) {
  const groups: ActionPrimaryMuscleFilterValue[] = [];
  for (const region of item.primary_regions) {
    const group = REGION_TO_PRIMARY_GROUP[region];
    if (!group || groups.includes(group)) {
      continue;
    }
    groups.push(group);
  }
  return groups;
}

function toEquipmentBucket(item: ExerciseLibraryRecord) {
  if (item.tags.includes("barbell")) return "barbell";
  if (item.tags.includes("dumbbell")) return "dumbbell";
  if (item.tags.includes("machine")) return "machine";
  if (item.tags.includes("cable")) return "cable";
  if (item.tags.includes("bodyweight")) return "bodyweight";
  return "other";
}

function normalizeInput(input: ExerciseSelectionInput): NormalizedSelectionInput | null {
  const movement = toCanonicalMovement(input.movement_pattern);
  const primary = toCanonicalPrimaryMuscle(input.primary_muscle);
  const recording = toCanonicalRecordingMode(input.recording_mode);
  const role = input.role ?? null;
  const excludeExerciseIds = new Set(input.exclude_exercise_ids ?? []);

  if (input.movement_pattern && !movement) {
    return null;
  }
  if (input.primary_muscle && !primary) {
    return null;
  }
  if (input.recording_mode && !recording) {
    return null;
  }

  return {
    movementPatterns: movement?.movementPatterns ?? null,
    movementLabel: movement?.movementLabel ?? null,
    primaryMuscle: primary?.primaryMuscle ?? null,
    primaryMuscleLabel: primary?.primaryMuscleLabel ?? null,
    recordingMode: recording?.recordingMode ?? null,
    recordingModeLabel: recording?.recordingModeLabel ?? null,
    role,
    requireBodyweight: input.require_bodyweight === true,
    allowExtraLoad: input.allow_extra_load,
    allowAssistance: input.allow_assistance,
    excludeExerciseIds,
    limit: Math.min(Math.max(Math.trunc(input.limit ?? 8), 1), 20),
  };
}

function roleScore(item: ExerciseLibraryRecord, role: "main" | "secondary" | "accessory") {
  const isCompound = item.category === "compound";
  const isIsolation = item.category === "isolation";
  const hasMachine = item.tags.includes("machine");
  const hasCable = item.tags.includes("cable");
  const hasBarbell = item.tags.includes("barbell");

  if (role === "main") {
    let score = 0;
    const reasons: string[] = [];
    if (isCompound) {
      score += 60;
      reasons.push("适合作为主项");
    }
    if (BASIC_MAIN_PATTERNS.has(item.movement_pattern)) {
      score += 24;
      reasons.push("基础动作模式");
    }
    if (hasBarbell) {
      score += 8;
    }
    if (hasMachine || hasCable) {
      score -= 8;
    }
    return { score, reasons };
  }

  if (role === "secondary") {
    let score = 0;
    const reasons: string[] = [];
    if (isCompound) {
      score += 35;
      reasons.push("适合作为次主项");
    }
    if (hasMachine || hasCable) {
      score += 20;
      reasons.push("器械执行友好");
    }
    return { score, reasons };
  }

  let score = 0;
  const reasons: string[] = [];
  if (isIsolation) {
    score += 45;
    reasons.push("适合作为辅助");
  }
  if (hasMachine || hasCable) {
    score += 22;
    reasons.push("动作简单稳定");
  }
  if (item.movement_pattern === "upper_isolation" || item.movement_pattern === "lower_isolation") {
    score += 10;
  }
  if (isCompound) {
    score -= 6;
  }
  return { score, reasons };
}

function buildCandidates(
  items: ExerciseLibraryRecord[],
  input: NormalizedSelectionInput,
) {
  const candidates: Candidate[] = [];

  for (const item of items) {
    if (!item.enabled) {
      continue;
    }
    if (input.excludeExerciseIds.has(item.id)) {
      continue;
    }

    const capabilities = inferActionCapabilities({
      notes: item.notes,
      tags: item.tags,
      defaultLoadModel: item.default_load_model,
    });
    const primaryGroups = toPrimaryGroups(item);

    if (
      input.movementPatterns &&
      !input.movementPatterns.includes(item.movement_pattern)
    ) {
      continue;
    }
    if (
      input.primaryMuscle &&
      !primaryGroups.some((group) => group === input.primaryMuscle)
    ) {
      continue;
    }
    if (input.recordingMode && item.recording_mode !== input.recordingMode) {
      continue;
    }
    if (input.requireBodyweight && !capabilities.isBodyweight) {
      continue;
    }
    if (
      typeof input.allowExtraLoad === "boolean" &&
      capabilities.allowExtraLoad !== input.allowExtraLoad
    ) {
      continue;
    }
    if (
      typeof input.allowAssistance === "boolean" &&
      capabilities.allowAssistance !== input.allowAssistance
    ) {
      continue;
    }

    let score = 0;
    const reasons: string[] = [];

    if (input.movementPatterns && input.movementLabel) {
      score += 1000;
      reasons.push(`匹配动作模式：${input.movementLabel}`);
    }
    if (input.primaryMuscle && input.primaryMuscleLabel) {
      score += 700;
      reasons.push(`匹配主肌群：${input.primaryMuscleLabel}`);
    }
    if (input.recordingMode && input.recordingModeLabel) {
      score += 400;
      reasons.push(`匹配记录模式：${input.recordingModeLabel}`);
    }
    if (input.role) {
      const roleMatched = roleScore(item, input.role);
      score += roleMatched.score;
      reasons.push(...roleMatched.reasons);
    }
    if (input.requireBodyweight && capabilities.isBodyweight) {
      score += 120;
      reasons.push("自重动作");
    }
    if (input.allowExtraLoad === true && capabilities.allowExtraLoad) {
      score += 100;
      reasons.push("支持附重");
    }
    if (input.allowAssistance === true && capabilities.allowAssistance) {
      score += 100;
      reasons.push("支持辅助");
    }
    if (reasons.length === 0) {
      reasons.push(`匹配动作模式：${getMovementPatternLabel(item.movement_pattern)}`);
    }

    candidates.push({
      item,
      score,
      reasons: [...new Set(reasons)].slice(0, 5),
    });
  }

  return candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.item.name.localeCompare(b.item.name, "zh-CN");
  });
}

function applyDiversity(candidates: Candidate[], limit: number) {
  const selected: Candidate[] = [];
  const deferred: Candidate[] = [];
  const seenSimilarity = new Set<string>();

  for (const candidate of candidates) {
    if (selected.length >= limit) {
      break;
    }

    const primaryGroup = toPrimaryGroups(candidate.item)[0] ?? "generic";
    const equipment = toEquipmentBucket(candidate.item);
    const similarityKey = `${candidate.item.movement_pattern}:${primaryGroup}:${equipment}`;

    if (seenSimilarity.has(similarityKey)) {
      deferred.push(candidate);
      continue;
    }

    seenSimilarity.add(similarityKey);
    selected.push(candidate);
  }

  if (selected.length < limit) {
    for (const candidate of deferred) {
      if (selected.length >= limit) {
        break;
      }
      selected.push(candidate);
    }
  }

  return selected;
}

export function suggestExercisesByRules(params: {
  items: ExerciseLibraryRecord[];
  input: ExerciseSelectionInput;
}): ExerciseSuggestion[] {
  const normalized = normalizeInput(params.input);
  if (!normalized) {
    return [];
  }

  const candidates = buildCandidates(params.items, normalized);
  const diversified = applyDiversity(candidates, normalized.limit);

  return diversified.map((candidate) => ({
    exercise_id: candidate.item.id,
    name: candidate.item.name,
    score: candidate.score,
    reasons: candidate.reasons,
  }));
}
