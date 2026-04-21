import { promises as fs } from "node:fs";
import path from "node:path";

export type OpenAiSettingsRecord = {
  user_id: string;
  base_url: string;
  api_key: string;
  model: string;
  created_at: string;
  updated_at: string;
};

type UpsertOpenAiSettingsInput = {
  user_id: string;
  base_url: string;
  api_key: string;
  model: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "openai-settings.json");

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRecord(value: unknown): OpenAiSettingsRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const userId = toNonEmptyString(record.user_id);
  const baseUrl = toNonEmptyString(record.base_url);
  const apiKey = toNonEmptyString(record.api_key);
  const model = toNonEmptyString(record.model);

  if (!userId || !baseUrl || !apiKey || !model) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    user_id: userId,
    base_url: baseUrl,
    api_key: apiKey,
    model,
    created_at: toNonEmptyString(record.created_at) ?? now,
    updated_at: toNonEmptyString(record.updated_at) ?? now,
  };
}

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, "[]", "utf8");
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  if (!raw.trim()) {
    return [] as OpenAiSettingsRecord[];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [] as OpenAiSettingsRecord[];
  }
  return parsed
    .map(normalizeRecord)
    .filter((item): item is OpenAiSettingsRecord => item !== null)
    .sort((a, b) => a.user_id.localeCompare(b.user_id));
}

async function writeStore(items: OpenAiSettingsRecord[]) {
  await ensureStoreFile();
  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function getOpenAiSettingsByUser(userId: string) {
  const items = await readStore();
  return items.find((item) => item.user_id === userId) ?? null;
}

export async function upsertOpenAiSettingsByUser(input: UpsertOpenAiSettingsInput) {
  const items = await readStore();
  const now = new Date().toISOString();
  const existingIndex = items.findIndex((item) => item.user_id === input.user_id);
  const nextRecord: OpenAiSettingsRecord = {
    user_id: input.user_id,
    base_url: input.base_url.trim().replace(/\/+$/, ""),
    api_key: input.api_key.trim(),
    model: input.model.trim(),
    created_at: existingIndex >= 0 ? items[existingIndex].created_at : now,
    updated_at: now,
  };

  if (existingIndex >= 0) {
    items[existingIndex] = nextRecord;
  } else {
    items.push(nextRecord);
  }

  await writeStore(items);
  return nextRecord;
}
