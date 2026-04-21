import { z } from "zod";

import {
  getPlannedSessionWithUnitsById,
  updateAllPlannedUnitsStatus,
  updatePlannedSessionStatus,
  updatePlannedUnitStatusByIds,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const MarkableSessionStatusSchema = z.enum(["completed", "partial", "skipped"]);
const UnitStateSchema = z.enum([
  "planned",
  "completed",
  "partial",
  "skipped",
  "failed",
  "replaced",
  "dropped",
]);

const MarkPlannedSessionStatusInputSchema = z.object({
  userId: UuidLikeSchema,
  plannedSessionId: UuidLikeSchema,
  status: MarkableSessionStatusSchema,
  unitStatuses: z
    .array(
      z.object({
        plannedUnitId: UuidLikeSchema,
        status: UnitStateSchema,
      }),
    )
    .optional(),
});

export type MarkPlannedSessionStatusInput = z.infer<typeof MarkPlannedSessionStatusInputSchema>;

export async function markPlannedSessionStatusUseCase(rawInput: MarkPlannedSessionStatusInput) {
  const input = MarkPlannedSessionStatusInputSchema.parse(rawInput);

  const plannedSession = await getPlannedSessionWithUnitsById(input.plannedSessionId, input.userId);
  if (!plannedSession) {
    throw notFoundError("Planned session not found");
  }

  await updatePlannedSessionStatus(input.plannedSessionId, input.userId, input.status);

  if (input.unitStatuses && input.unitStatuses.length > 0) {
    await updatePlannedUnitStatusByIds(
      input.plannedSessionId,
      input.unitStatuses.map((item) => ({
        plannedUnitId: item.plannedUnitId,
        status: item.status,
      })),
    );
  } else if (input.status === "completed" || input.status === "skipped") {
    const targetUnitStatus = input.status === "completed" ? "completed" : "skipped";
    await updateAllPlannedUnitsStatus(input.plannedSessionId, targetUnitStatus);
  }

  return getPlannedSessionWithUnitsById(input.plannedSessionId, input.userId);
}
