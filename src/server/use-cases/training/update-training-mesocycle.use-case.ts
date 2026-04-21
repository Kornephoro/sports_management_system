import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getActiveMesocycleByUser, updateMesocycleByIdForUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const UpdateTrainingMesocycleInputSchema = z.object({
  userId: UuidLikeSchema,
  mesocycleId: UuidLikeSchema,
  action: z.enum(["start_deload", "end_deload", "end_cycle"]),
  reason: z
    .enum([
      "recovery_risk",
      "subjective_fatigue",
      "planned",
      "manual",
      "other",
      "manual_complete",
      "fatigue_management",
      "goal_switch",
      "injury_or_constraint",
      "schedule_change",
    ])
    .optional(),
  note: z.string().trim().max(500).optional(),
});

export type UpdateTrainingMesocycleInput = z.input<typeof UpdateTrainingMesocycleInputSchema>;

export async function updateTrainingMesocycleUseCase(rawInput: UpdateTrainingMesocycleInput) {
  const input = UpdateTrainingMesocycleInputSchema.parse(rawInput);
  const active = await getActiveMesocycleByUser(input.userId);
  if (!active || active.id !== input.mesocycleId) {
    throw notFoundError("当前中周期不存在或已结束");
  }

  if (input.action === "start_deload") {
    if (active.deload_events.some((item) => item.status === "active")) {
      throw badRequestError("当前已经处于减载中");
    }
    const nextDeloadEvents = [
      ...active.deload_events,
      {
        id: randomUUID(),
        status: "active" as const,
        started_at: new Date().toISOString(),
        ended_at: null,
        reason:
          input.reason === "recovery_risk" ||
          input.reason === "subjective_fatigue" ||
          input.reason === "planned" ||
          input.reason === "manual" ||
          input.reason === "other"
            ? input.reason
            : "manual",
        note: input.note?.trim() || null,
      },
    ];
    return updateMesocycleByIdForUser(input.mesocycleId, input.userId, {
      deload_events: nextDeloadEvents,
    });
  }

  if (input.action === "end_deload") {
    const activeDeload = active.deload_events.find((item) => item.status === "active");
    if (!activeDeload) {
      throw badRequestError("当前没有正在进行的减载");
    }
    const nextDeloadEvents = active.deload_events.map((item) =>
      item.id === activeDeload.id
        ? {
            ...item,
            status: "ended" as const,
            ended_at: new Date().toISOString(),
            note: input.note?.trim() || item.note,
          }
        : item,
    );
    return updateMesocycleByIdForUser(input.mesocycleId, input.userId, {
      deload_events: nextDeloadEvents,
    });
  }

  const nextDeloadEvents = active.deload_events.map((item) =>
    item.status === "active"
      ? {
          ...item,
          status: "ended" as const,
          ended_at: new Date().toISOString(),
        }
      : item,
  );

  return updateMesocycleByIdForUser(input.mesocycleId, input.userId, {
    status: "closed",
    ended_at: new Date().toISOString(),
    end_reason:
      input.reason === "manual_complete" ||
      input.reason === "fatigue_management" ||
      input.reason === "goal_switch" ||
      input.reason === "injury_or_constraint" ||
      input.reason === "schedule_change" ||
      input.reason === "other"
        ? input.reason
        : "manual_complete",
    notes: input.note?.trim() || active.notes,
    deload_events: nextDeloadEvents,
  });
}
