import { z } from "zod";

import { deleteTemplateLibrarySplitType } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

const DeleteTemplateLibrarySplitTypeInputSchema = z.object({
  userId: UuidLikeSchema,
  key: z.string().trim().min(1),
  migrateToKey: z.string().trim().min(1).optional(),
});

export type DeleteTemplateLibrarySplitTypeInput = z.input<
  typeof DeleteTemplateLibrarySplitTypeInputSchema
>;

export async function deleteTemplateLibrarySplitTypeUseCase(
  rawInput: DeleteTemplateLibrarySplitTypeInput,
) {
  const input = DeleteTemplateLibrarySplitTypeInputSchema.parse(rawInput);
  try {
    const result = await deleteTemplateLibrarySplitType({
      user_id: input.userId,
      key: input.key,
      migrate_to_key: input.migrateToKey,
    });
    return {
      deleted: result.deleted,
      deletedKey: result.deleted_key,
      migratedToKey: result.migrated_to_key,
      migratedTemplateCount: result.migrated_template_count,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw badRequestError(error.message);
    }
    throw badRequestError("删除分化类型失败");
  }
}
