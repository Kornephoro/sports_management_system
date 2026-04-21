import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ACTION_MOVEMENT_FILTER_TO_PATTERNS,
  ACTION_PRIMARY_MUSCLE_TO_REGIONS,
  ActionCategoryFilterValue,
  ActionMovementFilterValue,
  ActionPrimaryMuscleFilterValue,
  inferActionCapabilities,
  inferActionCategory,
} from "@/lib/action-filter-standards";
import {
  ExerciseTagV1,
  MovementPatternV1,
  MUSCLE_REGION_VALUES,
  MuscleRegionV1,
} from "@/lib/exercise-library-standards";
import {
  ExerciseRecordingModeValue,
  inferExerciseRecordingMode,
  mapModeToLegacy,
} from "@/lib/recording-mode-standards";
import { prisma } from "@/lib/prisma";

export type ExerciseLibraryRecord = {
  id: string;
  user_id: string;
  name: string;
  aliases: string[];
  default_record_mode: "reps" | "duration";
  default_load_model: "absolute" | "bodyweight_plus";
  recording_mode: ExerciseRecordingModeValue;
  category: "compound" | "isolation";
  movement_pattern: MovementPatternV1;
  primary_regions: MuscleRegionV1[];
  secondary_regions: MuscleRegionV1[];
  tags: ExerciseTagV1[];
  description: string | null;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ListExerciseLibraryItemsOptions = {
  query?: string;
  keyword?: string;
  enabled?: boolean;
  recordingMode?: ExerciseRecordingModeValue;
  recordMode?: "reps" | "duration";
  loadModel?: "absolute" | "bodyweight_plus";
  movementPattern?: MovementPatternV1;
  category?: ActionCategoryFilterValue;
  movementPatterns?: ActionMovementFilterValue[];
  primaryMuscles?: ActionPrimaryMuscleFilterValue[];
  isBodyweight?: boolean;
  allowExtraLoad?: boolean;
  allowAssistance?: boolean;
};

export type ExerciseLibraryListItem = ExerciseLibraryRecord & {
  last_used_at: string | null;
};

export type ExerciseLibrarySummary = {
  total_executions: number;
  latest_performed_at: string | null;
  best_load_value: number | null;
  best_reps: number | null;
  best_duration_seconds: number | null;
  trend: "up" | "flat" | "down" | "insufficient";
};

export type ExerciseTemplateReference = {
  unit_template_id: string;
  unit_name: string;
  session_template_id: string;
  session_template_name: string;
  block_id: string;
  block_name: string;
  program_id: string;
  program_name: string;
};

export type ExercisePlannedReference = {
  planned_unit_id: string;
  planned_session_id: string;
  sequence_index: number;
  session_date: string;
  status: string;
  selected_exercise_name: string | null;
  program_id: string;
  program_name: string;
};

export type ExerciseRecentUsageLocation = {
  session_execution_id: string;
  unit_execution_id: string;
  performed_at: string;
  completion_status: string;
  planned_session_id: string | null;
  sequence_index: number | null;
  program_id: string | null;
  program_name: string | null;
};

export type DuplicateCandidate = {
  id: string;
  name: string;
};

export type ExerciseLibraryItemDetailAggregate = {
  weight_trend_points: Array<{
    performed_at: string;
    value: number;
  }>;
  summary: ExerciseLibrarySummary;
  template_references: ExerciseTemplateReference[];
  planned_references: ExercisePlannedReference[];
  recent_usage_locations: ExerciseRecentUsageLocation[];
  duplicate_candidates: DuplicateCandidate[];
};

type CreateExerciseLibraryRecordInput = Omit<
  ExerciseLibraryRecord,
  "id" | "created_at" | "updated_at"
>;

type UpdateExerciseLibraryRecordInput = Partial<
  Omit<ExerciseLibraryRecord, "id" | "user_id" | "created_at" | "updated_at">
>;

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "exercise-library.json");
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

const LEGACY_REGION_MAP: Record<string, MuscleRegionV1> = {
  upper_chest: "chest_upper",
  lower_chest: "chest_mid_lower",
  front_delt: "delt_front",
  mid_delt: "delt_mid",
  rear_delt: "delt_rear",
  front_delts: "delt_front",
  lateral_delts: "delt_mid",
  rear_delts: "delt_rear",
  forearm: "forearms",
};

