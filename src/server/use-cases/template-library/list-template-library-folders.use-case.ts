import { z } from "zod";

import { listTemplateLibraryFoldersByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListTemplateLibraryFoldersInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type ListTemplateLibraryFoldersInput = z.input<
  typeof ListTemplateLibraryFoldersInputSchema
>;

export async function listTemplateLibraryFoldersUseCase(
  rawInput: ListTemplateLibraryFoldersInput,
) {
  const input = ListTemplateLibraryFoldersInputSchema.parse(rawInput);
  const items = await listTemplateLibraryFoldersByUser(input.userId);
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    templateCount: item.template_count,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}
