import { z } from "zod";

import { updateTemplateLibrarySplitType } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const UpdateTemplateLibrarySplitTypeInputSchema = z.object({
  userId: UuidLikeSchema,
  key: z.string().trim().min(1),
  label: z.string().trim().min(1).max(32),
});

export type UpdateTemplateLibrarySplitTypeInput = z.input<
  typeof UpdateTemplateLibrarySplitTypeInputSchema
>;

export async function updateTemplateLibrarySplitTypeUseCase(
  rawInput: UpdateTemplateLibrarySplitTypeInput,
) {
  const input = UpdateTemplateLibrarySplitTypeInputSchema.parse(rawInput);
  try {
    const updated = await updateTemplateLibrarySplitType({
      user_id: input.userId,
      key: input.key,
      label: input.label,
    });
    if (!updated) {
      throw notFoundError("Split type not found");
    }
    return {
      key: updated.key,
      label: updated.label,
      builtin: updated.builtin,
      templateCount: updated.template_count,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      throw notFoundError("Split type not found");
    }
    if (error instanceof Error) {
      throw badRequestError(error.message);
    }
    throw badRequestError("更新分化类型失败");
  }
}
