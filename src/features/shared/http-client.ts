"use client";

import { translateUiError } from "@/features/shared/ui-zh";

type FetchJsonOptions = {
  timeoutMs?: number;
};

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  _options?: FetchJsonOptions,
): Promise<T> {
  let response: Response;
  response = await fetch(input, {
    ...init,
    signal: init?.signal,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; debug?: string }
      | null;
    const message = payload?.error ?? `Request failed: ${response.status}`;
    const withDebug =
      process.env.NODE_ENV !== "production" && payload?.debug
        ? `${message} (${payload.debug})`
        : message;
    throw new Error(translateUiError(withDebug));
  }

  return response.json() as Promise<T>;
}
