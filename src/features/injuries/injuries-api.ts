"use client";

import { fetchJson } from "@/features/shared/http-client";

export type InjuryIncidentItem = {
  id: string;
  user_id: string;
  linked_session_execution_id: string | null;
  linked_unit_execution_id: string | null;
  evidence_asset_id: string | null;
  status: "acute" | "monitoring" | "recovering" | "resolved" | "recurring";
  incident_type: "pain" | "strain" | "sprain" | "overuse" | "mobility_loss" | "other";
  title: string;
  body_region_tags: unknown;
  movement_context_tags: unknown;
  onset_at: string | null;
  pain_level_initial: number | null;
  mechanism_summary: string | null;
  symptom_summary: string | null;
  suspected_causes: unknown;
  clinical_diagnosis: string | null;
  current_restrictions: unknown;
  return_readiness_status: "not_ready" | "limited" | "graded_return" | "ready";
  resolved_at: string | null;
  retrospective_summary: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateInjuryPayload = {
  userId: string;
  title: string;
  status?: InjuryIncidentItem["status"];
  incidentType?: InjuryIncidentItem["incident_type"];
  bodyRegionTags?: string[];
  movementContextTags?: string[];
  painLevelInitial?: number;
  mechanismSummary?: string;
  symptomSummary?: string;
  suspectedCauses?: string[];
  currentRestrictions?: string[];
};

export async function createInjuryIncident(payload: CreateInjuryPayload) {
  return fetchJson<InjuryIncidentItem>("/api/injuries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listInjuryIncidents(userId: string, limit = 50) {
  return fetchJson<InjuryIncidentItem[]>(
    `/api/injuries?userId=${encodeURIComponent(userId)}&limit=${limit}`,
  );
}
