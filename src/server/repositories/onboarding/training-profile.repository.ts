import { promises as fs } from "node:fs";
import path from "node:path";

export type OnboardingTrainingExperienceLevel = "beginner" | "intermediate" | "advanced";
export type OnboardingConfidenceLevel = "low" | "medium" | "high";
export type OnboardingMovementCompetency = "none" | "basic" | "confident";
export type OnboardingReturnState =
  | "no_break"
  | "short_break"
  | "long_break"
  | "rehab_return";
export type OnboardingEquipmentEnvironment =
  | "commercial_gym"
  | "home_gym"
  | "limited"
  | "bodyweight_only";
export type OnboardingPainStatus = "none" | "minor" | "active";

export type OnboardingTrainingProfileRecord = {
  user_id: string;
  experience_level: OnboardingTrainingExperienceLevel;
  suggested_level: OnboardingTrainingExperienceLevel;
  technique_confidence: OnboardingConfidenceLevel;
  progression_literacy: OnboardingConfidenceLevel;
  training_age_months: number | null;
  recent_frequency_per_week: number | null;
  followed_formal_program: boolean | null;
  tracks_load_and_reps: boolean | null;
  understands_rpe_rir: boolean | null;
  weekly_training_days: number | null;
  session_duration_min: number | null;
  detraining_gap_days: number | null;
  return_to_training_state: OnboardingReturnState;
  recovery_confidence: OnboardingConfidenceLevel;
  equipment_environment: OnboardingEquipmentEnvironment;
  current_pain_status: OnboardingPainStatus;
  restricted_regions: string[];
  restricted_movements: string[];
  extra_sports: string[];
  movement_competencies: {
    squat: OnboardingMovementCompetency;
    hip_hinge: OnboardingMovementCompetency;
    horizontal_push: OnboardingMovementCompetency;
    horizontal_pull: OnboardingMovementCompetency;
    vertical_push: OnboardingMovementCompetency;
    vertical_pull: OnboardingMovementCompetency;
  };
  notes: string | null;
  first_completed_at: string;
  updated_at: string;
};

type UpsertOnboardingTrainingProfileInput = {
  user_id: string;
  experience_level: OnboardingTrainingExperienceLevel;
  suggested_level: OnboardingTrainingExperienceLevel;
  technique_confidence: OnboardingConfidenceLevel;
  progression_literacy: OnboardingConfidenceLevel;
  training_age_months?: number | null;
  recent_frequency_per_week?: number | null;
  followed_formal_program?: boolean | null;
  tracks_load_and_reps?: boolean | null;
  understands_rpe_rir?: boolean | null;
  weekly_training_days?: number | null;
  session_duration_min?: number | null;
  detraining_gap_days?: number | null;
  return_to_training_state: OnboardingReturnState;
  recovery_confidence: OnboardingConfidenceLevel;
  equipment_environment: OnboardingEquipmentEnvironment;
  current_pain_status: OnboardingPainStatus;
  restricted_regions?: string[];
  restricted_movements?: string[];
  extra_sports?: string[];
  movement_competencies: OnboardingTrainingProfileRecord["movement_competencies"];
  notes?: string | null;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "onboarding-training-profiles.json");

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableInt(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.trunc(parsed));
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of value) {
    const normalized = toNonEmptyString(item);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(normalized);
  }
  return next;
}

function toConfidence(value: unknown): OnboardingConfidenceLevel {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
}

function toExperienceLevel(value: unknown): OnboardingTrainingExperienceLevel {
  if (value === "beginner" || value === "intermediate" || value === "advanced") {
    return value;
  }
  return "beginner";
}

function toReturnState(value: unknown): OnboardingReturnState {
  if (
    value === "no_break" ||
    value === "short_break" ||
    value === "long_break" ||
    value === "rehab_return"
  ) {
    return value;
  }
  return "no_break";
}

function toEquipmentEnvironment(value: unknown): OnboardingEquipmentEnvironment {
  if (
    value === "commercial_gym" ||
    value === "home_gym" ||
    value === "limited" ||
    value === "bodyweight_only"
  ) {
    return value;
  }
  return "commercial_gym";
}

function toPainStatus(value: unknown): OnboardingPainStatus {
  if (value === "none" || value === "minor" || value === "active") {
    return value;
  }
  return "none";
}

function toCompetency(value: unknown): OnboardingMovementCompetency {
  if (value === "none" || value === "basic" || value === "confident") {
    return value;
  }
  return "none";
}

function normalizeMovementCompetencies(value: unknown) {
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    squat: toCompetency(record.squat),
    hip_hinge: toCompetency(record.hip_hinge),
    horizontal_push: toCompetency(record.horizontal_push),
    horizontal_pull: toCompetency(record.horizontal_pull),
    vertical_push: toCompetency(record.vertical_push),
    vertical_pull: toCompetency(record.vertical_pull),
  };
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  return null;
}

