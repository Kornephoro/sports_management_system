import { z } from "zod";

import { upsertOnboardingTrainingProfileByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

import {
  deriveProgressionLiteracy,
  deriveReturnToTrainingState,
  deriveSuggestedTrainingLevel,
  deriveTechniqueConfidence,
} from "./shared";

const ConfidenceSchema = z.enum(["low", "medium", "high"]);
const ExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
const EquipmentEnvironmentSchema = z.enum([
  "commercial_gym",
  "home_gym",
  "limited",
  "bodyweight_only",
]);
const PainStatusSchema = z.enum(["none", "minor", "active"]);
const MovementCompetencySchema = z.enum(["none", "basic", "confident"]);

const SaveOnboardingTrainingProfileInputSchema = z.object({
  userId: UuidLikeSchema,
  experienceLevel: ExperienceSchema,
  trainingAgeMonths: z.number().int().min(0).max(1200).nullable().optional(),
  recentFrequencyPerWeek: z.number().int().min(0).max(14).nullable().optional(),
  followedFormalProgram: z.boolean().nullable().optional(),
  tracksLoadAndReps: z.boolean().nullable().optional(),
  understandsRpeRir: z.boolean().nullable().optional(),
  weeklyTrainingDays: z.number().int().min(0).max(14).nullable().optional(),
  sessionDurationMin: z.number().int().min(0).max(600).nullable().optional(),
  detrainingGapDays: z.number().int().min(0).max(3650).nullable().optional(),
  recoveryConfidence: ConfidenceSchema,
  equipmentEnvironment: EquipmentEnvironmentSchema,
  currentPainStatus: PainStatusSchema,
  restrictedRegions: z.array(z.string().trim().min(1)).default([]),
  restrictedMovements: z.array(z.string().trim().min(1)).default([]),
  extraSports: z.array(z.string().trim().min(1)).default([]),
  movementCompetencies: z.object({
    squat: MovementCompetencySchema,
    hipHinge: MovementCompetencySchema,
    horizontalPush: MovementCompetencySchema,
    horizontalPull: MovementCompetencySchema,
    verticalPush: MovementCompetencySchema,
    verticalPull: MovementCompetencySchema,
  }),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type SaveOnboardingTrainingProfileInput = z.input<
  typeof SaveOnboardingTrainingProfileInputSchema
>;

function normalizeStringArray(items: string[]) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    values.push(trimmed);
  }

  return values;
}

export async function saveOnboardingTrainingProfileUseCase(
  rawInput: SaveOnboardingTrainingProfileInput,
) {
  const input = SaveOnboardingTrainingProfileInputSchema.parse(rawInput);

  const movementCompetencies = {
    squat: input.movementCompetencies.squat,
    hip_hinge: input.movementCompetencies.hipHinge,
    horizontal_push: input.movementCompetencies.horizontalPush,
    horizontal_pull: input.movementCompetencies.horizontalPull,
    vertical_push: input.movementCompetencies.verticalPush,
    vertical_pull: input.movementCompetencies.verticalPull,
  } as const;

  const techniqueConfidence = deriveTechniqueConfidence({
    movementCompetencies,
  });
  const progressionLiteracy = deriveProgressionLiteracy({
    followedFormalProgram: input.followedFormalProgram ?? null,
    tracksLoadAndReps: input.tracksLoadAndReps ?? null,
    understandsRpeRir: input.understandsRpeRir ?? null,
  });
  const returnToTrainingState = deriveReturnToTrainingState({
    detrainingGapDays: input.detrainingGapDays ?? null,
    currentPainStatus: input.currentPainStatus,
    restrictedRegionCount: input.restrictedRegions.length,
  });
  const suggestedLevel = deriveSuggestedTrainingLevel({
    trainingAgeMonths: input.trainingAgeMonths ?? null,
    recentFrequencyPerWeek: input.recentFrequencyPerWeek ?? null,
    techniqueConfidence,
    progressionLiteracy,
    followedFormalProgram: input.followedFormalProgram ?? null,
    returnToTrainingState,
  });

  return upsertOnboardingTrainingProfileByUser({
    user_id: input.userId,
    experience_level: input.experienceLevel,
    suggested_level: suggestedLevel,
    technique_confidence: techniqueConfidence,
    progression_literacy: progressionLiteracy,
    training_age_months: input.trainingAgeMonths ?? null,
    recent_frequency_per_week: input.recentFrequencyPerWeek ?? null,
    followed_formal_program: input.followedFormalProgram ?? null,
    tracks_load_and_reps: input.tracksLoadAndReps ?? null,
    understands_rpe_rir: input.understandsRpeRir ?? null,
    weekly_training_days: input.weeklyTrainingDays ?? null,
    session_duration_min: input.sessionDurationMin ?? null,
    detraining_gap_days: input.detrainingGapDays ?? null,
    return_to_training_state: returnToTrainingState,
    recovery_confidence: input.recoveryConfidence,
    equipment_environment: input.equipmentEnvironment,
    current_pain_status: input.currentPainStatus,
    restricted_regions: normalizeStringArray(input.restrictedRegions),
    restricted_movements: normalizeStringArray(input.restrictedMovements),
    extra_sports: normalizeStringArray(input.extraSports),
    movement_competencies: movementCompetencies,
    notes: input.notes ?? null,
  });
}
