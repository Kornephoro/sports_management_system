import { z } from "zod";

import { listTemplateLibraryItemsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

import { toTemplateLibraryItemDto } from "./shared";

const ListTemplateLibraryItemsInputSchema = z.object({
  userId: UuidLikeSchema,
  query: z.string().optional(),
  enabled: z.enum(["true", "false", "all"]).optional(),
  splitType: z.string().trim().min(1).optional(),
  folderKey: z.string().trim().min(1).optional(),
});

export type ListTemplateLibraryItemsInput = z.input<typeof ListTemplateLibraryItemsInputSchema>;

export async function listTemplateLibraryItemsUseCase(rawInput: ListTemplateLibraryItemsInput) {
  const input = ListTemplateLibraryItemsInputSchema.parse(rawInput);
  const enabled = input.enabled === "true" ? true : input.enabled === "false" ? false : undefined;

  const items = await listTemplateLibraryItemsByUser(input.userId, {
    query: input.query,
    enabled,
    splitType: input.splitType,
    folderKey:
      input.folderKey === "uncategorized"
        ? null
        : input.folderKey && input.folderKey !== "all"
          ? input.folderKey
          : undefined,
  });

  return items.map((item) => ({
    ...toTemplateLibraryItemDto(item),
    unitCount: item.unit_count,
    referenceProgramCount: item.reference_program_count,
  }));
}
