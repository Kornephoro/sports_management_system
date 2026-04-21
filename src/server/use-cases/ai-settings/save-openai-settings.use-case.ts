import { z } from "zod";

import { getOpenAiSettingsByUser, upsertOpenAiSettingsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError } from "@/server/use-cases/shared/use-case-error";

const SaveOpenAiSettingsInputSchema = z.object({
  userId: UuidLikeSchema,
  baseUrl: z.string().trim().url(),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().optional(),
});

export type SaveOpenAiSettingsInput = z.input<typeof SaveOpenAiSettingsInputSchema>;

export async function saveOpenAiSettingsUseCase(rawInput: SaveOpenAiSettingsInput) {
  const input = SaveOpenAiSettingsInputSchema.parse(rawInput);
  const existing = await getOpenAiSettingsByUser(input.userId);
  const nextApiKey = input.apiKey?.trim() || existing?.api_key || "";

  if (!nextApiKey) {
    throw badRequestError("请先填写 API Key，再保存接口配置。");
  }

  const record = await upsertOpenAiSettingsByUser({
    user_id: input.userId,
    base_url: input.baseUrl,
    model: input.model,
    api_key: nextApiKey,
  });

  return {
    configured: true,
    baseUrl: record.base_url,
    model: record.model,
    hasApiKey: true,
    apiKeyMasked: `${record.api_key.slice(0, 4)}••••${record.api_key.slice(-4)}`,
    updatedAt: record.updated_at,
  };
}
