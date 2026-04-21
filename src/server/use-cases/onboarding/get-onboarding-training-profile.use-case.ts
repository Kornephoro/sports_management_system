import { z } from "zod";

import { getOnboardingTrainingProfileByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const GetOnboardingTrainingProfileInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type GetOnboardingTrainingProfileInput = z.input<
  typeof GetOnboardingTrainingProfileInputSchema
>;

export async function getOnboardingTrainingProfileUseCase(
  rawInput: GetOnboardingTrainingProfileInput,
) {
  const input = GetOnboardingTrainingProfileInputSchema.parse(rawInput);
  const profile = await getOnboardingTrainingProfileByUser(input.userId);

  return {
    profile,
    generatedAt: new Date().toISOString(),
  };
}
