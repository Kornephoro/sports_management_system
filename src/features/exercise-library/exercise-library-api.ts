"use client";

import {
  ExerciseTagV1,
  MovementPatternV1,
  MuscleRegionV1,
} from "@/lib/exercise-library-standards";
import {
  ExerciseSelectionInput,
  ExerciseSuggestion,
} from "@/lib/exercise-selection-standards";
import {
  ActionCategoryFilterValue,
  ActionMovementFilterValue,
  ActionPrimaryMuscleFilterValue,
} from "@/lib/action-filter-standards";
import { ExerciseRecordingModeValue } from "@/lib/recording-mode-standards";
import { fetchJson } from "@/features/shared/http-client";

export type ExerciseLibraryItem = {
  id: string;
  userId: string;
  name: string;
  aliases: string[];
  recordingMode: ExerciseRecordingModeValue;
  defaultRecordMode: "reps" | "duration";
  defaultLoadModel: "absolute" | "bodyweight_plus";
  category: "compound" | "isolation";
  movementPattern: MovementPatternV1;
  primaryRegions: MuscleRegionV1[];
  secondaryRegions: MuscleRegionV1[];
  tags: ExerciseTagV1[];
  description: string | null;
  enabled: boolean;
  notes: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExerciseLibraryItemDetail = ExerciseLibraryItem & {
  weightTrendPoints: Array<{
    performedAt: string;
    value: number;
  }>;
  summary: {
    totalExecutions: number;
    latestPerformedAt: string | null;
    bestLoadValue: number | null;
    bestReps: number | null;
    bestDurationSeconds: number | null;
    trend: "up" | "flat" | "down" | "insufficient";
  };
  references: {
    template: Array<{
      unitTemplateId: string;
      unitName: string;
      sessionTemplateId: string;
      sessionTemplateName: string;
      blockId: string;
      blockName: string;
      programId: string;
      programName: string;
    }>;
    planned: Array<{
      plannedUnitId: string;
      plannedSessionId: string;
      sequenceIndex: number;
      sessionDate: string;
      status: string;
      selectedExerciseName: string | null;
      programId: string;
      programName: string;
    }>;
    recentUsage: Array<{
      sessionExecutionId: string;
      unitExecutionId: string;
      performedAt: string;
      completionStatus: string;
      plannedSessionId: string | null;
      sequenceIndex: number | null;
      programId: string | null;
      programName: string | null;
    }>;
  };
  governance: {
    duplicateCandidates: Array<{
      id: string;
      name: string;
    }>;
  };
};

export type UpsertExerciseLibraryItemPayload = {
  userId: string;
  name: string;
  aliases: string[];
  recordingMode?: ExerciseRecordingModeValue;
  defaultRecordMode?: "reps" | "duration";
  defaultLoadModel?: "absolute" | "bodyweight_plus";
  category: "compound" | "isolation";
  movementPattern: MovementPatternV1;
  primaryRegions: MuscleRegionV1[];
  secondaryRegions: MuscleRegionV1[];
  tags: ExerciseTagV1[];
  description?: string;
  notes?: string;
  enabled?: boolean;
};

export type ListExerciseLibraryItemsOptions = {
  query?: string;
  keyword?: string;
  enabled?: "true" | "false" | "all";
  recordingMode?: ExerciseRecordingModeValue | "all";
  recordMode?: "reps" | "duration" | "all";
  loadModel?: "absolute" | "bodyweight_plus" | "all";
  movementPattern?: MovementPatternV1 | "all";
  category?: ActionCategoryFilterValue | "all";
  movementPatterns?: ActionMovementFilterValue[];
  primaryMuscles?: ActionPrimaryMuscleFilterValue[];
  isBodyweight?: boolean;
  allowExtraLoad?: boolean;
  allowAssistance?: boolean;
};

export async function listExerciseLibraryItems(
  userId: string,
  options: ListExerciseLibraryItemsOptions = {},
) {
  const params = new URLSearchParams();
  params.set("userId", userId);
  if (options.query?.trim()) {
    params.set("query", options.query.trim());
  }
  if (options.keyword?.trim()) {
    params.set("keyword", options.keyword.trim());
  }
  if (options.enabled) {
    params.set("enabled", options.enabled);
  }
  if (options.recordingMode && options.recordingMode !== "all") {
    params.set("recordingMode", options.recordingMode);
  }
  if (options.recordMode && options.recordMode !== "all") {
    params.set("recordMode", options.recordMode);
  }
  if (options.loadModel && options.loadModel !== "all") {
    params.set("loadModel", options.loadModel);
  }
  if (options.movementPattern && options.movementPattern !== "all") {
    params.set("movementPattern", options.movementPattern);
  }
  if (options.category && options.category !== "all") {
    params.set("category", options.category);
  }
  for (const movement of options.movementPatterns ?? []) {
    params.append("movement_pattern", movement);
  }
  for (const muscle of options.primaryMuscles ?? []) {
    params.append("primary_muscles", muscle);
  }
  if (typeof options.isBodyweight === "boolean") {
    params.set("is_bodyweight", String(options.isBodyweight));
  }
  if (typeof options.allowExtraLoad === "boolean") {
    params.set("allow_extra_load", String(options.allowExtraLoad));
  }
  if (typeof options.allowAssistance === "boolean") {
    params.set("allow_assistance", String(options.allowAssistance));
  }
  return fetchJson<ExerciseLibraryItem[]>(`/api/exercise-library?${params.toString()}`);
}

export async function createExerciseLibraryItem(payload: UpsertExerciseLibraryItemPayload) {
  return fetchJson<ExerciseLibraryItem>("/api/exercise-library", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getExerciseLibraryItem(itemId: string, userId: string) {
  return fetchJson<ExerciseLibraryItemDetail>(
    `/api/exercise-library/${encodeURIComponent(itemId)}?userId=${encodeURIComponent(userId)}`,
  );
}

export async function updateExerciseLibraryItem(
  itemId: string,
  payload: Partial<UpsertExerciseLibraryItemPayload> & { userId: string },
) {
  return fetchJson<ExerciseLibraryItem>(`/api/exercise-library/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function setExerciseLibraryItemEnabled(
  itemId: string,
  payload: { userId: string; enabled: boolean },
) {
  return fetchJson<ExerciseLibraryItem>(
    `/api/exercise-library/${encodeURIComponent(itemId)}/enabled`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function suggestExercises(userId: string, payload: ExerciseSelectionInput) {
  return fetchJson<ExerciseSuggestion[]>("/api/exercise-library/suggest", {
    method: "POST",
    body: JSON.stringify({
      userId,
      ...payload,
    }),
  });
}
