import { z } from "zod";

import { listOverdueUnresolvedPlannedSessionsByUser } from "@/server/repositories";
import { getStartOfTodayInAppTimeZone } from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListOverduePlannedSessionsInputSchema = z.object({
  userId: UuidLikeSchema,
  limit: z.coerce.number().int().positive().max(20).default(5),
});

export type ListOverduePlannedSessionsInput = z.input<typeof ListOverduePlannedSessionsInputSchema>;

export async function listOverduePlannedSessionsUseCase(rawInput: ListOverduePlannedSessionsInput) {
  const input = ListOverduePlannedSessionsInputSchema.parse(rawInput);
  const sessions = await listOverdueUnresolvedPlannedSessionsByUser(
    input.userId,
    getStartOfTodayInAppTimeZone(),
    input.limit,
  );

  const earliestByProgram = new Map<string, string>();

  for (const session of sessions) {
    if (!earliestByProgram.has(session.program_id)) {
      earliestByProgram.set(session.program_id, session.id);
    }
  }

  return sessions.map((session) => {
    const earliestId = earliestByProgram.get(session.program_id) ?? session.id;
    const isActionable = earliestId === session.id;

    return {
      ...session,
      is_actionable: isActionable,
      waiting_for_session_id: isActionable ? null : earliestId,
      waiting_reason: isActionable ? null : "受前序逾期训练影响，需先处理更早的一条。",
    };
  });
}
