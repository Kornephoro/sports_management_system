"use client";

import { fetchJson } from "@/features/shared/http-client";

export type PlannedSessionItem = {
  id: string;
  sequence_index: number;
  session_date: string;
  status: string;
  planned_duration_min: number | null;
  objective_summary: string | null;
  planned_units: Array<{
    id: string;
    sequence_no: number;
    status: string;
    selected_exercise_name: string | null;
    target_payload: Record<string, unknown>;
    progression_snapshot?: Record<string, unknown> | null;
    required?: boolean;
    exercise_library_item_id?: string | null;
  }>;
  _count: {
    session_executions: number;
  };
};

export type GeneratePlannedSessionsPayload = {
  userId: string;
  startDate: string;
  sessionCount: number;
  rotationQuota?: number;
  replaceFutureUnexecuted?: boolean;
  generationReason?: "initial_generation" | "rescheduled" | "manual_add" | "adapted";
};

export type CreateSessionExecutionPayload = {
  userId: string;
  performedAt: string;
  overallFeeling: "easy" | "normal" | "hard";
  actualDurationMin?: number;
  notes?: string;
};

export type BootstrapSessionExecutionWorkbenchPayload = {
  userId: string;
  performedAt?: string;
  overallFeeling?: "easy" | "normal" | "hard";
};

export type BootstrapSessionExecutionWorkbenchResponse = {
  plannedSession: PlannedSessionItem;
  executionDetail: SessionExecutionDetailResponse;
  sessionExecutionId: string;
  reusedExisting: boolean;
};

export type SessionExecutionResponse = {
  id: string;
  planned_session_id: string | null;
  completion_status: string;
  performed_at: string;
  actual_duration_min?: number | null;
  notes?: string | null;
  is_reused?: boolean;
};

export type SessionExecutionSetStatus = "pending" | "completed" | "skipped" | "extra";

