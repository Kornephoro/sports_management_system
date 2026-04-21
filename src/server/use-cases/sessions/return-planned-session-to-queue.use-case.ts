import { SessionState } from "@prisma/client";
import { z } from "zod";

import {
  countSessionExecutionsByPlannedSessionForUser,
  getPlannedSessionWithUnitsById,
  updatePlannedSessionDate,
  updatePlannedSessionStatus,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const ReturnQueueTargetSchema = z.enum(["today", "next"]);

const ReturnPlannedSessionToQueueInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
  target: ReturnQueueTargetSchema.default("today"),
});

export type ReturnPlannedSessionToQueueInput = z.input<
  typeof ReturnPlannedSessionToQueueInputSchema
>;

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function buildQueueDate(target: z.infer<typeof ReturnQueueTargetSchema>) {
  const date = startOfToday();
  if (target === "next") {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

export async function returnPlannedSessionToQueueUseCase(
  rawInput: ReturnPlannedSessionToQueueInput,
) {
  const input = ReturnPlannedSessionToQueueInputSchema.parse(rawInput);

  const plannedSession = await getPlannedSessionWithUnitsById(
    input.plannedSessionId,
    input.userId,
  );
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }

  const executionCount = await countSessionExecutionsByPlannedSessionForUser(
    input.plannedSessionId,
    input.userId,
  );
  const nextStatus: SessionState = executionCount > 0 ? "partial" : "ready";

  await updatePlannedSessionDate(
    input.plannedSessionId,
    input.userId,
    buildQueueDate(input.target),
  );
  await updatePlannedSessionStatus(input.plannedSessionId, input.userId, nextStatus);

  return getPlannedSessionWithUnitsById(input.plannedSessionId, input.userId);
}
