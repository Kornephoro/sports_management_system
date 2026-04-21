import { z } from "zod";

import {
  ACTION_CATEGORY_FILTER_VALUES,
  ACTION_MOVEMENT_FILTER_VALUES,
  ACTION_PRIMARY_MUSCLE_FILTER_VALUES,
} from "@/lib/action-filter-standards";
import { MOVEMENT_PATTERN_VALUES } from "@/lib/exercise-library-standards";
import { EXERCISE_RECORDING_MODE_VALUES } from "@/lib/recording-mode-standards";
import { listExerciseLibraryItemsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

import { toExerciseLibraryItemDto } from "./shared";

const ListExerciseLibraryItemsInputSchema = z.object({
  userId: UuidLikeSchema,
  query: z.string().optional(),
  keyword: z.string().optional(),
  enabled: z.enum(["true", "false", "all"]).optional(),
  recordingMode: z.enum(EXERCISE_RECORDING_MODE_VALUES).optional(),
  recordMode: z.enum(["reps", "duration"]).optional(),
  loadModel: z.enum(["absolute", "bodyweight_plus"]).optional(),
  movementPattern: z
    .enum(MOVEMENT_PATTERN_VALUES)
    .optional(),
  category: z.enum(ACTION_CATEGORY_FILTER_VALUES).optional(),
  movementPatterns: z.array(z.enum(ACTION_MOVEMENT_FILTER_VALUES)).default([]),
  primaryMuscles: z.array(z.enum(ACTION_PRIMARY_MUSCLE_FILTER_VALUES)).default([]),
  isBodyweight: z.boolean().optional(),
  allowExtraLoad: z.boolean().optional(),
  allowAssistance: z.boolean().optional(),
}).strict();

export type ListExerciseLibraryItemsInput = z.input<typeof ListExerciseLibraryItemsInputSchema>;

export async function listExerciseLibraryItemsUseCase(rawInput: ListExerciseLibraryItemsInput) {
  const input = ListExerciseLibraryItemsInputSchema.parse(rawInput);
  const enabled =
    input.enabled === "true" ? true : input.enabled === "false" ? false : undefined;

  const items = await listExerciseLibraryItemsByUser(input.userId, {
    query: input.query,
    keyword: input.keyword,
    enabled,
    recordingMode: input.recordingMode,
    recordMode: input.recordMode,
    loadModel: input.loadModel,
    movementPattern: input.movementPattern,
    category: input.category,
    movementPatterns: input.movementPatterns,
    primaryMuscles: input.primaryMuscles,
    isBodyweight: input.isBodyweight,
    allowExtraLoad: input.allowExtraLoad,
    allowAssistance: input.allowAssistance,
  });

  return items.map(toExerciseLibraryItemDto);
}
