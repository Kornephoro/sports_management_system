import { z } from "zod";

import {
  createMesocycleRecord,
  getActiveMesocycleByUser,
  getTemplatePackageByIdForUser,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const CreateTrainingMesocycleInputSchema = z.object({
  userId: UuidLikeSchema,
  name: z.string().trim().min(1),
  primaryPackageId: UuidLikeSchema,
  programId: UuidLikeSchema.optional(),
  startSequenceIndex: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});

export type CreateTrainingMesocycleInput = z.input<typeof CreateTrainingMesocycleInputSchema>;

export async function createTrainingMesocycleUseCase(rawInput: CreateTrainingMesocycleInput) {
  const input = CreateTrainingMesocycleInputSchema.parse(rawInput);
  const active = await getActiveMesocycleByUser(input.userId);
  if (active) {
    throw badRequestError("当前已有进行中的中周期，请先结束后再开始新的中周期。");
  }

  const packageItem = await getTemplatePackageByIdForUser(input.primaryPackageId, input.userId);
  if (!packageItem) {
    throw notFoundError("计划包不存在");
  }

  return createMesocycleRecord({
    user_id: input.userId,
    name: input.name,
    primary_package_id: packageItem.id,
    primary_package_name: packageItem.name,
    program_id: input.programId ?? packageItem.linked_program_id ?? null,
    start_sequence_index: input.startSequenceIndex ?? null,
    notes: input.notes,
  });
}
