import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { TEMPLATE_SPLIT_TYPE_VALUES } from "@/lib/template-library-standards";

type TemplateLibrarySplitTypeStoreRecord = {
  id: string;
  user_id: string;
  key: string;
  label: string;
  builtin: boolean;
  created_at: string;
  updated_at: string;
};

type TemplateLibraryRawRecord = {
  id: string;
  user_id: string;
  split_type: string;
  raw: Record<string, unknown>;
};

export type TemplateLibrarySplitTypeRecord = {
  key: string;
  label: string;
  builtin: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
  template_count: number;
};

type CreateSplitTypeInput = {
  user_id: string;
  label: string;
  key?: string;
};

type UpdateSplitTypeInput = {
  user_id: string;
  key: string;
  label: string;
};

type DeleteSplitTypeInput = {
  user_id: string;
  key: string;
  migrate_to_key?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const SPLIT_TYPE_STORE_FILE = path.join(DATA_DIR, "template-library-split-types.json");
const TEMPLATE_LIBRARY_STORE_FILE = path.join(DATA_DIR, "template-library.json");

const DEFAULT_SPLIT_TYPE_DEFS: Array<{ key: string; label: string; builtin: boolean }> = [
  { key: "full_body", label: "全身", builtin: true },
  { key: "upper_lower", label: "上下肢分化", builtin: true },
  { key: "push_pull_legs", label: "推拉腿", builtin: true },
  { key: "custom", label: "自定义", builtin: true },
];

function asRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeSplitTypeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SPLIT_TYPE_STORE_FILE);
  } catch {
    await fs.writeFile(SPLIT_TYPE_STORE_FILE, "[]", "utf8");
  }
}

async function readSplitTypeStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(SPLIT_TYPE_STORE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [] as TemplateLibrarySplitTypeStoreRecord[];
  }
  return parsed
    .map((entry) => normalizeSplitTypeStoreRecord(entry))
    .filter((entry): entry is TemplateLibrarySplitTypeStoreRecord => entry !== null);
}

