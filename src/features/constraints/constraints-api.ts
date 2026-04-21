"use client";

import { fetchJson } from "@/features/shared/http-client";

export type ConstraintProfileItem = {
  id: string;
  user_id: string;
  status: "active" | "monitoring" | "resolved";
  title: string;
  domain: "mobility" | "stability" | "pain" | "injury" | "load_tolerance" | "return_to_training";
  body_region_tags: unknown;
  movement_tags: unknown;
  severity: "low" | "moderate" | "high";
  description: string | null;
  symptom_summary: string | null;
  restriction_rules: unknown;
  training_implications: unknown;
  rehab_focus_tags: unknown;
  maintenance_requirement: unknown;
  detected_from: "manual" | "coach" | "system_inference" | "image_parse";
  linked_injury_incident_id: string | null;
  started_at: string | null;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateConstraintPayload = {
  userId: string;
  title: string;
  domain: ConstraintProfileItem["domain"];
  severity?: ConstraintProfileItem["severity"];
  bodyRegionTags?: string[];
  movementTags?: string[];
  description?: string;
  symptomSummary?: string;
  restrictionRules?: Record<string, unknown>;
  trainingImplications?: Record<string, unknown>;
  rehabFocusTags?: string[];
  notes?: string;
};

export async function createConstraint(payload: CreateConstraintPayload) {
  return fetchJson<ConstraintProfileItem>("/api/constraints", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listActiveConstraints(userId: string, limit = 50) {
  return fetchJson<ConstraintProfileItem[]>(
    `/api/constraints/active?userId=${encodeURIComponent(userId)}&limit=${limit}`,
  );
}

export async function resolveConstraint(constraintProfileId: string, userId: string, notes?: string) {
  return fetchJson<ConstraintProfileItem>(
    `/api/constraints/${encodeURIComponent(constraintProfileId)}/resolve`,
    {
      method: "PATCH",
      body: JSON.stringify({
        userId,
        notes,
      }),
    },
  );
}

export async function linkConstraintToInjury(
  constraintProfileId: string,
  userId: string,
  injuryIncidentId: string,
) {
  return fetchJson<ConstraintProfileItem>(
    `/api/constraints/${encodeURIComponent(constraintProfileId)}/link-injury`,
    {
      method: "POST",
      body: JSON.stringify({
        userId,
        injuryIncidentId,
      }),
    },
  );
}
