import { z } from "zod";

import { getTemplatePackageByIdForUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

import { toTemplatePackageDto } from "./shared";

const GetTemplatePackageInputSchema = z.object({
  userId: UuidLikeSchema,
  packageId: UuidLikeSchema,
});

export type GetTemplatePackageInput = z.input<typeof GetTemplatePackageInputSchema>;

export async function getTemplatePackageUseCase(rawInput: GetTemplatePackageInput) {
  const input = GetTemplatePackageInputSchema.parse(rawInput);
  const item = await getTemplatePackageByIdForUser(input.packageId, input.userId);
  if (!item) {
    throw notFoundError("Template package not found");
  }
  return toTemplatePackageDto(item);
}
