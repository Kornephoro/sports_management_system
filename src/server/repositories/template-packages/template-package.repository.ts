import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_VALUES,
  AdjustmentPolicyTypeValue,
  ProgressionFamilyValue,
  ProgressionPolicyTypeValue,
  UnitRoleValue,
} from "@/lib/progression-standards";
import {
  TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES,
  TemplatePackageSplitType,
} from "@/lib/template-package-standards";

export type TemplatePackageUnitOverrideRecord = {
  unit_sequence_no: number;
  unit_role?: UnitRoleValue;
  progression_family?: ProgressionFamilyValue;
  progression_policy_type?: ProgressionPolicyTypeValue | string;
  progression_policy_config?: Record<string, unknown>;
  adjustment_policy_type?: AdjustmentPolicyTypeValue;
  adjustment_policy_config?: Record<string, unknown>;
  success_criteria?: Record<string, unknown>;
  progress_track_key?: string;
};

export type TemplatePackageDayRecord = {
  id: string;
  day_code: string;
  sequence_in_microcycle: number;
  template_library_item_id: string;
  label: string | null;
  notes: string | null;
  progression_overrides: TemplatePackageUnitOverrideRecord[];
};

export type TemplatePackageSlotRecord = {
  slot_index: number;
  type: "train" | "rest";
  day_code: string | null;
  label: string | null;
};

export type TemplatePackageRecord = {
  id: string;
  user_id: string;
  name: string;
  split_type: TemplatePackageSplitType;
  enabled: boolean;
  notes: string | null;
  linked_program_id: string | null;
  last_used_at: string | null;
  days: TemplatePackageDayRecord[];
  microcycle_slots: TemplatePackageSlotRecord[];
  created_at: string;
  updated_at: string;
};

export type TemplatePackageListItem = TemplatePackageRecord & {
  day_count: number;
};

type ListTemplatePackagesOptions = {
  query?: string;
  enabled?: boolean;
};

type TemplatePackageInputDay = {
  id?: string;
  day_code: string;
  sequence_in_microcycle: number;
  template_library_item_id: string;
  label?: string | null;
  notes?: string | null;
  progression_overrides?: unknown[];
};

type TemplatePackageInputSlot = {
  slot_index?: number;
  type: "train" | "rest" | string;
  day_code?: string | null;
  label?: string | null;
};

type CreateTemplatePackageRecordInput = {
  user_id: string;
  name: string;
  split_type: TemplatePackageSplitType | string;
  enabled: boolean;
  notes?: string | null;
  linked_program_id?: string | null;
  days: TemplatePackageInputDay[];
  microcycle_slots?: TemplatePackageInputSlot[];
  last_used_at?: string | null;
};

type UpdateTemplatePackageRecordInput = {
  name?: string;
  split_type?: TemplatePackageSplitType | string;
  enabled?: boolean;
  notes?: string | null;
  linked_program_id?: string | null;
  days?: TemplatePackageInputDay[];
  microcycle_slots?: TemplatePackageInputSlot[];
  last_used_at?: string | null;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "template-packages.json");

