import { z } from "zod";

import { getNextOrRecentPlannedSessionByUser } from "@/server/repositories";
import { getStartOfTodayInAppTimeZone } from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const GetNextOrRecentPlannedSessionInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type GetNextOrRecentPlannedSessionInput = z.input<
  typeof GetNextOrRecentPlannedSessionInputSchema
>;

export async function getNextOrRecentPlannedSessionUseCase(
  rawInput: GetNextOrRecentPlannedSessionInput,
) {
  const input = GetNextOrRecentPlannedSessionInputSchema.parse(rawInput);
  return getNextOrRecentPlannedSessionByUser(input.userId, getStartOfTodayInAppTimeZone());
}
