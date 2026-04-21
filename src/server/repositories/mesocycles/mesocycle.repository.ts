import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type MesocycleStatus = "active" | "closed";
export type MesocycleStartReason = "manual";
export type MesocycleEndReason =
  | "manual_complete"
  | "fatigue_management"
  | "goal_switch"
  | "injury_or_constraint"
  | "schedule_change"
  | "other";
export type DeloadReason =
  | "recovery_risk"
  | "subjective_fatigue"
  | "planned"
  | "manual"
  | "other";
export type DeloadEventStatus = "active" | "ended";

export type DeloadEventRecord = {
  id: string;
  status: DeloadEventStatus;
  started_at: string;
  ended_at: string | null;
  reason: DeloadReason;
  note: string | null;
};

export type MesocycleRecord = {
  id: string;
  user_id: string;
  name: string;
  status: MesocycleStatus;
  started_at: string;
  ended_at: string | null;
  start_reason: MesocycleStartReason;
  end_reason: MesocycleEndReason | null;
  primary_package_id: string | null;
  primary_package_name: string | null;
  program_id: string | null;
  start_sequence_index: number | null;
  notes: string | null;
  deload_events: DeloadEventRecord[];
  created_at: string;
  updated_at: string;
};

type CreateMesocycleInput = {
  user_id: string;
  name: string;
  started_at?: string;
  primary_package_id?: string | null;
  primary_package_name?: string | null;
  program_id?: string | null;
  start_sequence_index?: number | null;
  notes?: string | null;
};

type UpdateMesocycleInput = Partial<
  Pick<
    MesocycleRecord,
    | "name"
    | "status"
    | "ended_at"
    | "end_reason"
    | "primary_package_id"
    | "primary_package_name"
    | "program_id"
    | "start_sequence_index"
    | "notes"
    | "deload_events"
  >
>;

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "mesocycles.json");

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOptionalString(value: unknown) {
  return toNonEmptyString(value) ?? null;
}

function toNullablePositiveInt(value: unknown) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

function normalizeDeloadReason(value: unknown): DeloadReason {
  if (
    value === "recovery_risk" ||
    value === "subjective_fatigue" ||
    value === "planned" ||
    value === "manual" ||
    value === "other"
  ) {
    return value;
  }
  return "manual";
}

function normalizeDeloadStatus(value: unknown): DeloadEventStatus {
  return value === "ended" ? "ended" : "active";
}

function normalizeEndReason(value: unknown): MesocycleEndReason | null {
  if (
    value === "manual_complete" ||
    value === "fatigue_management" ||
    value === "goal_switch" ||
    value === "injury_or_constraint" ||
    value === "schedule_change" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

function normalizeDeloadEvent(value: unknown): DeloadEventRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = toNonEmptyString(record.id) ?? randomUUID();
  const startedAt = toNonEmptyString(record.started_at);
  if (!startedAt) {
    return null;
  }

  return {
    id,
    status: normalizeDeloadStatus(record.status),
    started_at: startedAt,
    ended_at: toOptionalString(record.ended_at),
    reason: normalizeDeloadReason(record.reason),
    note: toOptionalString(record.note),
  };
}

function normalizeMesocycleRecord(value: unknown): MesocycleRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = toNonEmptyString(record.id);
  const userId = toNonEmptyString(record.user_id);
  const name = toNonEmptyString(record.name);
  const startedAt = toNonEmptyString(record.started_at);

  if (!id || !userId || !name || !startedAt) {
    return null;
  }

  const deloadEvents = Array.isArray(record.deload_events)
    ? record.deload_events
        .map(normalizeDeloadEvent)
        .filter((item): item is DeloadEventRecord => item !== null)
        .sort((a, b) => a.started_at.localeCompare(b.started_at))
    : [];

  return {
    id,
    user_id: userId,
    name,
    status: record.status === "closed" ? "closed" : "active",
    started_at: startedAt,
    ended_at: toOptionalString(record.ended_at),
    start_reason: "manual",
    end_reason: normalizeEndReason(record.end_reason),
    primary_package_id: toOptionalString(record.primary_package_id),
    primary_package_name: toOptionalString(record.primary_package_name),
    program_id: toOptionalString(record.program_id),
    start_sequence_index: toNullablePositiveInt(record.start_sequence_index),
    notes: toOptionalString(record.notes),
    deload_events: deloadEvents,
    created_at: toNonEmptyString(record.created_at) ?? startedAt,
    updated_at: toNonEmptyString(record.updated_at) ?? startedAt,
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
    return [] as MesocycleRecord[];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [] as MesocycleRecord[];
  }
  return parsed
    .map(normalizeMesocycleRecord)
    .filter((item): item is MesocycleRecord => item !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

async function writeStore(items: MesocycleRecord[]) {
  await ensureStoreFile();
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function listMesocyclesByUser(userId: string) {
  const items = await readStore();
  return items.filter((item) => item.user_id === userId);
}

export async function getActiveMesocycleByUser(userId: string) {
  const items = await listMesocyclesByUser(userId);
  return items.find((item) => item.status === "active") ?? null;
}

export async function createMesocycleRecord(data: CreateMesocycleInput) {
  const items = await readStore();
  const now = new Date().toISOString();
  const created: MesocycleRecord = {
    id: randomUUID(),
    user_id: data.user_id,
    name: data.name.trim(),
    status: "active",
    started_at: data.started_at ?? now,
    ended_at: null,
    start_reason: "manual",
    end_reason: null,
    primary_package_id: data.primary_package_id ?? null,
    primary_package_name: data.primary_package_name ?? null,
    program_id: data.program_id ?? null,
    start_sequence_index: data.start_sequence_index ?? null,
    notes: toOptionalString(data.notes),
    deload_events: [],
    created_at: now,
    updated_at: now,
  };
  items.unshift(created);
  await writeStore(items);
  return created;
}

export async function updateMesocycleByIdForUser(
  mesocycleId: string,
  userId: string,
  data: UpdateMesocycleInput,
) {
  const items = await readStore();
  const index = items.findIndex((item) => item.id === mesocycleId && item.user_id === userId);
  if (index === -1) {
    return { count: 0 };
  }

  const current = items[index];
  items[index] = {
    ...current,
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.ended_at !== undefined ? { ended_at: data.ended_at } : {}),
    ...(data.end_reason !== undefined ? { end_reason: data.end_reason } : {}),
    ...(data.primary_package_id !== undefined ? { primary_package_id: data.primary_package_id } : {}),
    ...(data.primary_package_name !== undefined ? { primary_package_name: data.primary_package_name } : {}),
    ...(data.program_id !== undefined ? { program_id: data.program_id } : {}),
    ...(data.start_sequence_index !== undefined ? { start_sequence_index: data.start_sequence_index } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.deload_events !== undefined ? { deload_events: data.deload_events } : {}),
    updated_at: new Date().toISOString(),
  };

  await writeStore(items);
  return { count: 1, mesocycle: items[index] };
}
