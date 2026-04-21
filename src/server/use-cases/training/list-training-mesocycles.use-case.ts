import { z } from "zod";

import { listMesocyclesByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListTrainingMesocyclesInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type ListTrainingMesocyclesInput = z.input<
  typeof ListTrainingMesocyclesInputSchema
>;

function daysBetween(startIso: string, endIso: string | null) {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date();
  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export async function listTrainingMesocyclesUseCase(
  rawInput: ListTrainingMesocyclesInput,
) {
  const input = ListTrainingMesocyclesInputSchema.parse(rawInput);
  const rows = await listMesocyclesByUser(input.userId);

  const mapped = rows.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    startedAt: item.started_at,
    endedAt: item.ended_at,
    primaryPackageName: item.primary_package_name,
    programId: item.program_id,
    notes: item.notes,
    deloadCount: item.deload_events.length,
    hasActiveDeload: item.deload_events.some((event) => event.status === "active"),
    durationDays: daysBetween(item.started_at, item.ended_at),
    durationWeeks: Math.max(1, Math.ceil((daysBetween(item.started_at, item.ended_at) + 1) / 7)),
    endReason: item.end_reason,
  }));

  const active = mapped.find((item) => item.status === "active") ?? null;
  const archived = mapped.filter((item) => item.status === "closed");

  return {
    active,
    archived,
    summary: {
      archivedCount: archived.length,
      totalDeloadCount: mapped.reduce((sum, item) => sum + item.deloadCount, 0),
      averageArchivedWeeks:
        archived.length > 0
          ? Number(
              (
                archived.reduce((sum, item) => sum + item.durationWeeks, 0) /
                archived.length
              ).toFixed(1),
            )
          : 0,
      totalTrackedWeeks: mapped.reduce((sum, item) => sum + item.durationWeeks, 0),
    },
  };
}
