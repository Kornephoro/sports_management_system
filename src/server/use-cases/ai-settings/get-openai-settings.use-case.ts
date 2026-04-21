import { z } from "zod";

import { getOpenAiSettingsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const GetOpenAiSettingsInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type GetOpenAiSettingsInput = z.input<typeof GetOpenAiSettingsInputSchema>;

function maskApiKey(value: string) {
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export async function getOpenAiSettingsUseCase(rawInput: GetOpenAiSettingsInput) {
  const input = GetOpenAiSettingsInputSchema.parse(rawInput);
  const settings = await getOpenAiSettingsByUser(input.userId);

  return {
    configured: Boolean(settings),
    baseUrl: settings?.base_url ?? "https://api.openai.com/v1",
    model: settings?.model ?? "gpt-4.1-mini",
    hasApiKey: Boolean(settings?.api_key),
    apiKeyMasked: settings?.api_key ? maskApiKey(settings.api_key) : null,
    updatedAt: settings?.updated_at ?? null,
  };
}
