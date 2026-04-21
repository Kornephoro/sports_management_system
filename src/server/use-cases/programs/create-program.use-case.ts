import { ProgramSource, ProgramStatus, ProgramType, RecoveryPolicyType, SportType } from "@prisma/client";
import { z } from "zod";

import { createProgram } from "@/server/repositories";
import { buildProgramCreateDataWithDefaults } from "@/server/services/programs/program-defaults.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const CreateProgramInputSchema = z.object({
  userId: UuidLikeSchema,
  goalId: UuidLikeSchema,
  name: z.string().min(1),
  sportType: z.nativeEnum(SportType),
  programType: z.nativeEnum(ProgramType).optional(),
  status: z.nativeEnum(ProgramStatus).optional(),
  version: z.number().int().positive().optional(),
  parentProgramId: UuidLikeSchema.optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  durationWeeks: z.number().int().positive().optional(),
  weeklyFrequencyTarget: z.number().int().positive().optional(),
  weeklyExposureMix: z.unknown().optional(),
  defaultRecoveryPolicyType: z.nativeEnum(RecoveryPolicyType).optional(),
  defaultRecoveryPolicyConfig: z.unknown().optional(),
  defaultAdaptationPolicyConfig: z.unknown().optional(),
  constraintAwarePlanning: z.boolean().optional(),
  source: z.nativeEnum(ProgramSource).optional(),
  notes: z.string().optional(),
});

export type CreateProgramInput = z.infer<typeof CreateProgramInputSchema>;

export async function createProgramUseCase(rawInput: CreateProgramInput) {
  const input = CreateProgramInputSchema.parse(rawInput);

  const data = buildProgramCreateDataWithDefaults({
    ...input,
    startDate: input.startDate,
    endDate: input.endDate,
    weeklyExposureMix: input.weeklyExposureMix as Parameters<
      typeof buildProgramCreateDataWithDefaults
    >[0]["weeklyExposureMix"],
    defaultRecoveryPolicyConfig: input.defaultRecoveryPolicyConfig as Parameters<
      typeof buildProgramCreateDataWithDefaults
    >[0]["defaultRecoveryPolicyConfig"],
    defaultAdaptationPolicyConfig: input.defaultAdaptationPolicyConfig as Parameters<
      typeof buildProgramCreateDataWithDefaults
    >[0]["defaultAdaptationPolicyConfig"],
  });

  return createProgram(data);
}
