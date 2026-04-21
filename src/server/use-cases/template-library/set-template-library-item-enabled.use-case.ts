import { z } from "zod";

import {
  getTemplateLibraryItemByIdForUser,
  updateTemplateLibraryItemById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

import { toTemplateLibraryItemDto } from "./shared";

const SetTemplateLibraryItemEnabledInputSchema = z.object({
  userId: UuidLikeSchema,
  itemId: UuidLikeSchema,
  enabled: z.boolean(),
});

export type SetTemplateLibraryItemEnabledInput = z.input<
  typeof SetTemplateLibraryItemEnabledInputSchema
>;

export async function setTemplateLibraryItemEnabledUseCase(
  rawInput: SetTemplateLibraryItemEnabledInput,
) {
  const input = SetTemplateLibraryItemEnabledInputSchema.parse(rawInput);

  const existing = await getTemplateLibraryItemByIdForUser(input.itemId, input.userId);
  if (!existing) {
    throw notFoundError("Template library item not found");
  }

  await updateTemplateLibraryItemById(input.itemId, input.userId, {
    enabled: input.enabled,
  });

  const updated = await getTemplateLibraryItemByIdForUser(input.itemId, input.userId);
  if (!updated) {
    throw notFoundError("Template library item not found after update");
  }

  return toTemplateLibraryItemDto(updated);
}
