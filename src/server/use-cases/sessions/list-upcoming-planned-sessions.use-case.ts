import { z } from "zod";

import { listUpcomingPlannedSessionsByUser } from "@/server/repositories";
import {
  addDaysDateOnlyUtc,
  getEndOfDayFromDateOnlyUtc,
  getStartOfTodayInAppTimeZone,
  normalizeDateOnlyUtc,
} from "@/server/use-cases/shared/date-only";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

const ListUpcomingPlannedSessionsInputSchema = z.object({
  userId: UuidLikeSchema,
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export type ListUpcomingPlannedSessionsInput = z.input<typeof ListUpcomingPlannedSessionsInputSchema>;

export async function listUpcomingPlannedSessionsUseCase(rawInput: ListUpcomingPlannedSessionsInput) {
  const input = ListUpcomingPlannedSessionsInputSchema.parse(rawInput);

  const defaultDateFrom = getStartOfTodayInAppTimeZone();
  const defaultDateTo = getEndOfDayFromDateOnlyUtc(addDaysDateOnlyUtc(defaultDateFrom, 6));

  const dateFrom = input.dateFrom ? normalizeDateOnlyUtc(input.dateFrom) : defaultDateFrom;
  const dateTo = input.dateTo ? getEndOfDayFromDateOnlyUtc(normalizeDateOnlyUtc(input.dateTo)) : defaultDateTo;

  if (dateFrom > dateTo) {
    throw badRequestError("dateFrom must be less than or equal to dateTo");
  }

  return listUpcomingPlannedSessionsByUser(input.userId, dateFrom, dateTo, input.limit);
}