const VALID_REGION_SET = new Set<string>(MUSCLE_REGION_VALUES);

function normalizeRegionArray(value: unknown, max: number) {
  const normalized = toStringArray(value)
    .map((region) => LEGACY_REGION_MAP[region] ?? region)
    .filter((region): region is MuscleRegionV1 => VALID_REGION_SET.has(region));
  return normalized.slice(0, max);
}

function normalizeTagArray(value: unknown) {
  return toStringArray(value) as ExerciseTagV1[];
}

function normalizeMovementPattern(value: unknown) {
  const normalized = toNonEmptyString(value);
  if (!normalized) {
    return "core" as MovementPatternV1;
  }
  return normalized as MovementPatternV1;
}

function normalizeRecordMode(value: unknown) {
  return value === "duration" ? ("duration" as const) : ("reps" as const);
}

function normalizeLoadModel(value: unknown) {
  return value === "bodyweight_plus" ? ("bodyweight_plus" as const) : ("absolute" as const);
}

function normalizeCategory(value: unknown) {
  return value === "isolation" ? ("isolation" as const) : ("compound" as const);
}

function normalizeRecord(item: unknown): ExerciseLibraryRecord | null {
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

  const movementPattern = normalizeMovementPattern(row.movement_pattern);
  const defaultRecordMode = normalizeRecordMode(row.default_record_mode);
  const defaultLoadModel = normalizeLoadModel(row.default_load_model);
  const recordingMode = inferExerciseRecordingMode({
    recordingMode: toNonEmptyString(row.recording_mode),
    defaultRecordMode,
    defaultLoadModel,
  });
  const legacyFromMode = mapModeToLegacy(recordingMode);

  return {
    id,
    user_id: userId,
    name,
    aliases: toStringArray(row.aliases),
    default_record_mode: legacyFromMode.defaultRecordMode ?? defaultRecordMode,
    default_load_model: legacyFromMode.defaultLoadModel ?? defaultLoadModel,
    recording_mode: recordingMode,
    category: normalizeCategory(row.category),
    movement_pattern: movementPattern,
    primary_regions: normalizeRegionArray(row.primary_regions, 3),
    secondary_regions: normalizeRegionArray(row.secondary_regions, 4),
    tags: normalizeTagArray(row.tags),
    description: toOptionalString(row.description),
    enabled: row.enabled !== false,
    notes: toOptionalString(row.notes),
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

function dedupeRecords(items: ExerciseLibraryRecord[]) {
  const merged = new Map<string, ExerciseLibraryRecord>();
  for (const item of items) {
    const key = `${item.user_id}:${normalizeNameKey(item.name)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      continue;
    }

    const mergedAliases = toStringArray([...existing.aliases, ...item.aliases]);
    const preferred = existing.updated_at >= item.updated_at ? existing : item;
    merged.set(key, {
      ...preferred,
      aliases: mergedAliases,
      primary_regions:
        preferred.primary_regions.length > 0 ? preferred.primary_regions : existing.primary_regions,
      secondary_regions:
        preferred.secondary_regions.length > 0
          ? preferred.secondary_regions
          : existing.secondary_regions,
      tags: preferred.tags.length > 0 ? preferred.tags : existing.tags,
      description: preferred.description ?? existing.description,
      notes: preferred.notes ?? existing.notes,
    });
  }
  return [...merged.values()];
}

function extractExerciseLibraryItemId(payload: unknown) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>).exercise_library_item_id;
  return typeof value === "string" && value.trim() ? value : null;
}

function extractPositiveNumber(payload: Record<string, unknown>, key: string) {
  const raw = payload[key];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractLoadFromPayload(payload: Record<string, unknown>) {
  const loadModel = typeof payload.load_model === "string" ? payload.load_model : "";

  if (loadModel === "bodyweight_plus_external") {
    const bodyweight = extractPositiveNumber(payload, "bodyweight_snapshot_kg") ?? 0;
    const additional = extractPositiveNumber(payload, "additional_load_value") ?? 0;
    const total = bodyweight + additional;
    return total > 0 ? total : null;
  }

  return extractPositiveNumber(payload, "load_value");
}

function computeTrend(values: number[]) {
  if (values.length < 4) {
    return "insufficient" as const;
  }

  const lastThree = values.slice(-3);
  const prevThree = values.slice(-6, -3);
  if (prevThree.length < 3) {
    return "insufficient" as const;
  }

  const avgLast = lastThree.reduce((sum, item) => sum + item, 0) / lastThree.length;
  const avgPrev = prevThree.reduce((sum, item) => sum + item, 0) / prevThree.length;

  if (avgPrev === 0) {
    return "flat" as const;
  }

  const delta = (avgLast - avgPrev) / avgPrev;
  if (delta > 0.05) {
    return "up" as const;
  }
  if (delta < -0.05) {
    return "down" as const;
  }
  return "flat" as const;
}

function matchesMovementPatternFilters(
  movementPattern: MovementPatternV1,
  filters: ActionMovementFilterValue[],
) {
  if (filters.length === 0) {
    return true;
  }
  return filters.some((filterValue) =>
    (ACTION_MOVEMENT_FILTER_TO_PATTERNS[filterValue] ?? []).includes(movementPattern),
  );
}

function matchesPrimaryMuscleFilters(
  primaryRegions: MuscleRegionV1[],
  filters: ActionPrimaryMuscleFilterValue[],
) {
  if (filters.length === 0) {
    return true;
  }
  return filters.some((filterValue) =>
    primaryRegions.some((region) => (ACTION_PRIMARY_MUSCLE_TO_REGIONS[filterValue] ?? []).includes(region)),
  );
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
    return [] as ExerciseLibraryRecord[];
  }

  const normalized = dedupeRecords(
    parsed.map(normalizeRecord).filter((item): item is ExerciseLibraryRecord => item !== null),
  );

  const normalizedJson = JSON.stringify(normalized, null, 2);
  if (normalizedJson !== JSON.stringify(parsed, null, 2)) {
    await fs.writeFile(STORE_FILE, normalizedJson, "utf8");
  }

  return normalized;
}

async function writeStore(items: ExerciseLibraryRecord[]) {
  await ensureStoreFile();
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), "utf8");
}

function sortItems(items: ExerciseLibraryRecord[]) {
  return [...items].sort((a, b) => {
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

async function buildLastUsedAtMap(userId: string) {
  const rows = await prisma.unitExecution.findMany({
    where: {
      session_execution: {
        user_id: userId,
      },
      planned_unit: {
        isNot: null,
      },
    },
    orderBy: [{ created_at: "desc" }],
    select: {
      session_execution: {
        select: {
          performed_at: true,
        },
      },
      planned_unit: {
        select: {
          target_payload: true,
        },
      },
    },
  });

  const usageMap = new Map<string, string>();

  for (const row of rows) {
    const itemId = extractExerciseLibraryItemId(row.planned_unit?.target_payload);
    if (!itemId) {
      continue;
    }
    const performedAt = row.session_execution.performed_at.toISOString();
    const existing = usageMap.get(itemId);
    if (!existing || existing < performedAt) {
      usageMap.set(itemId, performedAt);
    }
  }

  return usageMap;
}

export async function listExerciseLibraryItemsByUser(
  userId: string,
  options: ListExerciseLibraryItemsOptions = {},
) {
  const keyword = options.keyword?.trim().toLowerCase() ?? options.query?.trim().toLowerCase() ?? "";
  const movementPatternFilters = options.movementPatterns ?? [];
  const primaryMuscleFilters = options.primaryMuscles ?? [];
  const items = await readStore();

  const filtered = items.filter((item) => {
    if (item.user_id !== userId) {
      return false;
    }
    if (typeof options.enabled === "boolean" && item.enabled !== options.enabled) {
      return false;
    }
    if (options.recordingMode && item.recording_mode !== options.recordingMode) {
      return false;
    }
    if (options.recordMode && item.default_record_mode !== options.recordMode) {
      return false;
    }
    if (options.loadModel && item.default_load_model !== options.loadModel) {
      return false;
    }
    if (options.movementPattern && item.movement_pattern !== options.movementPattern) {
      return false;
    }
    if (
      options.category &&
      inferActionCategory({
        movementPattern: item.movement_pattern,
        primaryRegions: item.primary_regions,
        secondaryRegions: item.secondary_regions,
      }) !== options.category
    ) {
      return false;
    }
    if (!matchesMovementPatternFilters(item.movement_pattern, movementPatternFilters)) {
      return false;
    }
    if (!matchesPrimaryMuscleFilters(item.primary_regions, primaryMuscleFilters)) {
      return false;
    }

    const capabilities = inferActionCapabilities({
      notes: item.notes,
      tags: item.tags,
      defaultLoadModel: item.default_load_model,
    });

    if (
      typeof options.isBodyweight === "boolean" &&
      capabilities.isBodyweight !== options.isBodyweight
    ) {
      return false;
    }
    if (
      typeof options.allowExtraLoad === "boolean" &&
      capabilities.allowExtraLoad !== options.allowExtraLoad
    ) {
      return false;
    }
    if (
      typeof options.allowAssistance === "boolean" &&
      capabilities.allowAssistance !== options.allowAssistance
    ) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    const aliasMatched = item.aliases.some((alias) => alias.toLowerCase().includes(keyword));

    return item.name.toLowerCase().includes(keyword) || aliasMatched;
  });

  const usageMap = await buildLastUsedAtMap(userId);

  return sortItems(filtered).map((item) => ({
    ...item,
    last_used_at: usageMap.get(item.id) ?? null,
  }));
}

export async function getExerciseLibraryItemByIdForUser(itemId: string, userId: string) {
  const items = await readStore();
  return items.find((item) => item.id === itemId && item.user_id === userId) ?? null;
}

export async function createExerciseLibraryItem(data: CreateExerciseLibraryRecordInput) {
  const items = await readStore();
  const now = new Date().toISOString();
  const normalizedInputName = normalizeNameKey(data.name);
  const existingIndex = items.findIndex(
    (item) => item.user_id === data.user_id && normalizeNameKey(item.name) === normalizedInputName,
  );

  const nextPayload = {
    ...data,
    aliases: toStringArray(data.aliases),
    primary_regions: normalizeRegionArray(data.primary_regions, 3),
    secondary_regions: normalizeRegionArray(data.secondary_regions, 4),
    tags: normalizeTagArray(data.tags),
  };

  if (existingIndex >= 0) {
    const current = items[existingIndex];
    const merged: ExerciseLibraryRecord = {
      ...current,
      ...nextPayload,
      aliases: toStringArray([...current.aliases, ...nextPayload.aliases]),
      updated_at: now,
    };
    items[existingIndex] = merged;
    await writeStore(items);
    return merged;
  }

  const created: ExerciseLibraryRecord = {
    ...nextPayload,
    id: randomUUID(),
    created_at: now,
    updated_at: now,
  };
  items.push(created);
  await writeStore(items);
  return created;
}

export async function updateExerciseLibraryItemById(
  itemId: string,
  userId: string,
  data: UpdateExerciseLibraryRecordInput,
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
    ...(data.primary_regions ? { primary_regions: normalizeRegionArray(data.primary_regions, 3) } : {}),
    ...(data.secondary_regions ? { secondary_regions: normalizeRegionArray(data.secondary_regions, 4) } : {}),
    ...(data.tags ? { tags: normalizeTagArray(data.tags) } : {}),
    updated_at: new Date().toISOString(),
  };
  await writeStore(items);
  return { count: 1 };
}

export async function getExerciseLibraryItemDetailAggregate(itemId: string, userId: string) {
  const [items, templateRows, plannedRows, unitExecutionRows] = await Promise.all([
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
        id: true,
        selected_exercise_name: true,
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
    }),
    prisma.unitExecution.findMany({
      where: {
        session_execution: {
          user_id: userId,
        },
        planned_unit: {
          isNot: null,
        },
      },
      orderBy: [{ created_at: "desc" }],
      take: 300,
      select: {
        id: true,
        completion_status: true,
        actual_payload: true,
        session_execution: {
          select: {
            id: true,
            performed_at: true,
            planned_session_id: true,
            program: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        planned_unit: {
          select: {
            target_payload: true,
            planned_session: {
              select: {
                sequence_index: true,
              },
            },
          },
        },
      },
    }),
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
    .filter((row) => extractExerciseLibraryItemId(row.prescription_payload) === itemId)
    .slice(0, 20)
    .map((row) => ({
      unit_template_id: row.id,
      unit_name: row.name,
      session_template_id: row.session_template.id,
      session_template_name: row.session_template.name,
      block_id: row.session_template.block.id,
      block_name: row.session_template.block.name,
      program_id: row.session_template.block.program.id,
      program_name: row.session_template.block.program.name,
    }));

  const plannedReferences = plannedRows
    .filter((row) => extractExerciseLibraryItemId(row.target_payload) === itemId)
    .slice(0, 20)
    .map((row) => ({
      planned_unit_id: row.id,
      planned_session_id: row.planned_session.id,
      sequence_index: row.planned_session.sequence_index,
      session_date: row.planned_session.session_date.toISOString(),
      status: row.planned_session.status,
      selected_exercise_name: row.selected_exercise_name,
      program_id: row.planned_session.program.id,
      program_name: row.planned_session.program.name,
    }));

  const matchedExecutions = unitExecutionRows
    .filter((row) => extractExerciseLibraryItemId(row.planned_unit?.target_payload) === itemId)
    .sort((a, b) =>
      b.session_execution.performed_at.getTime() - a.session_execution.performed_at.getTime(),
    );

  const loadValues: number[] = [];
  const repValues: number[] = [];
  const durationValues: number[] = [];
  const loadTrendPoints: Array<{ performed_at: string; value: number }> = [];

  const trendSeeds: Array<{ performedAt: string; value: number }> = [];

  for (const row of matchedExecutions) {
    const targetPayload =
      typeof row.planned_unit?.target_payload === "object" && row.planned_unit?.target_payload !== null
        ? (row.planned_unit.target_payload as Record<string, unknown>)
        : {};
    const actualPayload =
      typeof row.actual_payload === "object" && row.actual_payload !== null
        ? (row.actual_payload as Record<string, unknown>)
        : {};
    const actualDiff =
      typeof actualPayload.actual_diff === "object" &&
      actualPayload.actual_diff !== null &&
      !Array.isArray(actualPayload.actual_diff)
        ? (actualPayload.actual_diff as Record<string, unknown>)
        : {};

    const loadValue = extractLoadFromPayload(targetPayload);
    if (loadValue !== null) {
      loadValues.push(loadValue);
      loadTrendPoints.push({
        performed_at: row.session_execution.performed_at.toISOString(),
        value: loadValue,
      });
      trendSeeds.push({ performedAt: row.session_execution.performed_at.toISOString(), value: loadValue });
    }

    const repsValue = extractPositiveNumber(actualDiff, "actual_reps") ?? extractPositiveNumber(targetPayload, "reps");
    if (repsValue !== null) {
      repValues.push(repsValue);
      if (loadValue === null) {
        trendSeeds.push({ performedAt: row.session_execution.performed_at.toISOString(), value: repsValue });
      }
    }

    const durationValue =
      extractPositiveNumber(actualDiff, "actual_duration_seconds") ??
      extractPositiveNumber(targetPayload, "duration_seconds");
    if (durationValue !== null) {
      durationValues.push(durationValue);
      if (loadValue === null && repsValue === null) {
        trendSeeds.push({
          performedAt: row.session_execution.performed_at.toISOString(),
          value: durationValue,
        });
      }
    }
  }

  const trendValues = trendSeeds
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt))
    .map((item) => item.value);

  const summary: ExerciseLibrarySummary = {
    total_executions: matchedExecutions.length,
    latest_performed_at:
      matchedExecutions.length > 0
        ? matchedExecutions[0].session_execution.performed_at.toISOString()
        : null,
    best_load_value: loadValues.length > 0 ? Math.max(...loadValues) : null,
    best_reps: repValues.length > 0 ? Math.max(...repValues) : null,
    best_duration_seconds: durationValues.length > 0 ? Math.max(...durationValues) : null,
    trend: computeTrend(trendValues),
  };

  const recentUsageLocations: ExerciseRecentUsageLocation[] = matchedExecutions.slice(0, 8).map((row) => ({
    session_execution_id: row.session_execution.id,
    unit_execution_id: row.id,
    performed_at: row.session_execution.performed_at.toISOString(),
    completion_status: row.completion_status,
    planned_session_id: row.session_execution.planned_session_id,
    sequence_index: row.planned_unit?.planned_session.sequence_index ?? null,
    program_id: row.session_execution.program?.id ?? null,
    program_name: row.session_execution.program?.name ?? null,
  }));

  return {
    weight_trend_points: loadTrendPoints.sort((a, b) => a.performed_at.localeCompare(b.performed_at)),
    summary,
    template_references: templateReferences,
    planned_references: plannedReferences,
    recent_usage_locations: recentUsageLocations,
    duplicate_candidates: duplicateCandidates,
  } satisfies ExerciseLibraryItemDetailAggregate;
}
