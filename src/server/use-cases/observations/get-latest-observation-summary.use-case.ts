import { z } from "zod";

import { listLatestObservationsByMetrics } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const DEFAULT_METRIC_KEYS = ["bodyweight", "sleep_hours", "fatigue_score"] as const;

const GetLatestObservationSummaryInputSchema = z.object({
  userId: UuidLikeSchema,
  metricKeys: z.array(z.string().min(1)).optional(),
});

export type GetLatestObservationSummaryInput = z.input<typeof GetLatestObservationSummaryInputSchema>;

export async function getLatestObservationSummaryUseCase(rawInput: GetLatestObservationSummaryInput) {
  const input = GetLatestObservationSummaryInputSchema.parse(rawInput);
  const metricKeys = input.metricKeys && input.metricKeys.length > 0 ? input.metricKeys : [...DEFAULT_METRIC_KEYS];

  const latestObservations = await listLatestObservationsByMetrics(input.userId, metricKeys);

  return {
    userId: input.userId,
    metricsRequested: metricKeys,
    latestByMetric: metricKeys.map((metricKey) => ({
      metricKey,
      latest: latestObservations.find((observation) => observation.metric_key === metricKey) ?? null,
    })),
    generatedAt: new Date().toISOString(),
  };
}
