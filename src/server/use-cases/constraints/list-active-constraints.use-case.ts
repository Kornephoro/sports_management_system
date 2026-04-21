import { z } from "zod";

import { listActiveConstraintProfilesByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListActiveConstraintsInputSchema = z.object({
  userId: UuidLikeSchema,
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ListActiveConstraintsInput = z.input<typeof ListActiveConstraintsInputSchema>;

export async function listActiveConstraintsUseCase(rawInput: ListActiveConstraintsInput) {
  const input = ListActiveConstraintsInputSchema.parse(rawInput);
  return listActiveConstraintProfilesByUser(input.userId, input.limit);
}
