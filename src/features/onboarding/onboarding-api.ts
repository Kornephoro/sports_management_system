"use client";

import { fetchJson } from "@/features/shared/http-client";

export type OnboardingTrainingProfile = {
  user_id: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  suggested_level: "beginner" | "intermediate" | "advanced";
  technique_confidence: "low" | "medium" | "high";
  progression_literacy: "low" | "medium" | "high";
  training_age_months: number | null;
  recent_frequency_per_week: number | null;
  followed_formal_program: boolean | null;
  tracks_load_and_reps: boolean | null;
  understands_rpe_rir: boolean | null;
  weekly_training_days: number | null;
  session_duration_min: number | null;
  detraining_gap_days: number | null;
  return_to_training_state: "no_break" | "short_break" | "long_break" | "rehab_return";
  recovery_confidence: "low" | "medium" | "high";
  equipment_environment: "commercial_gym" | "home_gym" | "limited" | "bodyweight_only";
  current_pain_status: "none" | "minor" | "active";
  restricted_regions: string[];
  restricted_movements: string[];
  extra_sports: string[];
  movement_competencies: {
    squat: "none" | "basic" | "confident";
    hip_hinge: "none" | "basic" | "confident";
    horizontal_push: "none" | "basic" | "confident";
    horizontal_pull: "none" | "basic" | "confident";
    vertical_push: "none" | "basic" | "confident";
    vertical_pull: "none" | "basic" | "confident";
  };
  notes: string | null;
  first_completed_at: string;
  updated_at: string;
};

export type GetOnboardingTrainingProfileResponse = {
  profile: OnboardingTrainingProfile | null;
  generatedAt: string;
};

export type SaveOnboardingTrainingProfilePayload = {
  userId: string;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  trainingAgeMonths?: number | null;
  recentFrequencyPerWeek?: number | null;
  followedFormalProgram?: boolean | null;
  tracksLoadAndReps?: boolean | null;
  understandsRpeRir?: boolean | null;
  weeklyTrainingDays?: number | null;
  sessionDurationMin?: number | null;
  detrainingGapDays?: number | null;
  recoveryConfidence: "low" | "medium" | "high";
  equipmentEnvironment: "commercial_gym" | "home_gym" | "limited" | "bodyweight_only";
  currentPainStatus: "none" | "minor" | "active";
  restrictedRegions?: string[];
  restrictedMovements?: string[];
  extraSports?: string[];
  movementCompetencies: {
    squat: "none" | "basic" | "confident";
    hipHinge: "none" | "basic" | "confident";
    horizontalPush: "none" | "basic" | "confident";
    horizontalPull: "none" | "basic" | "confident";
    verticalPush: "none" | "basic" | "confident";
    verticalPull: "none" | "basic" | "confident";
  };
  notes?: string | null;
};

export async function getOnboardingTrainingProfile(userId: string) {
  return fetchJson<GetOnboardingTrainingProfileResponse>(
    `/api/onboarding/training-profile?userId=${encodeURIComponent(userId)}`,
  );
}

export async function saveOnboardingTrainingProfile(
  payload: SaveOnboardingTrainingProfilePayload,
) {
  return fetchJson<OnboardingTrainingProfile>("/api/onboarding/training-profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