const VALID_SPLIT_TYPE_SET = new Set<string>(TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES);

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toOptionalString(value: unknown) {
  return toNonEmptyString(value) ?? null;
}

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function asRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizePolicyType(value: unknown) {
  if (
    typeof value === "string" &&
    (PROGRESSION_POLICY_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    return value as ProgressionPolicyTypeValue;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function normalizeUnitOverride(value: unknown): TemplatePackageUnitOverrideRecord | null {
  const record = asRecord(value);
  const unitSequenceNo = toPositiveInt(record.unit_sequence_no, 0);
  if (unitSequenceNo <= 0) {
    return null;
  }

  const unitRole =
    typeof record.unit_role === "string" &&
    (UNIT_ROLE_VALUES as readonly string[]).includes(record.unit_role)
      ? (record.unit_role as UnitRoleValue)
      : undefined;
  const progressionFamily =
    typeof record.progression_family === "string" &&
    (PROGRESSION_FAMILY_VALUES as readonly string[]).includes(record.progression_family)
      ? (record.progression_family as ProgressionFamilyValue)
      : undefined;
  const progressionPolicyType = normalizePolicyType(record.progression_policy_type);
  const adjustmentPolicyType =
    typeof record.adjustment_policy_type === "string" &&
    (ADJUSTMENT_POLICY_TYPE_VALUES as readonly string[]).includes(record.adjustment_policy_type)
      ? (record.adjustment_policy_type as AdjustmentPolicyTypeValue)
      : undefined;

  const progressionPolicyConfig = asRecord(record.progression_policy_config);
  const adjustmentPolicyConfig = asRecord(record.adjustment_policy_config);
  const successCriteria = asRecord(record.success_criteria);

  const normalized: TemplatePackageUnitOverrideRecord = {
    unit_sequence_no: unitSequenceNo,
  };

  if (unitRole) normalized.unit_role = unitRole;
  if (progressionFamily) normalized.progression_family = progressionFamily;
  if (progressionPolicyType) normalized.progression_policy_type = progressionPolicyType;
  if (adjustmentPolicyType) normalized.adjustment_policy_type = adjustmentPolicyType;
  if (Object.keys(progressionPolicyConfig).length > 0) {
    normalized.progression_policy_config = progressionPolicyConfig;
  }
  if (Object.keys(adjustmentPolicyConfig).length > 0) {
    normalized.adjustment_policy_config = adjustmentPolicyConfig;
  }
  if (Object.keys(successCriteria).length > 0) {
    normalized.success_criteria = successCriteria;
  }
  const progressTrackKey = toNonEmptyString(record.progress_track_key);
  if (progressTrackKey) {
    normalized.progress_track_key = progressTrackKey;
  }

  return normalized;
}

function normalizeDayRecord(value: unknown): TemplatePackageDayRecord | null {
  const record = asRecord(value);
  const id = toNonEmptyString(record.id) ?? randomUUID();
  const dayCode = toNonEmptyString(record.day_code);
  const templateLibraryItemId = toNonEmptyString(record.template_library_item_id);
  const sequenceInMicrocycle = toPositiveInt(record.sequence_in_microcycle, 1);
  if (!dayCode || !templateLibraryItemId) {
    return null;
  }

  const overrides = Array.isArray(record.progression_overrides)
    ? record.progression_overrides
        .map(normalizeUnitOverride)
        .filter((item): item is TemplatePackageUnitOverrideRecord => item !== null)
        .sort((a, b) => a.unit_sequence_no - b.unit_sequence_no)
    : [];

  return {
    id,
    day_code: dayCode.toUpperCase(),
    sequence_in_microcycle: sequenceInMicrocycle,
    template_library_item_id: templateLibraryItemId,
    label: toOptionalString(record.label),
    notes: toOptionalString(record.notes),
    progression_overrides: overrides,
  };
}

function normalizeSlotRecord(value: unknown): TemplatePackageSlotRecord | null {
  const record = asRecord(value);
  const slotIndex = toPositiveInt(record.slot_index, 0);
  if (slotIndex <= 0) {
    return null;
  }

  const typeRaw = toNonEmptyString(record.type)?.toLowerCase();
  const type: "train" | "rest" =
    typeRaw === "train" || typeRaw === "rest" ? typeRaw : "train";
  const dayCodeRaw = toNonEmptyString(record.day_code)?.toUpperCase() ?? null;

  if (type === "train" && !dayCodeRaw) {
    return null;
  }
  if (type === "rest" && dayCodeRaw) {
    return null;
  }

  return {
    slot_index: slotIndex,
    type,
    day_code: dayCodeRaw,
    label: toOptionalString(record.label),
  };
}

function normalizeDays(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as TemplatePackageDayRecord[];
  }

  return value
    .map(normalizeDayRecord)
    .filter((item): item is TemplatePackageDayRecord => item !== null)
    .sort((a, b) => a.sequence_in_microcycle - b.sequence_in_microcycle)
    .map((item, index) => ({
      ...item,
      sequence_in_microcycle: index + 1,
      day_code: item.day_code || String.fromCharCode(65 + index),
    }));
}

function buildDefaultSlotsFromDays(days: TemplatePackageDayRecord[]) {
  if (days.length === 0) {
    return [] as TemplatePackageSlotRecord[];
  }
  return days.map((day, index) => ({
    slot_index: index + 1,
    type: "train" as const,
    day_code: day.day_code,
    label: day.label,
  }));
}

function normalizeMicrocycleSlots(
  value: unknown,
  days: TemplatePackageDayRecord[],
): TemplatePackageSlotRecord[] {
  const allowedDayCodes = new Set(days.map((day) => day.day_code.toUpperCase()));
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .map(normalizeSlotRecord)
    .filter((item): item is TemplatePackageSlotRecord => item !== null)
    .sort((a, b) => a.slot_index - b.slot_index)
    .map((slot, index) => ({
      ...slot,
      slot_index: index + 1,
      day_code: slot.type === "train" ? slot.day_code?.toUpperCase() ?? null : null,
    }))
    .filter((slot) => {
      if (slot.type === "rest") {
        return true;
      }
      return slot.day_code !== null && allowedDayCodes.has(slot.day_code);
    });

  const hasTrainSlot = normalized.some((slot) => slot.type === "train");
  if (!hasTrainSlot) {
    return buildDefaultSlotsFromDays(days);
  }

  return normalized;
}

function normalizeTemplatePackageRecord(value: unknown): TemplatePackageRecord | null {
  const record = asRecord(value);
  const id = toNonEmptyString(record.id);
  const userId = toNonEmptyString(record.user_id);
  const name = toNonEmptyString(record.name);
  if (!id || !userId || !name) {
    return null;
  }

  const splitTypeRaw = toNonEmptyString(record.split_type) ?? "custom";
  const splitType = VALID_SPLIT_TYPE_SET.has(splitTypeRaw)
    ? (splitTypeRaw as TemplatePackageSplitType)
    : "custom";

  const normalizedDays = normalizeDays(record.days);
  const normalizedSlots = normalizeMicrocycleSlots(record.microcycle_slots, normalizedDays);

  return {
    id,
    user_id: userId,
    name,
    split_type: splitType,
    enabled: record.enabled !== false,
    notes: toOptionalString(record.notes),
    linked_program_id: toOptionalString(record.linked_program_id),
    last_used_at: toOptionalString(record.last_used_at),
    days: normalizedDays,
    microcycle_slots: normalizedSlots,
    created_at: toNonEmptyString(record.created_at) ?? new Date().toISOString(),
    updated_at: toNonEmptyString(record.updated_at) ?? new Date().toISOString(),
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
    return [] as TemplatePackageRecord[];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [] as TemplatePackageRecord[];
  }
  return parsed
    .map(normalizeTemplatePackageRecord)
    .filter((item): item is TemplatePackageRecord => item !== null);
}

async function writeStore(items: TemplatePackageRecord[]) {
  await ensureStoreFile();
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), "utf8");
}

