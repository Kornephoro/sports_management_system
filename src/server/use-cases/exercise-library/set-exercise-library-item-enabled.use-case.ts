import { z } from "zod";

import {
  getExerciseLibraryItemByIdForUser,
  updateExerciseLibraryItemById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

import { toExerciseLibraryItemDto } from "./shared";

const SetExerciseLibraryItemEnabledInputSchema = z.object({
  userId: UuidLikeSchema,
  itemId: UuidLikeSchema,
  enabled: z.boolean(),
});

export type SetExerciseLibraryItemEnabledInput = z.input<
  typeof SetExerciseLibraryItemEnabledInputSchema
>;

export async function setExerciseLibraryItemEnabledUseCase(
  rawInput: SetExerciseLibraryItemEnabledInput,
) {
  const input = SetExerciseLibraryItemEnabledInputSchema.parse(rawInput);
  const existing = await getExerciseLibraryItemByIdForUser(input.itemId, input.userId);
  if (!existing) {
    throw notFoundError("Exercise library item not found");
  }

  await updateExerciseLibraryItemById(input.itemId, input.userId, {
    enabled: input.enabled,
  });

  const updated = await getExerciseLibraryItemByIdForUser(input.itemId, input.userId);
  if (!updated) {
    throw notFoundError("Exercise library item not found after update");
  }

  return toExerciseLibraryItemDto(updated);
}
