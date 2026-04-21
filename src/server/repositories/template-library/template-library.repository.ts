import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { RECORDING_MODE_VALUES, RecordingModeValue } from "@/lib/recording-mode-standards";
import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_DEFAULT_POLICY_MAP,
  UNIT_ROLE_VALUES,
  AdjustmentPolicyTypeValue,
  ProgressionFamilyValue,
  ProgressionPolicyTypeValue,
  UnitRoleValue,
} from "@/lib/progression-standards";
import {
  buildTrainingSetsFromLegacyDefaults,
  deriveLegacyDefaultsFromTrainingSets,
  normalizeTrainingUnitSets,
  TrainingUnitSet,
} from "@/lib/training-set-standards";
import {
  countLogicalTemplateSlots,
  isSupersetSelectionMode,
  normalizeSupersetProgressionBudget,
  SupersetGroupValue,
} from "@/lib/template-library-superset";
import { listTemplatePackagesByUser } from "@/server/repositories/template-packages/template-package.repository";

export type TemplateLibraryUnitSupersetGroupRecord = {
  group_id: string;
  group_name: string | null;
  order_index: number;
  total_units: number;
  between_exercises_rest_seconds: number | null;
  between_rounds_rest_seconds: number | null;
  progression_budget_per_exposure: number;
  selection_mode: "auto_rotation" | "fixed_order" | "manual";
};

export type TemplateLibraryUnitRecord = {
  exercise_library_item_id: string;
  exercise_name_snapshot: string;
  sequence_no: number;
  unit_role: UnitRoleValue;
  progress_track_key: string;
  progression_family: ProgressionFamilyValue;
  progression_policy_type: ProgressionPolicyTypeValue | string;
  progression_policy_config: Record<string, unknown>;
  adjustment_policy_type: AdjustmentPolicyTypeValue;
  adjustment_policy_config: Record<string, unknown>;
  success_criteria: Record<string, unknown>;
  recording_mode?: RecordingModeValue | null;
  record_mode: "sets_reps" | "sets_time";
  load_model: "external" | "bodyweight_plus_external";
  default_sets: number;
  default_reps: number | null;
  default_duration_seconds: number | null;
  default_load_value: number | null;
  default_load_unit: "kg" | "lbs" | null;
  default_additional_load_value: number | null;
  default_additional_load_unit: "kg" | "lbs" | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rpe_min: number | null;
  rpe_max: number | null;
  sets: TrainingUnitSet[];
  notes: string | null;
  required: boolean;
  superset_group?: TemplateLibraryUnitSupersetGroupRecord | null;
};

export type TemplateLibraryRecord = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  split_type: string;
  folder_key: string | null;
  aliases: string[];
  enabled: boolean;
  notes: string | null;
  last_used_at: string | null;
  units: TemplateLibraryUnitRecord[];
  created_at: string;
  updated_at: string;
};

export type TemplateLibraryListItem = TemplateLibraryRecord & {
  unit_count: number;
  reference_program_count: number;
};

export type TemplateLibraryTemplateReference = {
  unit_template_id: string;
  unit_name: string;
  session_template_id: string;
  session_template_name: string;
  block_id: string;
  block_name: string;
  program_id: string;
  program_name: string;
  updated_at: string;
};

export type TemplateLibraryPlannedReference = {
  planned_session_id: string;
  session_date: string;
  sequence_index: number;
  status: string;
  program_id: string;
  program_name: string;
};

export type TemplateLibraryPackageReference = {
  package_id: string;
  package_name: string;
  day_code: string;
  day_label: string | null;
  updated_at: string;
};

export type TemplateLibraryDetailAggregate = {
  summary: {
    total_template_references: number;
    total_program_references: number;
    total_planned_references: number;
    total_package_references: number;
    latest_used_at: string | null;
  };
  references: {
    templates: TemplateLibraryTemplateReference[];
    planned: TemplateLibraryPlannedReference[];
    packages: TemplateLibraryPackageReference[];
  };
  governance: {
    duplicate_candidates: Array<{ id: string; name: string }>;
  };
};

