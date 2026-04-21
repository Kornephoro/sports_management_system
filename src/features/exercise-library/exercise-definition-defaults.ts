import { ExerciseLibraryItem } from "@/features/exercise-library/exercise-library-api";

export type ExerciseRecordMode = "sets_reps" | "sets_time";
export type ExerciseLoadModel = "external" | "bodyweight_plus_external";
export type ExerciseWeightUnit = "kg" | "lbs";

type ExerciseDefinitionSource = "exercise_library" | "unit_fallback";

export type ExerciseDefinitionDefaults = {
  defaultRecordMode: ExerciseRecordMode;
  defaultLoadModel: ExerciseLoadModel;
  defaultWeightUnit: ExerciseWeightUnit;
  source: {
    recordMode: ExerciseDefinitionSource;
    loadModel: ExerciseDefinitionSource;
    weightUnit: ExerciseDefinitionSource;
  };
};

type ResolveExerciseDefinitionDefaultsArgs = {
  exercise: Pick<ExerciseLibraryItem, "defaultRecordMode" | "defaultLoadModel"> | null | undefined;
  fallbackRecordMode?: ExerciseRecordMode;
  fallbackLoadModel?: ExerciseLoadModel;
  fallbackWeightUnit?: ExerciseWeightUnit;
};

export type ExerciseDefinitionInheritanceView = {
  inheritedRecordMode: ExerciseRecordMode;
  inheritedLoadModel: ExerciseLoadModel;
  inheritedWeightUnit: ExerciseWeightUnit;
  isRecordModeOverridden: boolean;
  isLoadModelOverridden: boolean;
  isWeightUnitOverridden: boolean;
  source: ExerciseDefinitionDefaults["source"];
};

export function resolveExerciseDefinitionDefaults(
  args: ResolveExerciseDefinitionDefaultsArgs,
): ExerciseDefinitionDefaults {
  const defaultRecordMode: ExerciseRecordMode =
    args.exercise
      ? args.exercise.defaultRecordMode === "duration"
        ? "sets_time"
        : "sets_reps"
      : args.fallbackRecordMode ?? "sets_reps";
  const defaultLoadModel: ExerciseLoadModel =
    args.exercise
      ? args.exercise.defaultLoadModel === "bodyweight_plus"
        ? "bodyweight_plus_external"
        : "external"
      : args.fallbackLoadModel ?? "external";
  const defaultWeightUnit: ExerciseWeightUnit = args.fallbackWeightUnit ?? "kg";

  return {
    defaultRecordMode,
    defaultLoadModel,
    defaultWeightUnit,
    source: {
      recordMode: args.exercise ? "exercise_library" : "unit_fallback",
      loadModel: args.exercise ? "exercise_library" : "unit_fallback",
      weightUnit: "unit_fallback",
    },
  };
}

export function resolveExerciseDefinitionInheritanceView(args: {
  defaults: ExerciseDefinitionDefaults;
  effectiveRecordMode: ExerciseRecordMode;
  effectiveLoadModel: ExerciseLoadModel;
  effectiveWeightUnit: ExerciseWeightUnit;
}): ExerciseDefinitionInheritanceView {
  return {
    inheritedRecordMode: args.defaults.defaultRecordMode,
    inheritedLoadModel: args.defaults.defaultLoadModel,
    inheritedWeightUnit: args.defaults.defaultWeightUnit,
    isRecordModeOverridden: args.effectiveRecordMode !== args.defaults.defaultRecordMode,
    isLoadModelOverridden: args.effectiveLoadModel !== args.defaults.defaultLoadModel,
    isWeightUnitOverridden: args.effectiveWeightUnit !== args.defaults.defaultWeightUnit,
    source: args.defaults.source,
  };
}
