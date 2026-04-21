import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeTrainingUnitSets, TrainingUnitSet } from "@/lib/training-set-standards";

export type ActionEntryAnchorRecord = {
  user_id: string;
  exercise_library_item_id: string;
  exercise_name: string | null;
  recording_mode: string | null;
  load_model: string | null;
  set_count: number | null;
  load_value: number | null;
  additional_load_value: number | null;
  assist_weight: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number | null;
  tempo: [number, number, number, number] | null;
  set_structure: TrainingUnitSet[];
  recommended_rir: number | null;
  logic_signature: string | null;
  source: "ai_confirmed" | "manual_confirmed" | "historical_seed";
  confirmed_at: string;
  last_performed_at: string | null;
  updated_at: string;
};

type UpsertActionEntryAnchorInput = {
  user_id: string;
  exercise_library_item_id: string;
  exercise_name?: string | null;
  recording_mode?: string | null;
  load_model?: string | null;
  set_count?: number | null;
  load_value?: number | null;
  additional_load_value?: number | null;
  assist_weight?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  rest_seconds?: number | null;
  tempo?: [number, number, number, number] | null;
  set_structure?: TrainingUnitSet[] | null;
  recommended_rir?: number | null;
  logic_signature?: string | null;
  source?: ActionEntryAnchorRecord["source"];
  confirmed_at?: string;
  last_performed_at?: string | null;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "action-entry-anchors.json");

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableInt(value: unknown) {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.trunc(parsed);
}

function toTempo(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }
  const normalized = value.map((item) => toNullableInt(item));
  if (normalized.some((item) => item === null || item < 0)) {
    return null;
  }
  return normalized as [number, number, number, number];
}

function normalizeRecord(value: unknown): ActionEntryAnchorRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const userId = toNonEmptyString(record.user_id);
  const exerciseLibraryItemId = toNonEmptyString(record.exercise_library_item_id);
  if (!userId || !exerciseLibraryItemId) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    user_id: userId,
    exercise_library_item_id: exerciseLibraryItemId,
    exercise_name: toNonEmptyString(record.exercise_name),
    recording_mode: toNonEmptyString(record.recording_mode),
    load_model: toNonEmptyString(record.load_model),
    set_count: toNullableInt(record.set_count),
    load_value: toNullableNumber(record.load_value),
    additional_load_value: toNullableNumber(record.additional_load_value),
    assist_weight: toNullableNumber(record.assist_weight),
    reps: toNullableNumber(record.reps),
    duration_seconds: toNullableNumber(record.duration_seconds),
    rest_seconds: toNullableInt(record.rest_seconds),
    tempo: toTempo(record.tempo),
    set_structure: normalizeTrainingUnitSets(record.set_structure),
    recommended_rir: toNullableNumber(record.recommended_rir),
    logic_signature: toNonEmptyString(record.logic_signature),
    source:
      record.source === "manual_confirmed" || record.source === "historical_seed"
        ? record.source
        : "ai_confirmed",
    confirmed_at: toNonEmptyString(record.confirmed_at) ?? now,
    last_performed_at: toNonEmptyString(record.last_performed_at),
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
  if (!raw.trim()) {
    return [] as ActionEntryAnchorRecord[];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [] as ActionEntryAnchorRecord[];
  }
  return parsed
    .map(normalizeRecord)
    .filter((item): item is ActionEntryAnchorRecord => item !== null)
    .sort((a, b) => {
      if (a.user_id !== b.user_id) {
        return a.user_id.localeCompare(b.user_id);
      }
      return a.exercise_library_item_id.localeCompare(b.exercise_library_item_id);
    });
}

async function writeStore(items: ActionEntryAnchorRecord[]) {
  await ensureStoreFile();
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function listActionEntryAnchorsByUser(userId: string) {
  const items = await readStore();
  return items.filter((item) => item.user_id === userId);
}

export async function getActionEntryAnchorByUserAndExercise(
  userId: string,
  exerciseLibraryItemId: string,
) {
  const items = await readStore();
  return (
    items.find(
      (item) =>
        item.user_id === userId && item.exercise_library_item_id === exerciseLibraryItemId,
    ) ?? null
  );
}

export async function upsertActionEntryAnchorByUser(input: UpsertActionEntryAnchorInput) {
  const items = await readStore();
  const now = new Date().toISOString();
  const index = items.findIndex(
    (item) =>
      item.user_id === input.user_id &&
      item.exercise_library_item_id === input.exercise_library_item_id,
  );
  const existing = index >= 0 ? items[index] : null;

  const nextRecord: ActionEntryAnchorRecord = {
    user_id: input.user_id,
    exercise_library_item_id: input.exercise_library_item_id,
    exercise_name: input.exercise_name ?? existing?.exercise_name ?? null,
    recording_mode: input.recording_mode ?? existing?.recording_mode ?? null,
    load_model: input.load_model ?? existing?.load_model ?? null,
    set_count: input.set_count ?? existing?.set_count ?? null,
    load_value: input.load_value ?? existing?.load_value ?? null,
    additional_load_value:
      input.additional_load_value ?? existing?.additional_load_value ?? null,
    assist_weight: input.assist_weight ?? existing?.assist_weight ?? null,
    reps: input.reps ?? existing?.reps ?? null,
    duration_seconds: input.duration_seconds ?? existing?.duration_seconds ?? null,
    rest_seconds: input.rest_seconds ?? existing?.rest_seconds ?? null,
    tempo: input.tempo ?? existing?.tempo ?? null,
    set_structure: input.set_structure ?? existing?.set_structure ?? [],
    recommended_rir: input.recommended_rir ?? existing?.recommended_rir ?? null,
    logic_signature: input.logic_signature ?? existing?.logic_signature ?? null,
    source: input.source ?? existing?.source ?? "ai_confirmed",
    confirmed_at: input.confirmed_at ?? existing?.confirmed_at ?? now,
    last_performed_at: input.last_performed_at ?? existing?.last_performed_at ?? null,
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
