"use client";

import { fetchJson } from "@/features/shared/http-client";

export type ProgramListItem = {
  id: string;
  name: string;
  sport_type: string;
  status: string;
  start_date: string;
  end_date: string | null;
  weekly_frequency_target: number | null;
  created_at: string;
  block_count: number;
  session_template_count: number;
  enabled_session_template_count: number;
  enabled_session_template_with_units_count: number;
  planning_ready: boolean;
};

export type ProgramDetail = {
  id: string;
  name: string;
  sport_type: string;
  status: string;
  start_date: string;
  end_date: string | null;
  goal: {
    id: string;
    name: string;
    goal_type: string;
    status: string;
  };
  blocks: Array<{
    id: string;
    sequence_no: number;
    name: string;
    block_type: string;
    session_templates: Array<{
      id: string;
      code: string;
      name: string;
      sequence_in_microcycle: number;
      enabled: boolean;
      training_unit_templates: Array<{
        id: string;
        sequence_no: number;
        name: string;
        is_key_unit: boolean;
        optional: boolean;
        notes: string | null;
        unit_role: string;
        unit_category: string;
        progress_track_key: string;
        progression_family: string;
        progression_policy_type: string;
        progression_policy_config: Record<string, unknown>;
        adjustment_policy_type: string;
        adjustment_policy_config: Record<string, unknown>;
        success_criteria: Record<string, unknown>;
        prescription_type: string;
        prescription_payload: Record<string, unknown>;
      }>;
    }>;
  }>;
};

export type UpsertTrainingUnitTemplatePayload = {
  userId: string;
  name?: string;
  exerciseLibraryItemId?: string;
  sourceTemplateLibraryItemId?: string;
  prescriptionType?: "sets_reps" | "sets_time";
  sets?: number;
  reps?: number;
  durationSeconds?: number;
  loadValue?: number | string;
  loadUnit?: string;
  targetRepsMin?: number;
  targetRepsMax?: number;
  rpeMin?: number;
  rpeMax?: number;
  unitRole?:
    | "main"
    | "secondary"
    | "accessory"
    | "skill"
    | "conditioning"
    | "warmup"
    | "cooldown"
    | "mobility"
    | "prehab";
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
  progressTrackKey?: string;
  notes?: string;
};

export type CreateProgramWorkflowPayload = {
  userId: string;
  programName: string;
  structure?: "weekly_1_day";
  templateLibraryItemId?: string;
  sportType?:
    | "strength"
    | "hypertrophy"
    | "running"
    | "swimming"
    | "racket"
    | "functional"
    | "mixed";
  startDate?: string;
};

export type CreateProgramWorkflowResponse = {
  goalId: string;
  programId: string;
  blockId: string;
  sessionTemplateId: string;
  program: {
    id: string;
    name: string;
  };
};

export async function listPrograms(userId: string) {
  return fetchJson<ProgramListItem[]>(`/api/programs?userId=${encodeURIComponent(userId)}`);
}

export async function getProgramDetail(userId: string, programId: string) {
  return fetchJson<ProgramDetail>(
    `/api/programs/${encodeURIComponent(programId)}?userId=${encodeURIComponent(userId)}`,
  );
}

export async function createProgramWorkflow(payload: CreateProgramWorkflowPayload) {
  return fetchJson<CreateProgramWorkflowResponse>("/api/programs/workflow-create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createTrainingUnitTemplate(
  sessionTemplateId: string,
  payload: UpsertTrainingUnitTemplatePayload,
) {
  return fetchJson<Record<string, unknown>>(
    `/api/session-templates/${encodeURIComponent(sessionTemplateId)}/training-unit-templates`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateTrainingUnitTemplate(
  unitTemplateId: string,
  payload: UpsertTrainingUnitTemplatePayload,
) {
  return fetchJson<Record<string, unknown>>(
    `/api/training-unit-templates/${encodeURIComponent(unitTemplateId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteTrainingUnitTemplate(unitTemplateId: string, userId: string) {
  return fetchJson<Record<string, unknown>>(
    `/api/training-unit-templates/${encodeURIComponent(unitTemplateId)}?userId=${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    },
  );
}
