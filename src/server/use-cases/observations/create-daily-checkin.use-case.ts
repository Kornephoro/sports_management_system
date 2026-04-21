import { z } from "zod";

import { createObservationUseCase } from "@/server/use-cases/observations/create-observation.use-case";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

const CreateDailyCheckinInputSchema = z.object({
  userId: UuidLikeSchema,
  date: z.string().min(1).optional(),
  bodyweight: z.number().positive().optional(),
  waistCircumference: z.number().positive().optional(),
  restingHeartRate: z.number().positive().optional(),
  bodyweightUnit: z.enum(["kg", "lbs"]).optional(),
});

export type CreateDailyCheckinInput = z.input<typeof CreateDailyCheckinInputSchema>;

function resolveObservedAt(dateText?: string) {
  if (!dateText) {
    return new Date();
  }
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  if (!matched) {
    return new Date(dateText);
  }
  const [, year, month, day] = matched;
  const now = new Date();
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));
}

export async function createDailyCheckinUseCase(rawInput: CreateDailyCheckinInput) {
  const input = CreateDailyCheckinInputSchema.parse(rawInput);
  const observedAt = resolveObservedAt(input.date);

  const jobs: Array<Promise<unknown>> = [];

  if (input.bodyweight !== undefined) {
    jobs.push(
      createObservationUseCase({
        userId: input.userId,
        observedAt,
        observationDomain: "body",
        metricKey: "bodyweight",
        valueNumeric: input.bodyweight,
        unit: input.bodyweightUnit ?? "kg",
        source: "manual",
      }),
    );
  }
  if (input.waistCircumference !== undefined) {
    jobs.push(
      createObservationUseCase({
        userId: input.userId,
        observedAt,
        observationDomain: "body",
        metricKey: "waist_circumference",
        valueNumeric: input.waistCircumference,
        unit: "cm",
        source: "manual",
      }),
    );
  }
  if (input.restingHeartRate !== undefined) {
    jobs.push(
      createObservationUseCase({
        userId: input.userId,
        observedAt,
        observationDomain: "recovery",
        metricKey: "resting_heart_rate",
        valueNumeric: input.restingHeartRate,
        unit: "bpm",
        source: "manual",
      }),
    );
  }

  if (jobs.length === 0) {
    throw badRequestError("At least one daily check-in metric is required");
  }

  const created = await Promise.all(jobs);
  return {
    createdCount: created.length,
    observedAt: observedAt.toISOString(),
  };
}
