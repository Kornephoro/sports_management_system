"use client";

import { fetchJson } from "@/features/shared/http-client";

export type OpenAiSettingsResponse = {
  configured: boolean;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  updatedAt: string | null;
};

export async function getOpenAiSettings(userId: string) {
  return fetchJson<OpenAiSettingsResponse>(
    `/api/ai/openai/settings?userId=${encodeURIComponent(userId)}`,
  );
}

export async function saveOpenAiSettings(payload: {
  userId: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}) {
  return fetchJson<OpenAiSettingsResponse>("/api/ai/openai/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function testOpenAiSettings(payload: {
  userId: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}) {
  return fetchJson<{ ok: boolean; message: string }>("/api/ai/openai/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateRecoveryAiSummary(userId: string) {
  return fetchJson<{
    overallState: "stable" | "watch" | "high";
    label: string;
    summary: string;
    actions: string[];
    watchItems: string[];
    confidence: "low" | "medium" | "high";
  }>("/api/ai/recovery-summary", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}