export type SessionExecutionSet = {
  id: string;
  session_execution_id: string;
  planned_unit_id: string | null;
  set_index: number;
  planned_set_type: string | null;
  planned_reps: number | null;
  planned_weight: string | null;
  planned_rpe: string | null;
  planned_rest_seconds: number | null;
  planned_tempo: string | null;
  actual_reps: number | null;
  actual_weight: string | null;
  actual_rpe: string | null;
  actual_rest_seconds: number | null;
  actual_tempo: string | null;
  status: SessionExecutionSetStatus;
  is_extra_set: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionExecutionDetailResponse = {
  session: {
    id: string;
    user_id: string;
    planned_session_id: string | null;
    program_id: string | null;
    block_id: string | null;
    performed_at: string;
    completion_status: string;
    actual_duration_min: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
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
  };
  units: Array<{
    planned_unit: {
      id: string;
      sequence_no: number;
      unit_template_id: string | null;
      progress_track_id: string | null;
      selected_exercise_name: string | null;
      target_payload: Record<string, unknown>;
      status: string;
      required: boolean;
    };
    sets: SessionExecutionSet[];
    all_sets_completed: boolean;
  }>;
};

export type UpdateSessionExecutionSetPayload = {
  userId: string;
  actualReps?: number | null;
  actualWeight?: number | null;
  actualRpe?: number | null;
  actualRestSeconds?: number | null;
  actualTempo?: string | null;
  status?: SessionExecutionSetStatus;
  note?: string;
};

export type AddSessionExecutionSetPayload = {
  userId: string;
  sessionExecutionId: string;
  plannedUnitId: string;
  basedOnSetId?: string;
  isExtraSet?: boolean;
};

export type FinalizeSessionExecutionPayload = {
  userId: string;
  actualDurationMin?: number;
  notes?: string;
};

export type FinalizeSessionExecutionResponse = {
  sessionExecution: {
    id: string;
    completionStatus: "completed" | "partial" | "skipped" | "aborted" | "extra";
    actualDurationMin: number | null;
    notes: string | null;
  };
  summary: {
    sessionCompletionStatus: "completed" | "partial" | "skipped";
    totals: {
      totalUnits: number;
      completedUnits: number;
      inProgressUnits: number;
      pendingUnits: number;
      skippedUnits: number;
      totalSets: number;
      completedSets: number;
      skippedSets: number;
      pendingSets: number;
      extraSets: number;
    };
    units: Array<{
      plannedUnitId: string;
      sequenceNo: number;
      exerciseName: string | null;
      status: "pending" | "in_progress" | "completed" | "skipped";
      outcome: "success_met" | "partial" | "failed" | "skipped";
      totalSets: number;
      completedSets: number;
      skippedSets: number;
      pendingSets: number;
      extraSets: number;
    }>;
    generatedUnitExecutions: boolean;
    existingUnitExecutionCount: number;
    aiFollowup?: {
      confirmedAnchors: number;
      refreshedFutureSessions: number;
    };
  };
};

export type LatestPlannedSessionExecutionResponse = {
  id: string;
  planned_session_id: string | null;
  completion_status: string;
  performed_at: string;
  actual_duration_min: number | null;
  notes: string | null;
  created_at?: string;
  unit_execution_count: number;
  is_active?: boolean;
};

export type MarkPlannedSessionStatusPayload = {
  userId: string;
  status: "completed" | "partial" | "skipped";
};

export type ReschedulePlannedSessionPayload = {
  userId: string;
  sessionDate: string;
};

export type ReturnPlannedSessionToQueuePayload = {
  userId: string;
  target: "today" | "next";
};

export type UpdatePlannedSessionPlanUnitPayload = {
  id?: string;
  selectedExerciseName: string;
  exerciseLibraryItemId?: string;
  progressTrackKey?: string;
  progressionFamily?:
    | "strict_load"
    | "threshold"
    | "exposure"
    | "performance"
    | "autoregulated";
  progressionPolicyType?:
    | "linear_load_step"
    | "linear_periodization_step"
    | "scripted_cycle"
    | "double_progression"
    | "total_reps_threshold"
    | "add_set_then_load"
    | "reps_then_external_load"
    | "duration_threshold"
    | "bodyweight_reps_progression"
    | "hold_or_manual"
    | "manual";
  progressionPolicyConfig?: Record<string, unknown>;
  adjustmentPolicyType?: "always" | "rotating_pool" | "gated" | "manual";
  adjustmentPolicyConfig?: Record<string, unknown>;
  successCriteria?: Record<string, unknown>;
  setStructure?: Array<{
    type: string;
    reps?: number | { min: number; max: number };
    durationSeconds?: number;
    weightMode?: "absolute" | "relative_to_working";
    weight?: number;
    relativeIntensityRatio?: number;
    tempo?: [number, number, number, number];
    assistWeight?: number;
    rpe?: number;
    restSeconds?: number;
    participatesInProgression?: boolean;
    notes?: string;
  }>;
  sets: number;
  reps?: number;
  durationSeconds?: number;
  loadModel?: "external" | "bodyweight_plus_external";
  loadValue?: number;
  loadUnit?: "kg" | "lbs";
  additionalLoadValue?: number;
  additionalLoadUnit?: "kg" | "lbs";
  targetRepsMin?: number;
  targetRepsMax?: number;
  rpeMin?: number;
  rpeMax?: number;
  notes?: string;
  required?: boolean;
};

export type UpdatePlannedSessionPlanPayload = {
  userId: string;
  plannedDurationMin?: number;
  objectiveSummary?: string;
  notes?: string;
  units: UpdatePlannedSessionPlanUnitPayload[];
};

export type CreateUnitExecutionPayload = {
  plannedUnitId: string;
  completionStatus: "completed" | "partial" | "skipped";
  notes?: string;
  perceivedExertion?: number;
  painScore?: number;
  actualPayload?: Record<string, unknown>;
  resultFlags?: Record<string, unknown>;
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
    executionMethod?: "superset" | "drop_set" | "rest_pause" | "other";
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
    loadChange?: "increase" | "decrease";
    addedSets?: number;
    addedReps?: number;
    replacedExerciseName?: string;
    executionMethodNote?: string;
    notes?: string;
  };
};

export type CreateUnitExecutionsPayload = {
  userId: string;
  unitExecutions: CreateUnitExecutionPayload[];
};

