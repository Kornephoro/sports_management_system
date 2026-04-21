import { z } from "zod";

import { listRecentSessionExecutionsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListRecentSessionExecutionsInputSchema = z.object({
  userId: UuidLikeSchema,
  limit: z.coerce.number().int().positive().max(50).default(20),
  view: z.enum(["summary", "full"]).default("summary"),
});

export type ListRecentSessionExecutionsInput = z.input<typeof ListRecentSessionExecutionsInputSchema>;

export async function listRecentSessionExecutionsUseCase(rawInput: ListRecentSessionExecutionsInput) {
  const input = ListRecentSessionExecutionsInputSchema.parse(rawInput);
  return listRecentSessionExecutionsByUser(input.userId, input.limit, input.view);
}