function sortTemplatePackages(items: TemplatePackageRecord[]) {
  return [...items].sort((a, b) => {
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    if (a.last_used_at && b.last_used_at && a.last_used_at !== b.last_used_at) {
      return b.last_used_at.localeCompare(a.last_used_at);
    }
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export async function listTemplatePackagesByUser(
  userId: string,
  options: ListTemplatePackagesOptions = {},
) {
  const query = options.query?.trim().toLowerCase() ?? "";
  const items = await readStore();
  const filtered = items.filter((item) => {
    if (item.user_id !== userId) {
      return false;
    }
    if (typeof options.enabled === "boolean" && item.enabled !== options.enabled) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(query) ||
      item.split_type.toLowerCase().includes(query) ||
      item.days.some((day) => day.day_code.toLowerCase().includes(query))
    );
  });

  return sortTemplatePackages(filtered).map((item) => ({
    ...item,
    day_count: item.days.length,
  })) as TemplatePackageListItem[];
}

export async function getTemplatePackageByIdForUser(packageId: string, userId: string) {
  const items = await readStore();
  return items.find((item) => item.id === packageId && item.user_id === userId) ?? null;
}

export async function createTemplatePackage(data: CreateTemplatePackageRecordInput) {
  const items = await readStore();
  const now = new Date().toISOString();
  const splitType = VALID_SPLIT_TYPE_SET.has(data.split_type)
    ? (data.split_type as TemplatePackageSplitType)
    : "custom";
  const created: TemplatePackageRecord = {
    ...data,
    id: randomUUID(),
    split_type: splitType,
    name: data.name.trim(),
    notes: toOptionalString(data.notes),
    linked_program_id: toOptionalString(data.linked_program_id),
    days: normalizeDays(data.days),
    last_used_at: data.last_used_at ?? null,
    microcycle_slots: [],
    created_at: now,
    updated_at: now,
  };
  created.microcycle_slots = normalizeMicrocycleSlots(
    data.microcycle_slots,
    created.days,
  );

  items.push(created);
  await writeStore(items);
  return created;
}

export async function updateTemplatePackageById(
  packageId: string,
  userId: string,
  data: UpdateTemplatePackageRecordInput,
) {
  const items = await readStore();
  const index = items.findIndex((item) => item.id === packageId && item.user_id === userId);
  if (index === -1) {
    return { count: 0 };
  }

  const current = items[index];
  const nextSplitType =
    data.split_type !== undefined
      ? VALID_SPLIT_TYPE_SET.has(data.split_type)
        ? (data.split_type as TemplatePackageSplitType)
        : current.split_type
      : current.split_type;
  const nextDays = data.days !== undefined ? normalizeDays(data.days) : current.days;
  const nextSlots = normalizeMicrocycleSlots(
    data.microcycle_slots !== undefined ? data.microcycle_slots : current.microcycle_slots,
    nextDays,
  );
  items[index] = {
    ...current,
    ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
    ...(data.last_used_at !== undefined ? { last_used_at: data.last_used_at } : {}),
    split_type: nextSplitType,
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(data.notes !== undefined ? { notes: toOptionalString(data.notes) } : {}),
    ...(data.linked_program_id !== undefined
      ? { linked_program_id: toOptionalString(data.linked_program_id) }
      : {}),
    days: nextDays,
    microcycle_slots: nextSlots,
    updated_at: new Date().toISOString(),
  };

  await writeStore(items);
  return { count: 1 };
}

export async function deleteTemplatePackageById(packageId: string, userId: string) {
  const items = await readStore();
  const next = items.filter((item) => !(item.id === packageId && item.user_id === userId));
  if (next.length === items.length) {
    return { count: 0 };
  }
  await writeStore(next);
  return { count: 1 };
}

export async function setTemplatePackageLastUsedAt(packageId: string, userId: string, usedAt: string) {
  const items = await readStore();
  const index = items.findIndex((item) => item.id === packageId && item.user_id === userId);
  if (index === -1) {
    return { count: 0 };
  }

  const current = items[index];
  items[index] = {
    ...current,
    last_used_at: usedAt,
    updated_at: new Date().toISOString(),
  };
  await writeStore(items);
  return { count: 1 };
}
