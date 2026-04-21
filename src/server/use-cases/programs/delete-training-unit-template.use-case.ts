import { z } from "zod";

import {
  countTrainingUnitTemplateReferences,
  deleteTrainingUnitTemplateById,
  getTrainingUnitTemplateByIdForUser,
  updateTrainingUnitTemplateById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const DeleteTrainingUnitTemplateInputSchema = z.object({
  userId: UuidLikeSchema,
  unitTemplateId: UuidLikeSchema,
});

export type DeleteTrainingUnitTemplateInput = z.input<
  typeof DeleteTrainingUnitTemplateInputSchema
>;

export async function deleteTrainingUnitTemplateUseCase(
  rawInput: DeleteTrainingUnitTemplateInput,
) {
  const input = DeleteTrainingUnitTemplateInputSchema.parse(rawInput);

  const existing = await getTrainingUnitTemplateByIdForUser(input.unitTemplateId, input.userId);
  if (!existing) {
    throw notFoundError("Training unit template not found");
  }

  const { plannedUnitCount, unitExecutionCount } = await countTrainingUnitTemplateReferences(
    input.unitTemplateId,
  );

  if (plannedUnitCount === 0 && unitExecutionCount === 0) {
    await deleteTrainingUnitTemplateById(input.unitTemplateId);
    return {
      mode: "hard_deleted" as const,
      unitTemplateId: input.unitTemplateId,
    };
  }

  const softDeleted = await updateTrainingUnitTemplateById(input.unitTemplateId, {
    is_key_unit: false,
    optional: true,
    notes: existing.notes
      ? `${existing.notes}\n[已从模板移除，保留历史关联数据]`
      : "[已从模板移除，保留历史关联数据]",
  });

  return {
    mode: "soft_disabled" as const,
    unitTemplate: softDeleted,
  };
}
