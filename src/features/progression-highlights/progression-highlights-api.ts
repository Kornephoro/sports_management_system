"use client";

import { fetchJson } from "@/features/shared/http-client";

export type ProgressionHighlightSession = {
  id: string;
  sequence_index: number;
  session_date: string;
  status: string;
  program: {
    id: string;
    name: string;
  } | null;
  planned_units: Array<{
    id: string;
    sequence_no: number;
    selected_exercise_name: string | null;
    progression_snapshot: Record<string, unknown> | null;
  }>;
};

export type ProgressionHighlightRange = "week" | "next_10" | "next_14_days";

export type ListProgressionHighlightSessionsOptions = {
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export async function listProgressionHighlightSessions(
  userId: string,
  options?: ListProgressionHighlightSessionsOptions,
) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);

  if (options?.dateFrom) {
    searchParams.set("dateFrom", options.dateFrom);
  }
  if (options?.dateTo) {
    searchParams.set("dateTo", options.dateTo);
  }
  if (options?.limit !== undefined) {
    searchParams.set("limit", String(options.limit));
  }

  return fetchJson<ProgressionHighlightSession[]>(
    `/api/planned-sessions/upcoming?${searchParams.toString()}`,
  );
}