type ListTemplateLibraryItemsOptions = {
  query?: string;
  enabled?: boolean;
  splitType?: string;
  folderKey?: string | null;
};

type CreateTemplateLibraryRecordInput = Omit<
  TemplateLibraryRecord,
  "id" | "created_at" | "updated_at" | "last_used_at"
> & {
  last_used_at?: string | null;
};

type UpdateTemplateLibraryRecordInput = Partial<
  Omit<TemplateLibraryRecord, "id" | "user_id" | "created_at" | "updated_at">
>;

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "template-library.json");
const VALID_RECORDING_MODE_SET = new Set<string>(RECORDING_MODE_VALUES);

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of value) {
    const normalized = toNonEmptyString(raw);
    if (!normalized) {
      continue;
    }
    const lower = normalized.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    items.push(normalized);
  }
  return items;
}

function toOptionalString(value: unknown) {
  const normalized = toNonEmptyString(value);
  return normalized ?? null;
}

function normalizeTrackKey(value: unknown, fallbackName: string, sequenceNo: number) {
  const direct = toNonEmptyString(value);
  if (direct) {
    return direct;
  }
  const slug = fallbackName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "template_unit"}_${sequenceNo}`;
}

function normalizeUnitRole(value: unknown): UnitRoleValue {
  if (typeof value === "string" && (UNIT_ROLE_VALUES as readonly string[]).includes(value)) {
    return value as UnitRoleValue;
  }
  return "accessory";
}

function normalizeFamily(value: unknown, fallback: ProgressionFamilyValue) {
  if (
    typeof value === "string" &&
    (PROGRESSION_FAMILY_VALUES as readonly string[]).includes(value)
  ) {
    return value as ProgressionFamilyValue;
  }
  return fallback;
}

function normalizePolicyType(value: unknown, fallback: ProgressionPolicyTypeValue) {
  if (
    typeof value === "string" &&
    (PROGRESSION_POLICY_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    return value as ProgressionPolicyTypeValue;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function normalizeAdjustmentPolicy(value: unknown): AdjustmentPolicyTypeValue {
  if (
    typeof value === "string" &&
    (ADJUSTMENT_POLICY_TYPE_VALUES as readonly string[]).includes(value)
  ) {
    return value as AdjustmentPolicyTypeValue;
  }
  return "always";
}

function normalizeJsonObject(value: unknown, fallback: Record<string, unknown>) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fallback;
}

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function toOptionalPositiveNumber(value: unknown) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return null;
}

function normalizeSupersetGroup(
  value: unknown,
): TemplateLibraryUnitSupersetGroupRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const groupId = toNonEmptyString(row.group_id ?? row.groupId);
  if (!groupId) {
    return null;
  }

  const selectionModeRaw = row.selection_mode ?? row.selectionMode;
  const selectionMode = isSupersetSelectionMode(selectionModeRaw)
    ? selectionModeRaw
    : "auto_rotation";

  return {
    group_id: groupId,
    group_name: toOptionalString(row.group_name ?? row.groupName),
    order_index: toPositiveInt(row.order_index ?? row.orderIndex, 1),
    total_units: toPositiveInt(row.total_units ?? row.totalUnits, 2),
    between_exercises_rest_seconds: toOptionalPositiveNumber(
      row.between_exercises_rest_seconds ?? row.betweenExercisesRestSeconds,
    ),
    between_rounds_rest_seconds: toOptionalPositiveNumber(
      row.between_rounds_rest_seconds ?? row.betweenRoundsRestSeconds,
    ),
    progression_budget_per_exposure: normalizeSupersetProgressionBudget(
      row.progression_budget_per_exposure ?? row.progressionBudgetPerExposure,
      1,
    ),
    selection_mode: selectionMode,
  };
}

function normalizeTemplateUnit(value: unknown): TemplateLibraryUnitRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const exerciseLibraryItemId = toNonEmptyString(row.exercise_library_item_id);
  const exerciseNameSnapshot = toNonEmptyString(row.exercise_name_snapshot);
  if (!exerciseLibraryItemId || !exerciseNameSnapshot) {
    return null;
  }

  const recordMode = row.record_mode === "sets_time" ? "sets_time" : "sets_reps";
  const loadModel =
    row.load_model === "bodyweight_plus_external" ? "bodyweight_plus_external" : "external";
  const sequenceNo = toPositiveInt(row.sequence_no, 1);
  const recordingModeRaw = toNonEmptyString(row.recording_mode);
  const recordingMode =
    recordingModeRaw && VALID_RECORDING_MODE_SET.has(recordingModeRaw)
      ? (recordingModeRaw as RecordingModeValue)
      : null;
  const legacyDefaultSets = toPositiveInt(row.default_sets, 3);
  const legacyDefaultReps = recordMode === "sets_reps" ? toPositiveInt(row.default_reps, 8) : null;
  const legacyDefaultDurationSeconds =
    recordMode === "sets_time" ? toPositiveInt(row.default_duration_seconds, 60) : null;
  const legacyDefaultLoadValue = toOptionalPositiveNumber(row.default_load_value);
  const legacyDefaultAdditionalLoadValue = toOptionalPositiveNumber(row.default_additional_load_value);
  const normalizedSets = normalizeTrainingUnitSets(row.sets);
  const sets =
    normalizedSets.length > 0
      ? normalizedSets
      : buildTrainingSetsFromLegacyDefaults({
          defaultSets: legacyDefaultSets,
          defaultReps: legacyDefaultReps,
          defaultDurationSeconds: legacyDefaultDurationSeconds,
          defaultLoadValue: legacyDefaultLoadValue,
          defaultAdditionalLoadValue: legacyDefaultAdditionalLoadValue,
          loadModel,
          recordMode,
        });
  const legacyFromSets = deriveLegacyDefaultsFromTrainingSets(sets, {
    loadModel,
    recordMode,
  });
  const unitRole = normalizeUnitRole(row.unit_role);
  const defaultProgression = UNIT_ROLE_DEFAULT_POLICY_MAP[unitRole];

  return {
    exercise_library_item_id: exerciseLibraryItemId,
    exercise_name_snapshot: exerciseNameSnapshot,
    sequence_no: sequenceNo,
    unit_role: unitRole,
    progress_track_key: normalizeTrackKey(row.progress_track_key, exerciseNameSnapshot, sequenceNo),
    progression_family: normalizeFamily(row.progression_family, defaultProgression.family),
    progression_policy_type: normalizePolicyType(
      row.progression_policy_type,
      defaultProgression.policyType,
    ),
    progression_policy_config: normalizeJsonObject(
      row.progression_policy_config,
      defaultProgression.config,
    ),
    adjustment_policy_type: normalizeAdjustmentPolicy(row.adjustment_policy_type),
    adjustment_policy_config: normalizeJsonObject(row.adjustment_policy_config, {}),
    success_criteria: normalizeJsonObject(
      row.success_criteria,
      defaultProgression.successCriteria,
    ),
    recording_mode: recordingMode,
    record_mode: recordMode,
    load_model: loadModel,
    default_sets: legacyFromSets?.defaultSets ?? legacyDefaultSets,
    default_reps: recordMode === "sets_reps" ? (legacyFromSets?.defaultReps ?? legacyDefaultReps) : null,
    default_duration_seconds:
      recordMode === "sets_time"
        ? (legacyFromSets?.defaultDurationSeconds ?? legacyDefaultDurationSeconds)
        : null,
    default_load_value:
      loadModel === "external"
        ? (legacyFromSets?.defaultLoadValue ?? legacyDefaultLoadValue)
        : null,
    default_load_unit: row.default_load_unit === "lbs" ? "lbs" : row.default_load_unit === "kg" ? "kg" : null,
    default_additional_load_value:
      loadModel === "bodyweight_plus_external"
        ? (legacyFromSets?.defaultAdditionalLoadValue ?? legacyDefaultAdditionalLoadValue)
        : null,
    default_additional_load_unit:
      row.default_additional_load_unit === "lbs"
        ? "lbs"
        : row.default_additional_load_unit === "kg"
          ? "kg"
          : null,
    target_reps_min: toOptionalPositiveNumber(row.target_reps_min),
    target_reps_max: toOptionalPositiveNumber(row.target_reps_max),
    rpe_min: toOptionalPositiveNumber(row.rpe_min),
    rpe_max: toOptionalPositiveNumber(row.rpe_max),
    sets,
    notes: toOptionalString(row.notes),
    required: row.required !== false,
    superset_group: normalizeSupersetGroup(row.superset_group ?? row.supersetGroup),
  };
}

function normalizeTemplateUnits(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as TemplateLibraryUnitRecord[];
  }

  return value
    .map(normalizeTemplateUnit)
    .filter((item): item is TemplateLibraryUnitRecord => item !== null)
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .map((item, index) => ({
      ...item,
      sequence_no: index + 1,
      superset_group: item.superset_group
        ? {
            ...item.superset_group,
            total_units: Math.max(item.superset_group.total_units, 2),
          }
        : null,
    }));
}

function normalizeTemplateRecord(item: unknown): TemplateLibraryRecord | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return null;
  }

  const row = item as Record<string, unknown>;
  const id = toNonEmptyString(row.id);
  const userId = toNonEmptyString(row.user_id);
  const name = toNonEmptyString(row.name);
  if (!id || !userId || !name) {
    return null;
  }

  const splitType = toNonEmptyString(row.split_type) ?? "custom";

  return {
    id,
    user_id: userId,
    name,
    description: toOptionalString(row.description),
    split_type: splitType,
    folder_key: toOptionalString(row.folder_key),
    aliases: toStringArray(row.aliases),
    enabled: row.enabled !== false,
    notes: toOptionalString(row.notes),
    last_used_at: toOptionalString(row.last_used_at),
    units: normalizeTemplateUnits(row.units),
    created_at: toNonEmptyString(row.created_at) ?? new Date().toISOString(),
    updated_at: toNonEmptyString(row.updated_at) ?? new Date().toISOString(),
  };
}

function normalizeNameKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "")
    .trim();
}

function extractSourceTemplateLibraryItemId(payload: unknown) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>).source_template_library_item_id;
  return typeof value === "string" && value.trim() ? value : null;
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
    return [] as TemplateLibraryRecord[];
  }

  return parsed
    .map(normalizeTemplateRecord)
    .filter((item): item is TemplateLibraryRecord => item !== null);
}

async function writeStore(items: TemplateLibraryRecord[]) {
  await ensureStoreFile();
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), "utf8");
}

function sortItems(items: TemplateLibraryRecord[]) {
  return [...items].sort((a, b) => {
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

async function buildReferenceStatsByTemplate(userId: string) {
  const rows = await prisma.trainingUnitTemplate.findMany({
    where: {
      session_template: {
        block: {
          program: {
            user_id: userId,
          },
        },
      },
    },
    select: {
      prescription_payload: true,
      session_template: {
        select: {
          block: {
            select: {
              program_id: true,
            },
          },
        },
      },
    },
  });

  const map = new Map<string, { unitCount: number; programIds: Set<string> }>();

  for (const row of rows) {
    const templateId = extractSourceTemplateLibraryItemId(row.prescription_payload);
    if (!templateId) {
      continue;
    }
    if (!map.has(templateId)) {
      map.set(templateId, {
        unitCount: 0,
        programIds: new Set<string>(),
      });
    }
    const entry = map.get(templateId)!;
    entry.unitCount += 1;
    entry.programIds.add(row.session_template.block.program_id);
  }

  return map;
}

export async function listTemplateLibraryItemsByUser(
  userId: string,
  options: ListTemplateLibraryItemsOptions = {},
) {
  const query = options.query?.trim().toLowerCase() ?? "";
  const queryTerms = query.split(/\s+/).filter(Boolean);
  const items = await readStore();
  const referenceStats = await buildReferenceStatsByTemplate(userId);

  const filtered = items.filter((item) => {
    if (item.user_id !== userId) {
      return false;
    }
    if (typeof options.enabled === "boolean" && item.enabled !== options.enabled) {
      return false;
    }
    if (options.splitType && item.split_type !== options.splitType) {
      return false;
    }
    if (options.folderKey === null && item.folder_key !== null) {
      return false;
    }
    if (typeof options.folderKey === "string" && item.folder_key !== options.folderKey) {
      return false;
    }

    if (queryTerms.length === 0) {
      return true;
    }

    const searchableText = [
      item.name,
      item.description,
      item.split_type,
      item.notes,
      ...item.aliases,
      ...item.units.flatMap((unit) => [
        unit.exercise_name_snapshot,
        unit.unit_role,
        unit.progression_family,
        unit.progression_policy_type,
        unit.record_mode,
        unit.notes,
      ]),
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ")
      .toLowerCase();

    return queryTerms.every((term) => searchableText.includes(term));
  });

  return sortItems(filtered).map((item) => {
    const stats = referenceStats.get(item.id);
    return {
      ...item,
      unit_count: countLogicalTemplateSlots(
        item.units.map((unit) => ({
          supersetGroup: unit.superset_group
            ? ({
                groupId: unit.superset_group.group_id,
              } as SupersetGroupValue)
            : null,
        })),
      ),
      reference_program_count: stats ? stats.programIds.size : 0,
    } satisfies TemplateLibraryListItem;
  });
}

export async function getTemplateLibraryItemByIdForUser(itemId: string, userId: string) {
  const items = await readStore();
  return items.find((item) => item.id === itemId && item.user_id === userId) ?? null;
}

export async function createTemplateLibraryItem(data: CreateTemplateLibraryRecordInput) {
  const items = await readStore();
  const now = new Date().toISOString();
  const created: TemplateLibraryRecord = {
    ...data,
    aliases: toStringArray(data.aliases),
    units: normalizeTemplateUnits(data.units),
    folder_key: data.folder_key ?? null,
    id: randomUUID(),
    last_used_at: data.last_used_at ?? null,
    created_at: now,
    updated_at: now,
  };
  items.push(created);
  await writeStore(items);
  return created;
}

export async function updateTemplateLibraryItemById(
  itemId: string,
  userId: string,
  data: UpdateTemplateLibraryRecordInput,
) {
  const items = await readStore();
  const index = items.findIndex((item) => item.id === itemId && item.user_id === userId);
  if (index === -1) {
    return { count: 0 };
  }

  const current = items[index];
  items[index] = {
    ...current,
    ...data,
    ...(data.aliases ? { aliases: toStringArray(data.aliases) } : {}),
    ...(data.units ? { units: normalizeTemplateUnits(data.units) } : {}),
    ...(data.folder_key !== undefined ? { folder_key: toOptionalString(data.folder_key) } : {}),
    updated_at: new Date().toISOString(),
  };

  await writeStore(items);
  return { count: 1 };
}

export async function setTemplateLibraryItemLastUsedAt(itemId: string, userId: string, usedAt: string) {
  const items = await readStore();
  const index = items.findIndex((item) => item.id === itemId && item.user_id === userId);
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

export async function getTemplateLibraryItemDetailAggregate(itemId: string, userId: string) {
  const [items, templateRows, plannedRows, packageRows] = await Promise.all([
    readStore(),
    prisma.trainingUnitTemplate.findMany({
      where: {
        session_template: {
          block: {
            program: {
              user_id: userId,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        updated_at: true,
        prescription_payload: true,
        session_template: {
          select: {
            id: true,
            name: true,
            block: {
              select: {
                id: true,
                name: true,
                program: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.plannedUnit.findMany({
      where: {
        planned_session: {
          user_id: userId,
        },
      },
      select: {
        target_payload: true,
        planned_session: {
          select: {
            id: true,
            sequence_index: true,
            session_date: true,
            status: true,
            program: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          planned_session: {
            session_date: "desc",
          },
        },
      ],
    }),
    listTemplatePackagesByUser(userId, { enabled: undefined }),
  ]);

  const currentItem = items.find((item) => item.id === itemId && item.user_id === userId);
  if (!currentItem) {
    return null;
  }

  const normalizedName = normalizeNameKey(currentItem.name);
  const aliasKeys = new Set(currentItem.aliases.map((alias) => normalizeNameKey(alias)));

  const duplicateCandidates = items
    .filter((item) => item.user_id === userId && item.id !== itemId)
    .filter((item) => {
      const itemNameKey = normalizeNameKey(item.name);
      if (itemNameKey && itemNameKey === normalizedName) {
        return true;
      }

      const itemAliasKeys = item.aliases.map((alias) => normalizeNameKey(alias));
      if (itemAliasKeys.includes(normalizedName)) {
        return true;
      }
      if (aliasKeys.has(itemNameKey)) {
        return true;
      }
      return itemAliasKeys.some((aliasKey) => aliasKeys.has(aliasKey));
    })
    .slice(0, 8)
    .map((item) => ({ id: item.id, name: item.name }));

  const templateReferences = templateRows
    .filter((row) => extractSourceTemplateLibraryItemId(row.prescription_payload) === itemId)
    .map((row) => ({
      unit_template_id: row.id,
      unit_name: row.name,
      session_template_id: row.session_template.id,
      session_template_name: row.session_template.name,
      block_id: row.session_template.block.id,
      block_name: row.session_template.block.name,
      program_id: row.session_template.block.program.id,
      program_name: row.session_template.block.program.name,
      updated_at: row.updated_at.toISOString(),
    } satisfies TemplateLibraryTemplateReference));

  const plannedReferences = plannedRows
    .filter((row) => extractSourceTemplateLibraryItemId(row.target_payload) === itemId)
    .slice(0, 30)
    .map((row) => ({
      planned_session_id: row.planned_session.id,
      session_date: row.planned_session.session_date.toISOString(),
      sequence_index: row.planned_session.sequence_index,
      status: row.planned_session.status,
      program_id: row.planned_session.program.id,
      program_name: row.planned_session.program.name,
    } satisfies TemplateLibraryPlannedReference));

  const packageReferences = packageRows
    .flatMap((item) =>
      item.days
        .filter((day) => day.template_library_item_id === itemId)
        .map(
          (day) =>
            ({
              package_id: item.id,
              package_name: item.name,
              day_code: day.day_code,
              day_label: day.label,
              updated_at: item.updated_at,
            }) satisfies TemplateLibraryPackageReference,
        ),
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const latestReferenceTime = [
    currentItem.last_used_at,
    ...templateReferences.map((item) => item.updated_at),
    ...plannedReferences.map((item) => item.session_date),
    ...packageReferences.map((item) => item.updated_at),
  ]
    .filter((item): item is string => Boolean(item))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;

  const programIds = new Set(templateReferences.map((item) => item.program_id));

  return {
    summary: {
      total_template_references: templateReferences.length,
      total_program_references: programIds.size,
      total_planned_references: plannedReferences.length,
      total_package_references: packageReferences.length,
      latest_used_at: latestReferenceTime,
    },
    references: {
      templates: templateReferences,
      planned: plannedReferences,
      packages: packageReferences,
    },
    governance: {
      duplicate_candidates: duplicateCandidates,
    },
  } satisfies TemplateLibraryDetailAggregate;
}
