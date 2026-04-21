import { NextResponse } from "next/server";

import {
  ACTION_CATEGORY_FILTER_VALUES,
  ACTION_MOVEMENT_FILTER_VALUES,
  ACTION_PRIMARY_MUSCLE_FILTER_VALUES,
  ActionCategoryFilterValue,
  ActionMovementFilterValue,
  ActionPrimaryMuscleFilterValue,
} from "@/lib/action-filter-standards";
import {
  MovementPatternV1,
  MOVEMENT_PATTERN_VALUES,
} from "@/lib/exercise-library-standards";
import {
  EXERCISE_RECORDING_MODE_VALUES,
  ExerciseRecordingModeValue,
} from "@/lib/recording-mode-standards";
import { handleRouteError } from "@/server/http/route-error-handler";
import {
  createExerciseLibraryItemUseCase,
  listExerciseLibraryItemsUseCase,
} from "@/server/use-cases";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const query = url.searchParams.get("query") ?? undefined;
    const keyword = url.searchParams.get("keyword") ?? undefined;
    const enabled = url.searchParams.get("enabled") ?? undefined;
    const recordingMode = url.searchParams.get("recordingMode") ?? undefined;
    const recordMode = url.searchParams.get("recordMode") ?? undefined;
    const loadModel = url.searchParams.get("loadModel") ?? undefined;
    const movementPattern = url.searchParams.get("movementPattern") ?? undefined;
    const category = url.searchParams.get("category") ?? undefined;
    const movementPatternFilters = [
      ...url.searchParams.getAll("movement_pattern"),
      ...url.searchParams.getAll("movement_pattern[]"),
    ].filter((value, index, arr) => value.trim().length > 0 && arr.indexOf(value) === index);
    const primaryMuscleFilters = [
      ...url.searchParams.getAll("primary_muscles"),
      ...url.searchParams.getAll("primary_muscles[]"),
    ].filter((value, index, arr) => value.trim().length > 0 && arr.indexOf(value) === index);
    const isBodyweight = url.searchParams.get("is_bodyweight");
    const allowExtraLoad = url.searchParams.get("allow_extra_load");
    const allowAssistance = url.searchParams.get("allow_assistance");

    const movementPatternValue: MovementPatternV1 | undefined =
      movementPattern && (MOVEMENT_PATTERN_VALUES as readonly string[]).includes(movementPattern)
        ? (movementPattern as MovementPatternV1)
        : undefined;
    const categoryValue: ActionCategoryFilterValue | undefined =
      category && (ACTION_CATEGORY_FILTER_VALUES as readonly string[]).includes(category)
        ? (category as ActionCategoryFilterValue)
        : undefined;
    const movementPatternFilterValues: ActionMovementFilterValue[] = movementPatternFilters
      .filter((value): value is ActionMovementFilterValue =>
        (ACTION_MOVEMENT_FILTER_VALUES as readonly string[]).includes(value),
      );
    const primaryMuscleFilterValues: ActionPrimaryMuscleFilterValue[] = primaryMuscleFilters
      .filter((value): value is ActionPrimaryMuscleFilterValue =>
        (ACTION_PRIMARY_MUSCLE_FILTER_VALUES as readonly string[]).includes(value),
      );
    const recordingModeValue: ExerciseRecordingModeValue | undefined =
      recordingMode && (EXERCISE_RECORDING_MODE_VALUES as readonly string[]).includes(recordingMode)
        ? (recordingMode as ExerciseRecordingModeValue)
        : undefined;
    const isBodyweightValue =
      isBodyweight === "true" ? true : isBodyweight === "false" ? false : undefined;
    const allowExtraLoadValue =
      allowExtraLoad === "true" ? true : allowExtraLoad === "false" ? false : undefined;
    const allowAssistanceValue =
      allowAssistance === "true" ? true : allowAssistance === "false" ? false : undefined;

    if (!userId) {
      throw badRequestError("Missing required query parameter: userId");
    }

    const items = await listExerciseLibraryItemsUseCase({
      userId,
      query,
      keyword,
      enabled: enabled === "true" || enabled === "false" || enabled === "all" ? enabled : undefined,
      recordingMode: recordingModeValue,
      recordMode: recordMode === "reps" || recordMode === "duration" ? recordMode : undefined,
      loadModel:
        loadModel === "absolute" || loadModel === "bodyweight_plus"
          ? loadModel
          : undefined,
      movementPattern: movementPatternValue,
      category: categoryValue,
      movementPatterns: movementPatternFilterValues,
      primaryMuscles: primaryMuscleFilterValues,
      isBodyweight: isBodyweightValue,
      allowExtraLoad: allowExtraLoadValue,
      allowAssistance: allowAssistanceValue,
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const created = await createExerciseLibraryItemUseCase(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
