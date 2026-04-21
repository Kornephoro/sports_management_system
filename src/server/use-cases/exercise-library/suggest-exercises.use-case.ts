import { z } from "zod";

import type { ExerciseSelectionInput } from "@/lib/exercise-selection-standards";
import { listExerciseLibraryItemsByUser } from "@/server/repositories";
import { suggestExercisesByRules } from "@/server/services/exercise-selection.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const SuggestExercisesInputSchema = z
  .object({
    userId: UuidLikeSchema,
    movement_pattern: z.string().trim().min(1).optional(),
    primary_muscle: z.string().trim().min(1).optional(),
    role: z.enum(["main", "secondary", "accessory"]).optional(),
    recording_mode: z.string().trim().min(1).optional(),
    require_bodyweight: z.boolean().optional(),
    allow_extra_load: z.boolean().optional(),
    allow_assistance: z.boolean().optional(),
    exclude_exercise_ids: z.array(UuidLikeSchema).default([]),
    limit: z.number().int().positive().max(20).optional(),
  })
  .strict();

export type SuggestExercisesInput = z.input<typeof SuggestExercisesInputSchema>;

export async function suggestExercisesUseCase(rawInput: SuggestExercisesInput) {
  const input = SuggestExercisesInputSchema.parse(rawInput);
  const items = await listExerciseLibraryItemsByUser(input.userId, { enabled: true });

  const selectionInput: ExerciseSelectionInput = {
    movement_pattern: input.movement_pattern,
    primary_muscle: input.primary_muscle,
    role: input.role,
    recording_mode: input.recording_mode,
    require_bodyweight: input.require_bodyweight,
    allow_extra_load: input.allow_extra_load,
    allow_assistance: input.allow_assistance,
    exclude_exercise_ids: input.exclude_exercise_ids,
    limit: input.limit,
  };

  return suggestExercisesByRules({
    items,
    input: selectionInput,
  });
}
