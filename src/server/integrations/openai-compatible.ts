import { UseCaseError } from "@/server/use-cases/shared/use-case-error";

export type OpenAiCompatibleSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionOptions = {
  maxTokens?: number;
  temperature?: number;
  expectJson?: boolean;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function stripJsonFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractMessageContent(payload: unknown) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null || Array.isArray(firstChoice)) {
    return null;
  }

  const message = (firstChoice as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return null;
  }

  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const text = (item as Record<string, unknown>).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("")
      .trim();
  }
  return null;
}

export async function runOpenAiCompatibleChatCompletion(
  settings: OpenAiCompatibleSettings,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 400,
        ...(options.expectJson ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    const rawText = await response.text();
    const parsed = rawText.trim().length > 0 ? JSON.parse(rawText) : null;

    if (!response.ok) {
      const upstreamMessage =
        typeof parsed?.error?.message === "string"
          ? parsed.error.message
          : typeof parsed?.message === "string"
            ? parsed.message
            : rawText || `HTTP ${response.status}`;
      throw new UseCaseError(`AI 接口调用失败：${upstreamMessage}`, "UPSTREAM_ERROR", 502);
    }

    const content = extractMessageContent(parsed);
    if (!content) {
      throw new UseCaseError("AI 接口返回内容为空", "UPSTREAM_ERROR", 502);
    }

    return content;
  } catch (error) {
    if (error instanceof UseCaseError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new UseCaseError("AI 接口响应超时，请稍后重试。", "UPSTREAM_TIMEOUT", 504);
    }
    throw new UseCaseError(
      error instanceof Error ? `AI 接口调用失败：${error.message}` : "AI 接口调用失败",
      "UPSTREAM_ERROR",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function runOpenAiCompatibleJsonCompletion<T>(
  settings: OpenAiCompatibleSettings,
  messages: ChatMessage[],
) {
  const content = await runOpenAiCompatibleChatCompletion(settings, messages, {
    expectJson: true,
    temperature: 0.1,
    maxTokens: 700,
  });
  return JSON.parse(stripJsonFence(content)) as T;
}
