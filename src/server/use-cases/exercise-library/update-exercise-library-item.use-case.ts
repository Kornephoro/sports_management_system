import { z } from "zod";

import {
  EXERCISE_CATEGORY_VALUES,
  EXERCISE_TAG_VALUES,
  MOVEMENT_PATTERN_VALUES,
  MUSCLE_REGION_VALUES,
} from "@/lib/exercise-library-standards";
import { areRegionsOverlapping, compressWithinGroup } from "@/lib/muscle-region-merge";
import {
  EXERCISE_RECORDING_MODE_VALUES,
  inferExerciseRecordingMode,
  mapModeToLegacy,
} from "@/lib/recording-mode-standards";
import {
  getExerciseLibraryItemByIdForUser,
  updateExerciseLibraryItemById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

import { toExerciseLibraryItemDto } from "./shared";

const UpdateExerciseLibraryItemInputSchema = z
  .object({
    userId: UuidLikeSchema,
    itemId: UuidLikeSchema,
    name: z.string().trim().min(1).optional(),
    aliases: z.array(z.string().trim().min(1)).optional(),
    recordingMode: z.enum(EXERCISE_RECORDING_MODE_VALUES).optional(),
    defaultRecordMode: z.enum(["reps", "duration"]).optional(),
    defaultLoadModel: z.enum(["absolute", "bodyweight_plus"]).optional(),
    category: z.enum(EXERCISE_CATEGORY_VALUES).optional(),
    movementPattern: z
      .enum(MOVEMENT_PATTERN_VALUES)
      .optional(),
    primaryRegions: z
      .array(z.enum(MUSCLE_REGION_VALUES))
      .min(1)
      .max(3)
      .optional(),
    secondaryRegions: z
      .array(z.enum(MUSCLE_REGION_VALUES))
      .max(4)
      .optional(),
    tags: z
      .array(z.enum(EXERCISE_TAG_VALUES))
      .optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.aliases !== undefined ||
      value.recordingMode !== undefined ||
      value.defaultRecordMode !== undefined ||
      value.defaultLoadModel !== undefined ||
      value.category !== undefined ||
      value.movementPattern !== undefined ||
      value.primaryRegions !== undefined ||
      value.secondaryRegions !== undefined ||
      value.tags !== undefined ||
      value.description !== undefined ||
      value.enabled !== undefined ||
      value.notes !== undefined,
    { message: "至少需要提供一个可编辑字段" },
  );

export type UpdateExerciseLibraryItemInput = z.input<typeof UpdateExerciseLibraryItemInputSchema>;

function normalizeNotes(notes: string | undefined) {
  if (notes === undefined) {
    return undefined;
  }
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(items: string[]) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    values.push(trimmed);
  }
  return values;
}

export async function updateExerciseLibraryItemUseCase(rawInput: UpdateExerciseLibraryItemInput) {
  const input = UpdateExerciseLibraryItemInputSchema.parse(rawInput);
  const existing = await getExerciseLibraryItemByIdForUser(input.itemId, input.userId);
  if (!existing) {
    throw notFoundError("Exercise library item not found");
  }

  const resolvedPrimaryRegions =
    input.primaryRegions !== undefined ? input.primaryRegions : existing.primary_regions;
  const resolvedSecondaryRegions =
    input.secondaryRegions !== undefined ? input.secondaryRegions : existing.secondary_regions;
  const normalizedPrimaryRegions = compressWithinGroup(resolvedPrimaryRegions);
  const normalizedSecondaryRegions = compressWithinGroup(resolvedSecondaryRegions);
  const resolvedRecordingMode = inferExerciseRecordingMode({
    recordingMode: input.recordingMode ?? existing.recording_mode,
    defaultRecordMode: input.defaultRecordMode ?? existing.default_record_mode,
    defaultLoadModel: input.defaultLoadModel ?? existing.default_load_model,
  });
  const resolvedLegacyDefaults = mapModeToLegacy(resolvedRecordingMode);

  if (areRegionsOverlapping(normalizedPrimaryRegions, normalizedSecondaryRegions)) {
    throw badRequestError("同一部位不能同时作为主训练部位和次训练部位");
  }

  await updateExerciseLibraryItemById(input.itemId, input.userId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.aliases !== undefined ? { aliases: normalizeStringArray(input.aliases) } : {}),
    ...(input.recordingMode !== undefined ||
    input.defaultRecordMode !== undefined ||
    input.defaultLoadModel !== undefined
      ? {
          recording_mode: resolvedRecordingMode,
          default_record_mode: resolvedLegacyDefaults.defaultRecordMode,
          default_load_model: resolvedLegacyDefaults.defaultLoadModel,
        }
      : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.movementPattern !== undefined
      ? { movement_pattern: input.movementPattern }
      : {}),
    ...(input.primaryRegions !== undefined
      ? {
          primary_regions: normalizeStringArray(normalizedPrimaryRegions) as typeof input.primaryRegions,
        }
      : {}),
    ...(input.secondaryRegions !== undefined
      ? {
          secondary_regions: normalizeStringArray(normalizedSecondaryRegions) as typeof input.secondaryRegions,
        }
      : {}),
    ...(input.tags !== undefined
      ? { tags: normalizeStringArray(input.tags) as typeof input.tags }
      : {}),
    ...(input.description !== undefined ? { description: normalizeNotes(input.description) } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.notes !== undefined ? { notes: normalizeNotes(input.notes) } : {}),
  });

  const updated = await getExerciseLibraryItemByIdForUser(input.itemId, input.userId);
  if (!updated) {
    throw notFoundError("Exercise library item not found after update");
  }

  return toExerciseLibraryItemDto(updated);
}
