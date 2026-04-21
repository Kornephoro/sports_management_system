import { z } from "zod";

import { createTemplateLibraryFolder } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

const CreateTemplateLibraryFolderInputSchema = z.object({
  userId: UuidLikeSchema,
  label: z.string().trim().min(1).max(32),
  key: z.string().trim().min(1).max(48).optional(),
});

export type CreateTemplateLibraryFolderInput = z.input<
  typeof CreateTemplateLibraryFolderInputSchema
>;

export async function createTemplateLibraryFolderUseCase(
  rawInput: CreateTemplateLibraryFolderInput,
) {
  const input = CreateTemplateLibraryFolderInputSchema.parse(rawInput);
  try {
    const created = await createTemplateLibraryFolder({
      user_id: input.userId,
      label: input.label,
      key: input.key,
    });
    return {
      key: created.key,
      label: created.label,
      templateCount: created.template_count,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw badRequestError(error.message);
    }
    throw badRequestError("创建文件夹失败");
  }
}
