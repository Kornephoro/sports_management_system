import { z } from "zod";

import {
  deletePlannedSessionById,
  getPlannedSessionDeleteContext,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const DeletePlannedSessionInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
});

export type DeletePlannedSessionInput = z.input<typeof DeletePlannedSessionInputSchema>;

export async function deletePlannedSessionUseCase(rawInput: DeletePlannedSessionInput) {
  const input = DeletePlannedSessionInputSchema.parse(rawInput);

  const plannedSession = await getPlannedSessionDeleteContext(input.plannedSessionId, input.userId);
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }

  if (plannedSession._count.session_executions > 0) {
    throw badRequestError("无法删除：该已安排训练已有关联训练记录，请先删除对应训练记录。");
  }

  const deleted = await deletePlannedSessionById(input.plannedSessionId, input.userId);

  return {
    deleted: deleted.deletedSessions > 0,
    plannedSessionId: input.plannedSessionId,
  };
}