export type UnitExecutionResponse = {
  id: string;
  session_execution_id: string;
  planned_unit_id: string | null;
  completion_status: string;
  perceived_exertion: string | null;
  pain_score: number | null;
  notes: string | null;
};

export async function listPlannedSessions(userId: string, programId: string) {
  return fetchJson<PlannedSessionItem[]>(
    `/api/programs/${encodeURIComponent(programId)}/planned-sessions?userId=${encodeURIComponent(userId)}`,
  );
}

export async function getPlannedSessionDetail(plannedSessionId: string, userId: string) {
  return fetchJson<PlannedSessionItem>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}?userId=${encodeURIComponent(userId)}`,
  );
}

export async function generatePlannedSessions(programId: string, payload: GeneratePlannedSessionsPayload) {
  return fetchJson<PlannedSessionItem[]>(
    `/api/programs/${encodeURIComponent(programId)}/planned-sessions/generate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function createSessionExecution(plannedSessionId: string, payload: CreateSessionExecutionPayload) {
  return fetchJson<SessionExecutionResponse>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/executions`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function bootstrapSessionExecutionWorkbench(
  plannedSessionId: string,
  payload: BootstrapSessionExecutionWorkbenchPayload,
) {
  return fetchJson<BootstrapSessionExecutionWorkbenchResponse>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/executions/bootstrap`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getLatestSessionExecutionByPlannedSession(
  plannedSessionId: string,
  userId: string,
) {
  return fetchJson<LatestPlannedSessionExecutionResponse | null>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/executions?userId=${encodeURIComponent(
      userId,
    )}&mode=latest`,
  );
}

export async function getActiveSessionExecutionByPlannedSession(
  plannedSessionId: string,
  userId: string,
) {
  return fetchJson<LatestPlannedSessionExecutionResponse | null>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/executions?userId=${encodeURIComponent(
      userId,
    )}&mode=active`,
  );
}

export async function createUnitExecutions(
  sessionExecutionId: string,
  payload: CreateUnitExecutionsPayload,
) {
  return fetchJson<UnitExecutionResponse[]>(
    `/api/session-executions/${encodeURIComponent(sessionExecutionId)}/unit-executions`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getSessionExecutionDetail(sessionExecutionId: string, userId: string) {
  return fetchJson<SessionExecutionDetailResponse>(
    `/api/session-executions/${encodeURIComponent(sessionExecutionId)}?userId=${encodeURIComponent(userId)}`,
  );
}

export async function updateSessionExecutionSet(
  setId: string,
  payload: UpdateSessionExecutionSetPayload,
) {
  return fetchJson<SessionExecutionSet>(
    `/api/session-execution-sets/${encodeURIComponent(setId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function addSessionExecutionSet(payload: AddSessionExecutionSetPayload) {
  return fetchJson<SessionExecutionSet>(
    `/api/session-execution-sets`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function finalizeSessionExecution(
  sessionExecutionId: string,
  payload: FinalizeSessionExecutionPayload,
) {
  return fetchJson<FinalizeSessionExecutionResponse>(
    `/api/session-executions/${encodeURIComponent(sessionExecutionId)}/finalize`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function markPlannedSessionStatus(
  plannedSessionId: string,
  payload: MarkPlannedSessionStatusPayload,
) {
  return fetchJson<PlannedSessionItem>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function reschedulePlannedSession(
  plannedSessionId: string,
  payload: ReschedulePlannedSessionPayload,
) {
  return fetchJson<PlannedSessionItem>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/reschedule`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function returnPlannedSessionToQueue(
  plannedSessionId: string,
  payload: ReturnPlannedSessionToQueuePayload,
) {
  return fetchJson<PlannedSessionItem>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/return-to-queue`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deletePlannedSession(plannedSessionId: string, userId: string) {
  return fetchJson<{ deleted: boolean; plannedSessionId: string }>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}?userId=${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function updatePlannedSessionPlan(
  plannedSessionId: string,
  payload: UpdatePlannedSessionPlanPayload,
) {
  return fetchJson<PlannedSessionItem>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/plan`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
