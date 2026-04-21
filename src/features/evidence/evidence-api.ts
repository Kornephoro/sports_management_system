"use client";

import { fetchJson } from "@/features/shared/http-client";
import { translateUiError } from "@/features/shared/ui-zh";

export type EvidenceAssetItem = {
  id: string;
  user_id: string;
  asset_type: "image" | "screenshot" | "pdf" | "other";
  source_app: string | null;
  domain_hint: "training" | "nutrition" | "body_metric" | "health" | "rehab" | "other";
  captured_at: string | null;
  uploaded_at: string;
  storage_url: string;
  mime_type: string;
  file_hash: string | null;
  parse_status: "pending" | "parsed" | "needs_review" | "confirmed" | "rejected" | "failed";
  parser_version: string | null;
  parsed_summary: unknown;
  confidence: string | null;
  linked_entity_type: "session_execution" | "unit_execution" | "observation" | "injury_incident" | "none" | null;
  linked_entity_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ConfirmEvidenceResponse = {
  evidence: EvidenceAssetItem;
  observation: {
    id: string;
    metric_key: string;
    value_numeric: string | null;
    unit: string | null;
  };
};

export async function listEvidenceAssets(userId: string, limit = 20) {
  return fetchJson<EvidenceAssetItem[]>(
    `/api/evidence?userId=${encodeURIComponent(userId)}&limit=${limit}`,
  );
}

export async function uploadEvidenceFile(params: {
  userId: string;
  file: File;
  domainHint: EvidenceAssetItem["domain_hint"];
  sourceApp?: string;
  notes?: string;
}) {
  const formData = new FormData();
  formData.set("userId", params.userId);
  formData.set("file", params.file);
  formData.set("domainHint", params.domainHint);
  if (params.sourceApp) {
    formData.set("sourceApp", params.sourceApp);
  }
  if (params.notes) {
    formData.set("notes", params.notes);
  }

  const response = await fetch("/api/evidence/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(translateUiError(payload?.error ?? `Request failed: ${response.status}`));
  }

  return (await response.json()) as EvidenceAssetItem;
}

export async function triggerEvidenceMockParse(
  evidenceAssetId: string,
  userId: string,
  targetStatus: "parsed" | "needs_review",
) {
  return fetchJson<EvidenceAssetItem>(`/api/evidence/${encodeURIComponent(evidenceAssetId)}/parse/mock`, {
    method: "POST",
    body: JSON.stringify({
      userId,
      targetStatus,
    }),
  });
}

export async function updateEvidenceParseStatus(
  evidenceAssetId: string,
  userId: string,
  parseStatus: "pending" | "parsed" | "needs_review" | "failed",
) {
  return fetchJson<EvidenceAssetItem>(`/api/evidence/${encodeURIComponent(evidenceAssetId)}/parse-status`, {
    method: "PATCH",
    body: JSON.stringify({
      userId,
      parseStatus,
    }),
  });
}

export async function confirmEvidence(evidenceAssetId: string, userId: string) {
  return fetchJson<ConfirmEvidenceResponse>(`/api/evidence/${encodeURIComponent(evidenceAssetId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({
      userId,
    }),
  });
}

export async function rejectEvidence(evidenceAssetId: string, userId: string, reason?: string) {
  return fetchJson<EvidenceAssetItem>(`/api/evidence/${encodeURIComponent(evidenceAssetId)}/reject`, {
    method: "POST",
    body: JSON.stringify({
      userId,
      reason,
    }),
  });
}
