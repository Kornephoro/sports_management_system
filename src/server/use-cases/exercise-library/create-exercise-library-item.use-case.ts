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
import { createExerciseLibraryItem } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

import { toExerciseLibraryItemDto } from "./shared";

const CreateExerciseLibraryItemInputSchema = z.object({
  userId: UuidLikeSchema,
  name: z.string().trim().min(1, "动作名称不能为空"),
  aliases: z.array(z.string().trim().min(1)).default([]),
  recordingMode: z.enum(EXERCISE_RECORDING_MODE_VALUES).optional(),
  defaultRecordMode: z.enum(["reps", "duration"]).optional(),
  defaultLoadModel: z.enum(["absolute", "bodyweight_plus"]).optional(),
  category: z.enum(EXERCISE_CATEGORY_VALUES).default("compound"),
  movementPattern: z.enum(MOVEMENT_PATTERN_VALUES),
  primaryRegions: z
    .array(z.enum(MUSCLE_REGION_VALUES))
    .min(1, "至少选择 1 个主训练部位")
    .max(3, "主训练部位最多 3 个"),
  secondaryRegions: z
    .array(z.enum(MUSCLE_REGION_VALUES))
    .max(4, "次训练部位最多 4 个")
    .default([]),
  tags: z
    .array(z.enum(EXERCISE_TAG_VALUES))
    .default([]),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
}).strict();

export type CreateExerciseLibraryItemInput = z.input<typeof CreateExerciseLibraryItemInputSchema>;

function normalizeNotes(notes: string | undefined) {
  if (notes === undefined) {
    return null;
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

export async function createExerciseLibraryItemUseCase(
  rawInput: CreateExerciseLibraryItemInput,
) {
  const input = CreateExerciseLibraryItemInputSchema.parse(rawInput);
  const normalizedPrimary = compressWithinGroup(input.primaryRegions);
  const normalizedSecondary = compressWithinGroup(input.secondaryRegions);

  if (areRegionsOverlapping(normalizedPrimary, normalizedSecondary)) {
    throw badRequestError("同一部位不能同时作为主训练部位和次训练部位");
  }

  const inferredMode = inferExerciseRecordingMode({
    recordingMode: input.recordingMode,
    defaultRecordMode: input.defaultRecordMode ?? "reps",
    defaultLoadModel: input.defaultLoadModel ?? "absolute",
  });
  const legacyDefaults = mapModeToLegacy(inferredMode);

  const created = await createExerciseLibraryItem({
    user_id: input.userId,
    name: input.name,
    aliases: normalizeStringArray(input.aliases),
    default_record_mode: legacyDefaults.defaultRecordMode,
    default_load_model: legacyDefaults.defaultLoadModel,
    recording_mode: inferredMode,
    category: input.category,
    movement_pattern: input.movementPattern,
    primary_regions: normalizeStringArray(normalizedPrimary) as typeof input.primaryRegions,
    secondary_regions: normalizeStringArray(normalizedSecondary) as typeof input.secondaryRegions,
    tags: normalizeStringArray(input.tags) as typeof input.tags,
    description: normalizeNotes(input.description),
    enabled: input.enabled,
    notes: normalizeNotes(input.notes),
  });

  return toExerciseLibraryItemDto(created);
}
