import { z } from "zod";

import { updateTemplateLibraryFolder } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const UpdateTemplateLibraryFolderInputSchema = z.object({
  userId: UuidLikeSchema,
  key: z.string().trim().min(1),
  label: z.string().trim().min(1).max(32),
});

export type UpdateTemplateLibraryFolderInput = z.input<
  typeof UpdateTemplateLibraryFolderInputSchema
>;

export async function updateTemplateLibraryFolderUseCase(
  rawInput: UpdateTemplateLibraryFolderInput,
) {
  const input = UpdateTemplateLibraryFolderInputSchema.parse(rawInput);
  try {
    const updated = await updateTemplateLibraryFolder({
      user_id: input.userId,
      key: input.key,
      label: input.label,
    });
    if (!updated) {
      throw notFoundError("Folder not found");
    }
    return {
      key: updated.key,
      label: updated.label,
      templateCount: updated.template_count,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      throw notFoundError("Folder not found");
    }
    if (error instanceof Error) {
      throw badRequestError(error.message);
    }
    throw badRequestError("更新文件夹失败");
  }
}
