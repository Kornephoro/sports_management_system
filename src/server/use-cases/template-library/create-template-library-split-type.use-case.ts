import { z } from "zod";

import { createTemplateLibrarySplitType } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

const CreateTemplateLibrarySplitTypeInputSchema = z.object({
  userId: UuidLikeSchema,
  label: z.string().trim().min(1).max(32),
  key: z.string().trim().min(1).max(48).optional(),
});

export type CreateTemplateLibrarySplitTypeInput = z.input<
  typeof CreateTemplateLibrarySplitTypeInputSchema
>;

export async function createTemplateLibrarySplitTypeUseCase(
  rawInput: CreateTemplateLibrarySplitTypeInput,
) {
  const input = CreateTemplateLibrarySplitTypeInputSchema.parse(rawInput);
  try {
    const created = await createTemplateLibrarySplitType({
      user_id: input.userId,
      label: input.label,
      key: input.key,
    });
    return {
      key: created.key,
      label: created.label,
      builtin: created.builtin,
      templateCount: created.template_count,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw badRequestError(error.message);
    }
    throw badRequestError("创建分化类型失败");
  }
}
