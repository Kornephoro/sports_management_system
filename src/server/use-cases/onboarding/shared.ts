import {
  OnboardingConfidenceLevel,
  OnboardingMovementCompetency,
  OnboardingPainStatus,
  OnboardingReturnState,
  OnboardingTrainingExperienceLevel,
} from "@/server/repositories";

function toCompetencyScore(value: OnboardingMovementCompetency) {
  if (value === "confident") return 2;
  if (value === "basic") return 1;
  return 0;
}

export function deriveTechniqueConfidence(args: {
  movementCompetencies: Record<string, OnboardingMovementCompetency>;
}): OnboardingConfidenceLevel {
  const total = Object.values(args.movementCompetencies).reduce(
    (sum, item) => sum + toCompetencyScore(item),
    0,
  );
  if (total >= 9) return "high";
  if (total >= 4) return "medium";
  return "low";
}

export function deriveProgressionLiteracy(args: {
  followedFormalProgram: boolean | null;
  tracksLoadAndReps: boolean | null;
  understandsRpeRir: boolean | null;
}): OnboardingConfidenceLevel {
  const score = [
    args.followedFormalProgram,
    args.tracksLoadAndReps,
    args.understandsRpeRir,
  ].filter(Boolean).length;
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export function deriveReturnToTrainingState(args: {
  detrainingGapDays: number | null;
  currentPainStatus: OnboardingPainStatus;
  restrictedRegionCount: number;
}) {
  if (args.currentPainStatus === "active" && args.restrictedRegionCount > 0) {
    return "rehab_return" as OnboardingReturnState;
  }
  if ((args.detrainingGapDays ?? 0) >= 84) {
    return "long_break" as OnboardingReturnState;
  }
  if ((args.detrainingGapDays ?? 0) >= 14) {
    return "short_break" as OnboardingReturnState;
  }
  return "no_break" as OnboardingReturnState;
}

export function deriveSuggestedTrainingLevel(args: {
  trainingAgeMonths: number | null;
  recentFrequencyPerWeek: number | null;
  techniqueConfidence: OnboardingConfidenceLevel;
  progressionLiteracy: OnboardingConfidenceLevel;
  followedFormalProgram: boolean | null;
  returnToTrainingState: OnboardingReturnState;
}) {
  let score = 0;
  if ((args.trainingAgeMonths ?? 0) >= 24) score += 2;
  else if ((args.trainingAgeMonths ?? 0) >= 6) score += 1;
  if ((args.recentFrequencyPerWeek ?? 0) >= 4) score += 1;
  else if ((args.recentFrequencyPerWeek ?? 0) >= 2) score += 0.5;
  if (args.techniqueConfidence === "high") score += 1.5;
  else if (args.techniqueConfidence === "medium") score += 0.5;
  if (args.progressionLiteracy === "high") score += 1.5;
  else if (args.progressionLiteracy === "medium") score += 0.5;
  if (args.followedFormalProgram) score += 1;
  if (args.returnToTrainingState === "long_break" || args.returnToTrainingState === "rehab_return") {
    score -= 1.5;
  } else if (args.returnToTrainingState === "short_break") {
    score -= 0.5;
  }

  if (score >= 5) {
    return "advanced" as OnboardingTrainingExperienceLevel;
  }
  if (score >= 2) {
    return "intermediate" as OnboardingTrainingExperienceLevel;
  }
  return "beginner" as OnboardingTrainingExperienceLevel;
}