async function writeSplitTypeStore(items: TemplateLibrarySplitTypeStoreRecord[]) {
  await ensureStoreFile();
  await fs.writeFile(SPLIT_TYPE_STORE_FILE, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

function normalizeSplitTypeStoreRecord(value: unknown): TemplateLibrarySplitTypeStoreRecord | null {
  const row = asRecord(value);
  const id = toNonEmptyString(row.id);
  const userId = toNonEmptyString(row.user_id);
  const keyRaw = toNonEmptyString(row.key);
  const label = toNonEmptyString(row.label);
  const createdAt = toNonEmptyString(row.created_at);
  const updatedAt = toNonEmptyString(row.updated_at);
  if (!id || !userId || !keyRaw || !label || !createdAt || !updatedAt) {
    return null;
  }
  const key = sanitizeSplitTypeKey(keyRaw);
  if (!key) {
    return null;
  }
  return {
    id,
    user_id: userId,
    key,
    label,
    builtin: row.builtin === true,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function readTemplateLibraryRawStore() {
  try {
    const raw = await fs.readFile(TEMPLATE_LIBRARY_STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [] as TemplateLibraryRawRecord[];
    }
    return parsed
      .map((entry) => normalizeTemplateLibraryRawRecord(entry))
      .filter((entry): entry is TemplateLibraryRawRecord => entry !== null);
  } catch {
    return [] as TemplateLibraryRawRecord[];
  }
}

async function writeTemplateLibraryRawStore(items: TemplateLibraryRawRecord[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    TEMPLATE_LIBRARY_STORE_FILE,
    `${JSON.stringify(items.map((item) => item.raw), null, 2)}\n`,
    "utf8",
  );
}

function normalizeTemplateLibraryRawRecord(value: unknown): TemplateLibraryRawRecord | null {
  const row = asRecord(value);
  const id = toNonEmptyString(row.id);
  const userId = toNonEmptyString(row.user_id);
  const splitType = toNonEmptyString(row.split_type);
  if (!id || !userId || !splitType) {
    return null;
  }
  return {
    id,
    user_id: userId,
    split_type: splitType,
    raw: row,
  };
}

function withDefaultSplitTypesIfMissing(
  current: TemplateLibrarySplitTypeStoreRecord[],
  userId: string,
) {
  const userItems = current.filter((item) => item.user_id === userId);
  if (userItems.length > 0) {
    return { items: current, changed: false };
  }

  const now = new Date().toISOString();
  const createdDefaults = DEFAULT_SPLIT_TYPE_DEFS.map((item) => ({
    id: randomUUID(),
    user_id: userId,
    key: item.key,
    label: item.label,
    builtin: item.builtin,
    created_at: now,
    updated_at: now,
  }));
  return {
    items: [...current, ...createdDefaults],
    changed: true,
  };
}

function getTemplateCountBySplitType(items: TemplateLibraryRawRecord[], userId: string) {
  const map = new Map<string, number>();
  for (const item of items) {
    if (item.user_id !== userId) {
      continue;
    }
    const key = item.split_type;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

async function ensureUserSplitTypes(userId: string) {
  const current = await readSplitTypeStore();
  const ensured = withDefaultSplitTypesIfMissing(current, userId);
  if (ensured.changed) {
    await writeSplitTypeStore(ensured.items);
  }
  return ensured.items;
}

export async function listTemplateLibrarySplitTypesByUser(userId: string) {
  const [splitTypeStore, templateStore] = await Promise.all([
    ensureUserSplitTypes(userId),
    readTemplateLibraryRawStore(),
  ]);

  const templateCountMap = getTemplateCountBySplitType(templateStore, userId);
  return splitTypeStore
    .filter((item) => item.user_id === userId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((item) => ({
      key: item.key,
      label: item.label,
      builtin: item.builtin,
      user_id: item.user_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      template_count: templateCountMap.get(item.key) ?? 0,
    })) satisfies TemplateLibrarySplitTypeRecord[];
}

export async function createTemplateLibrarySplitType(input: CreateSplitTypeInput) {
  const label = input.label.trim();
  const desiredKey = input.key?.trim().length
    ? sanitizeSplitTypeKey(input.key)
    : sanitizeSplitTypeKey(label);
  if (!label || !desiredKey) {
    throw new Error("Split type label/key is invalid");
  }

  const current = await ensureUserSplitTypes(input.user_id);
  const userItems = current.filter((item) => item.user_id === input.user_id);
  if (userItems.some((item) => item.key === desiredKey)) {
    throw new Error("Split type key already exists");
  }

  const now = new Date().toISOString();
  const created: TemplateLibrarySplitTypeStoreRecord = {
    id: randomUUID(),
    user_id: input.user_id,
    key: desiredKey,
    label,
    builtin: false,
    created_at: now,
    updated_at: now,
  };
  const next = [...current, created];
  await writeSplitTypeStore(next);
  return {
    key: created.key,
    label: created.label,
    builtin: created.builtin,
    user_id: created.user_id,
    created_at: created.created_at,
    updated_at: created.updated_at,
    template_count: 0,
  } satisfies TemplateLibrarySplitTypeRecord;
}

export async function updateTemplateLibrarySplitType(input: UpdateSplitTypeInput) {
  const label = input.label.trim();
  if (!label) {
    throw new Error("Split type label is invalid");
  }

  const current = await ensureUserSplitTypes(input.user_id);
  const index = current.findIndex(
    (item) => item.user_id === input.user_id && item.key === input.key,
  );
  if (index < 0) {
    return null;
  }

  const next = [...current];
  next[index] = {
    ...next[index],
    label,
    updated_at: new Date().toISOString(),
  };
  await writeSplitTypeStore(next);

  const templateStore = await readTemplateLibraryRawStore();
  const templateCountMap = getTemplateCountBySplitType(templateStore, input.user_id);
  const updated = next[index];
  return {
    key: updated.key,
    label: updated.label,
    builtin: updated.builtin,
    user_id: updated.user_id,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
    template_count: templateCountMap.get(updated.key) ?? 0,
  } satisfies TemplateLibrarySplitTypeRecord;
}

export async function deleteTemplateLibrarySplitType(input: DeleteSplitTypeInput) {
  const current = await ensureUserSplitTypes(input.user_id);
  const userItems = current.filter((item) => item.user_id === input.user_id);
  if (userItems.length <= 1) {
    throw new Error("At least one split type must remain");
  }

  const target = userItems.find((item) => item.key === input.key);
  if (!target) {
    return {
      deleted: false,
      deleted_key: input.key,
      migrated_to_key: null,
      migrated_template_count: 0,
    };
  }

  const templateStore = await readTemplateLibraryRawStore();
  const templateCountMap = getTemplateCountBySplitType(templateStore, input.user_id);
  const templateCount = templateCountMap.get(input.key) ?? 0;

  if (templateCount > 0) {
    if (!input.migrate_to_key || input.migrate_to_key === input.key) {
      throw new Error("Split type is in use and requires migrate_to_key");
    }
    const migrateTarget = userItems.find((item) => item.key === input.migrate_to_key);
    if (!migrateTarget) {
      throw new Error("Migrate target split type not found");
    }
  }

  const nextSplitTypes = current.filter(
    (item) => !(item.user_id === input.user_id && item.key === input.key),
  );
  await writeSplitTypeStore(nextSplitTypes);

  if (templateCount > 0 && input.migrate_to_key) {
    const migratedTemplateStore = templateStore.map((item) => {
      if (item.user_id !== input.user_id || item.split_type !== input.key) {
        return item;
      }
      const raw = { ...item.raw, split_type: input.migrate_to_key as string };
      return {
        ...item,
        split_type: input.migrate_to_key as string,
        raw,
      };
    });
    await writeTemplateLibraryRawStore(migratedTemplateStore);
  }

  return {
    deleted: true,
    deleted_key: input.key,
    migrated_to_key: templateCount > 0 ? input.migrate_to_key ?? null : null,
    migrated_template_count: templateCount,
  };
}

export function isBuiltinTemplateSplitTypeKey(key: string) {
  return (TEMPLATE_SPLIT_TYPE_VALUES as readonly string[]).includes(key);
}
