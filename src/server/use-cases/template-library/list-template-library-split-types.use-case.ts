import { z } from "zod";

import { listTemplateLibrarySplitTypesByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListTemplateLibrarySplitTypesInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type ListTemplateLibrarySplitTypesInput = z.input<
  typeof ListTemplateLibrarySplitTypesInputSchema
>;

export async function listTemplateLibrarySplitTypesUseCase(
  rawInput: ListTemplateLibrarySplitTypesInput,
) {
  const input = ListTemplateLibrarySplitTypesInputSchema.parse(rawInput);
  const items = await listTemplateLibrarySplitTypesByUser(input.userId);
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    builtin: item.builtin,
    templateCount: item.template_count,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }));
}
