import { z } from "zod";

import { listTemplatePackagesByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

import { toTemplatePackageListItemDto } from "./shared";

const ListTemplatePackagesInputSchema = z.object({
  userId: UuidLikeSchema,
  query: z.string().optional(),
  enabled: z.enum(["true", "false", "all"]).optional(),
});

export type ListTemplatePackagesInput = z.input<typeof ListTemplatePackagesInputSchema>;

export async function listTemplatePackagesUseCase(rawInput: ListTemplatePackagesInput) {
  const input = ListTemplatePackagesInputSchema.parse(rawInput);
  const enabled = input.enabled === "true" ? true : input.enabled === "false" ? false : undefined;
  const items = await listTemplatePackagesByUser(input.userId, {
    query: input.query,
    enabled,
  });
  return items.map(toTemplatePackageListItemDto);
}
