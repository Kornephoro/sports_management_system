import { z } from "zod";

import {
  createSessionExecutionUseCase
} from "@/server/use-cases/executions/create-session-execution.use-case";
import {
  getActiveSessionExecutionByPlannedSessionUseCase
} from "@/server/use-cases/executions/get-active-session-execution-by-planned-session.use-case";
import {
  getSessionExecutionDetailUseCase
} from "@/server/use-cases/executions/get-session-execution-detail.use-case";
import {
  getPlannedSessionDetailUseCase
} from "@/server/use-cases/sessions/get-planned-session-detail.use-case";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const BootstrapSessionExecutionWorkbenchInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
  performedAt: z.coerce.date().optional(),
  overallFeeling: z.enum(["easy", "normal", "hard"]).optional(),
});

export type BootstrapSessionExecutionWorkbenchInput = z.input<
  typeof BootstrapSessionExecutionWorkbenchInputSchema
>;

export async function bootstrapSessionExecutionWorkbenchUseCase(
  rawInput: BootstrapSessionExecutionWorkbenchInput,
) {
  const input = BootstrapSessionExecutionWorkbenchInputSchema.parse(rawInput);

  const plannedSessionPromise = getPlannedSessionDetailUseCase({
    userId: input.userId,
    plannedSessionId: input.plannedSessionId,
  });

  const activeExecution = await getActiveSessionExecutionByPlannedSessionUseCase({
    userId: input.userId,
    plannedSessionId: input.plannedSessionId,
  });

  let executionId = activeExecution?.id;
  let reusedExisting = Boolean(activeExecution);

  if (!executionId) {
    const created = await createSessionExecutionUseCase({
      userId: input.userId,
      plannedSessionId: input.plannedSessionId,
      performedAt: input.performedAt ?? new Date(),
      overallFeeling: input.overallFeeling ?? "normal",
    });
    executionId = created.sessionExecution.id;
    reusedExisting = created.reusedExisting;
  }

  const [plannedSession, executionDetail] = await Promise.all([
    plannedSessionPromise,
    getSessionExecutionDetailUseCase({
      userId: input.userId,
      sessionExecutionId: executionId,
    }),
  ]);

  return {
    plannedSession,
    executionDetail,
    sessionExecutionId: executionId,
    reusedExisting,
  };
}
