import { z } from "zod";

import { listPlannedSessionsByProgram } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListPlannedSessionsInputSchema = z.object({
  userId: UuidLikeSchema,
  programId: UuidLikeSchema,
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type ListPlannedSessionsInput = z.input<typeof ListPlannedSessionsInputSchema>;

export async function listPlannedSessionsUseCase(rawInput: ListPlannedSessionsInput) {
  const input = ListPlannedSessionsInputSchema.parse(rawInput);
  return listPlannedSessionsByProgram(input.programId, input.userId, input.dateFrom, input.dateTo);
}
