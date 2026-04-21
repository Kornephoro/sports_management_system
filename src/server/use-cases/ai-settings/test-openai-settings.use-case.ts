import { z } from "zod";

import { runOpenAiCompatibleChatCompletion } from "@/server/integrations/openai-compatible";
import { getOpenAiSettingsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

const TestOpenAiSettingsInputSchema = z.object({
  userId: UuidLikeSchema,
  baseUrl: z.string().trim().url(),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().optional(),
});

export type TestOpenAiSettingsInput = z.input<typeof TestOpenAiSettingsInputSchema>;

export async function testOpenAiSettingsUseCase(rawInput: TestOpenAiSettingsInput) {
  const input = TestOpenAiSettingsInputSchema.parse(rawInput);
  const existing = await getOpenAiSettingsByUser(input.userId);
  const apiKey = input.apiKey?.trim() || existing?.api_key || "";

  if (!apiKey) {
    throw badRequestError("请填写 API Key，或先保存一个可用的接口配置。");
  }

  const content = await runOpenAiCompatibleChatCompletion(
    {
      baseUrl: input.baseUrl,
      model: input.model,
      apiKey,
    },
    [
      {
        role: "system",
        content: "You are a connection test assistant. Reply with a very short acknowledgement.",
      },
      {
        role: "user",
        content: "请回复：连接正常",
      },
    ],
    {
      maxTokens: 20,
      temperature: 0,
    },
  );

  return {
    ok: true,
    message: content.trim(),
  };
}