function normalizeRecord(value: unknown): OnboardingTrainingProfileRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const userId = toNonEmptyString(record.user_id);
  if (!userId) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    user_id: userId,
    experience_level: toExperienceLevel(record.experience_level),
    suggested_level: toExperienceLevel(record.suggested_level),
    technique_confidence: toConfidence(record.technique_confidence),
    progression_literacy: toConfidence(record.progression_literacy),
    training_age_months: toNullableInt(record.training_age_months),
    recent_frequency_per_week: toNullableInt(record.recent_frequency_per_week),
    followed_formal_program: normalizeBoolean(record.followed_formal_program),
    tracks_load_and_reps: normalizeBoolean(record.tracks_load_and_reps),
    understands_rpe_rir: normalizeBoolean(record.understands_rpe_rir),
    weekly_training_days: toNullableInt(record.weekly_training_days),
    session_duration_min: toNullableInt(record.session_duration_min),
    detraining_gap_days: toNullableInt(record.detraining_gap_days),
    return_to_training_state: toReturnState(record.return_to_training_state),
    recovery_confidence: toConfidence(record.recovery_confidence),
    equipment_environment: toEquipmentEnvironment(record.equipment_environment),
    current_pain_status: toPainStatus(record.current_pain_status),
    restricted_regions: toStringArray(record.restricted_regions),
    restricted_movements: toStringArray(record.restricted_movements),
    extra_sports: toStringArray(record.extra_sports),
    movement_competencies: normalizeMovementCompetencies(record.movement_competencies),
    notes: toNonEmptyString(record.notes),
    first_completed_at: toNonEmptyString(record.first_completed_at) ?? now,
    updated_at: toNonEmptyString(record.updated_at) ?? now,
  };
}

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, "[]", "utf8");
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [] as OnboardingTrainingProfileRecord[];
  }
  return parsed
    .map(normalizeRecord)
    .filter((item): item is OnboardingTrainingProfileRecord => item !== null);
}

async function writeStore(items: OnboardingTrainingProfileRecord[]) {
  await ensureStoreFile();
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function getOnboardingTrainingProfileByUser(userId: string) {
  const items = await readStore();
  return items.find((item) => item.user_id === userId) ?? null;
}

export async function upsertOnboardingTrainingProfileByUser(
  input: UpsertOnboardingTrainingProfileInput,
) {
  const items = await readStore();
  const now = new Date().toISOString();
  const index = items.findIndex((item) => item.user_id === input.user_id);
  const existing = index >= 0 ? items[index] : null;

  const nextRecord: OnboardingTrainingProfileRecord = {
    user_id: input.user_id,
    experience_level: input.experience_level,
    suggested_level: input.suggested_level,
    technique_confidence: input.technique_confidence,
    progression_literacy: input.progression_literacy,
    training_age_months: input.training_age_months ?? existing?.training_age_months ?? null,
    recent_frequency_per_week:
      input.recent_frequency_per_week ?? existing?.recent_frequency_per_week ?? null,
    followed_formal_program:
      input.followed_formal_program ?? existing?.followed_formal_program ?? null,
    tracks_load_and_reps: input.tracks_load_and_reps ?? existing?.tracks_load_and_reps ?? null,
    understands_rpe_rir: input.understands_rpe_rir ?? existing?.understands_rpe_rir ?? null,
    weekly_training_days: input.weekly_training_days ?? existing?.weekly_training_days ?? null,
    session_duration_min: input.session_duration_min ?? existing?.session_duration_min ?? null,
    detraining_gap_days: input.detraining_gap_days ?? existing?.detraining_gap_days ?? null,
    return_to_training_state: input.return_to_training_state,
    recovery_confidence: input.recovery_confidence,
    equipment_environment: input.equipment_environment,
    current_pain_status: input.current_pain_status,
    restricted_regions: input.restricted_regions ?? existing?.restricted_regions ?? [],
    restricted_movements: input.restricted_movements ?? existing?.restricted_movements ?? [],
    extra_sports: input.extra_sports ?? existing?.extra_sports ?? [],
    movement_competencies: input.movement_competencies,
    notes:
      (typeof input.notes === "string" && input.notes.trim().length > 0
        ? input.notes.trim()
        : input.notes === null
          ? null
          : existing?.notes) ?? null,
    first_completed_at: existing?.first_completed_at ?? now,
    updated_at: now,
  };

  if (index >= 0) {
    items[index] = nextRecord;
  } else {
    items.push(nextRecord);
  }

  await writeStore(items);
  return nextRecord;
}
