import { z } from "zod";

import { getPlannedSessionWithUnitsAndExecutionCountById } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const GetPlannedSessionDetailInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
});

export type GetPlannedSessionDetailInput = z.input<typeof GetPlannedSessionDetailInputSchema>;

export async function getPlannedSessionDetailUseCase(rawInput: GetPlannedSessionDetailInput) {
  const input = GetPlannedSessionDetailInputSchema.parse(rawInput);
  const plannedSession = await getPlannedSessionWithUnitsAndExecutionCountById(
    input.plannedSessionId,
    input.userId,
  );
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }
  return plannedSession;
}
