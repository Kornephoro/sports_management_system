import { z } from "zod";

import { deleteTemplatePackageById } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const DeleteTemplatePackageInputSchema = z.object({
  userId: UuidLikeSchema,
  packageId: UuidLikeSchema,
});

export type DeleteTemplatePackageInput = z.input<typeof DeleteTemplatePackageInputSchema>;

export async function deleteTemplatePackageUseCase(rawInput: DeleteTemplatePackageInput) {
  const input = DeleteTemplatePackageInputSchema.parse(rawInput);
  const deleted = await deleteTemplatePackageById(input.packageId, input.userId);
  if (deleted.count === 0) {
    throw notFoundError("Template package not found");
  }
  return {
    deleted: true,
    packageId: input.packageId,
  };
}
