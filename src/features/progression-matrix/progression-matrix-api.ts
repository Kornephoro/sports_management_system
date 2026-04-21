"use client";

import { fetchJson } from "@/features/shared/http-client";

export type ProgressionMatrixSession = {
  id: string;
  sequence_index: number;
  session_date: string;
  status: string;
  latest_execution: {
    id: string;
    completion_status: string;
    performed_at: string;
  } | null;
  program: {
    id: string;
    name: string;
  } | null;
  planned_units: Array<{
    id: string;
    sequence_no: number;
    selected_exercise_name: string | null;
    progression_snapshot: Record<string, unknown> | null;
    matrix_cell_payload: {
      plan: {
        snapshot: Record<string, unknown>;
      };
      actual: {
        has_execution_data: boolean;
        session_execution_id: string | null;
        performed_at: string | null;
        outcome: "success_met" | "partial" | "failed" | "skipped" | null;
        status_symbol: "✔" | "◐" | "✖" | "⤼" | "-";
        status_label: string;
        planned_set_count: number;
        completed_planned_count: number;
        skipped_planned_count: number;
        pending_planned_count: number;
        extra_set_count: number;
        completed_reps_total: number;
        completed_duration_total: number;
        core_set: {
          planned_reps: number | null;
          actual_reps: number | null;
          planned_weight: number | null;
          actual_weight: number | null;
        } | null;
      };
      deviation: {
        items: Array<{
          key: "sets" | "reps" | "load" | "extra";
          summary: string;
        }>;
        display_items: string[];
      };
      result: {
        outcome: "success_met" | "partial" | "failed" | "skipped" | null;
        is_meets_target: boolean | null;
        hold_reason: string | null;
        retry_flag: boolean;
        impact_hint: string;
      };
    };
  }>;
};

export type ListProgressionMatrixSessionsOptions = {
  window?: 7 | 10 | 14;
  includeRecent?: boolean;
  recentCount?: number;
};

export async function listProgressionMatrixSessions(
  userId: string,
  options?: ListProgressionMatrixSessionsOptions,
) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);

  if (options?.window !== undefined) {
    searchParams.set("window", String(options.window));
  }
  if (options?.includeRecent !== undefined) {
    searchParams.set("includeRecent", String(options.includeRecent));
  }
  if (options?.recentCount !== undefined) {
    searchParams.set("recentCount", String(options.recentCount));
  }

  return fetchJson<ProgressionMatrixSession[]>(
    `/api/progression-matrix?${searchParams.toString()}`,
  );
}
