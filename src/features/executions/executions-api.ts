"use client";

import { fetchJson } from "@/features/shared/http-client";
import type { SessionExecutionDetailResponse } from "@/features/sessions/sessions-api";

export type { SessionExecutionDetailResponse };

export type ExecutionHistoryItem = {
  id: string;
  performed_at: string;
  completion_status: string;
  actual_duration_min: number | null;
  notes: string | null;
  post_session_state?: Record<string, unknown> | null;
  program: {
    id: string;
    name: string;
  } | null;
  planned_session: {
    id: string;
    sequence_index: number;
    session_date: string;
    status: string;
  } | null;
  unit_executions: Array<{
    id: string;
    sequence_no: number;
    completion_status: string;
    actual_unit_name: string | null;
    actual_payload: Record<string, unknown> | null;
    result_flags: Record<string, unknown> | null;
    notes: string | null;
    perceived_exertion: string | null;
    pain_score: number | null;
    planned_unit: {
      id: string;
      sequence_no: number;
      selected_exercise_name: string | null;
      target_payload: Record<string, unknown>;
      progression_snapshot: Record<string, unknown> | null;
    } | null;
  }>;
};

export type ExecutionListView = "summary" | "full";

export type SessionExecutionCompletionStatus =
  | "completed"
  | "partial"
  | "skipped"
  | "aborted"
  | "extra";

export type UnitExecutionCompletionStatus =
  | "completed"
  | "partial"
  | "skipped"
  | "failed"
  | "replaced";

export async function listRecentSessionExecutions(
  userId: string,
  limit = 20,
  view: ExecutionListView = "summary",
) {
  return fetchJson<ExecutionHistoryItem[]>(
    `/api/executions?userId=${encodeURIComponent(userId)}&limit=${encodeURIComponent(String(limit))}&view=${encodeURIComponent(view)}`,
  );
}

export async function getSessionExecutionDetail(sessionExecutionId: string, userId: string) {
  return fetchJson<SessionExecutionDetailResponse>(
    `/api/session-executions/${encodeURIComponent(sessionExecutionId)}?userId=${encodeURIComponent(userId)}`,
  );
}

export type UpdateSessionExecutionPayload = {
  userId: string;
  completionStatus?: SessionExecutionCompletionStatus;
  actualDurationMin?: number;
  notes?: string;
};

export type UpdateUnitExecutionPayload = {
  userId: string;
  completionStatus?: UnitExecutionCompletionStatus;
  notes?: string;
  perceivedExertion?: number;
  painScore?: number;
  checkoff?: {
    deviationTags?: Array<
      | "less_sets"
      | "less_reps"
      | "increase_load"
      | "decrease_load"
      | "add_sets"
      | "add_reps"
      | "replace_exercise"
      | "execution_method_change"
      | "less_duration"
    >;
    executionMethod?: "superset" | "drop_set" | "rest_pause" | "other" | null;
    reasonTags?: Array<
      | "fatigue"
      | "time_limit"
      | "poor_state"
      | "pain_discomfort"
      | "equipment_limit"
      | "venue_limit"
      | "other"
    >;
    actualSets?: number;
    actualReps?: number;
    actualDurationSeconds?: number;
    loadChange?: "increase" | "decrease" | null;
    addedSets?: number;
    addedReps?: number;
    replacedExerciseName?: string;
    executionMethodNote?: string;
    notes?: string;
  };
};

export async function updateSessionExecution(
  sessionExecutionId: string,
  payload: UpdateSessionExecutionPayload,
) {
  return fetchJson<{
    id: string;
    completion_status: string;
    actual_duration_min: number | null;
    notes: string | null;
  }>(
    `/api/session-executions/${encodeURIComponent(sessionExecutionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateUnitExecution(
  unitExecutionId: string,
  payload: UpdateUnitExecutionPayload,
) {
  return fetchJson<ExecutionHistoryItem["unit_executions"][number]>(
    `/api/unit-executions/${encodeURIComponent(unitExecutionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteSessionExecution(sessionExecutionId: string, userId: string) {
  return fetchJson<{ deleted: boolean; sessionExecutionId: string; deletedUnitExecutionCount: number }>(
    `/api/session-executions/${encodeURIComponent(sessionExecutionId)}?userId=${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    },
  );
}
