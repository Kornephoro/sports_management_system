import { z } from "zod";

import { listObservationsByMetric } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListObservationsByMetricInputSchema = z.object({
  userId: UuidLikeSchema,
  metricKey: z.string().min(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListObservationsByMetricInput = z.input<typeof ListObservationsByMetricInputSchema>;

export async function listObservationsByMetricUseCase(rawInput: ListObservationsByMetricInput) {
  const input = ListObservationsByMetricInputSchema.parse(rawInput);
  return listObservationsByMetric(input.userId, input.metricKey, input.limit);
}
