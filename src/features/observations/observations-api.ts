"use client";

import { fetchJson } from "@/features/shared/http-client";

export type ObservationItem = {
  id: string;
  observed_at: string;
  observation_domain: string;
  metric_key: string;
  value_numeric: string | null;
  value_text: string | null;
  value_json: unknown;
  unit: string | null;
  source: string;
  notes: string | null;
  created_at: string;
};

export type CreateObservationPayload = {
  userId: string;
  observedAt: string;
  observationDomain: "body" | "recovery" | "nutrition" | "health" | "lifestyle" | "rehab";
  metricKey: string;
  valueNumeric?: number;
  valueText?: string;
  valueJson?: unknown;
  unit?: string;
  source?: "manual" | "device" | "image_parse" | "import_";
  notes?: string;
};

export type LatestObservationSummary = {
  userId: string;
  metricsRequested: string[];
  latestByMetric: Array<{
    metricKey: string;
    latest: ObservationItem | null;
  }>;
  generatedAt: string;
};

export async function createObservation(payload: CreateObservationPayload) {
  return fetchJson<ObservationItem>("/api/observations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listObservationsByMetric(userId: string, metricKey: string, limit = 20) {
  return fetchJson<ObservationItem[]>(
    `/api/observations?userId=${encodeURIComponent(userId)}&metricKey=${encodeURIComponent(metricKey)}&limit=${limit}`,
  );
}

export async function getLatestObservationSummary(userId: string, metricKeys?: string[]) {
  const metricKeysQuery = metricKeys && metricKeys.length > 0 ? `&metricKeys=${metricKeys.join(",")}` : "";
  return fetchJson<LatestObservationSummary>(
    `/api/observations/summary/latest?userId=${encodeURIComponent(userId)}${metricKeysQuery}`,
  );
}
