import { InjuryStatus } from "@prisma/client";
import { z } from "zod";

import { listInjuryIncidentsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListInjuryIncidentsInputSchema = z.object({
  userId: UuidLikeSchema,
  status: z.nativeEnum(InjuryStatus).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ListInjuryIncidentsInput = z.input<typeof ListInjuryIncidentsInputSchema>;

export async function listInjuryIncidentsUseCase(rawInput: ListInjuryIncidentsInput) {
  const input = ListInjuryIncidentsInputSchema.parse(rawInput);
  return listInjuryIncidentsByUser(input.userId, input.status, input.limit);
}
