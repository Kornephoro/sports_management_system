import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

type TemplateLibraryFolderStoreRecord = {
  id: string;
  user_id: string;
  key: string;
  label: string;
  created_at: string;
  updated_at: string;
};

type TemplateLibraryRawRecord = {
  id: string;
  user_id: string;
  folder_key: string | null;
  raw: Record<string, unknown>;
};

export type TemplateLibraryFolderRecord = {
  key: string;
  label: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  template_count: number;
};

type CreateTemplateLibraryFolderInput = {
  user_id: string;
  label: string;
  key?: string;
};

type UpdateTemplateLibraryFolderInput = {
  user_id: string;
  key: string;
  label: string;
};

type DeleteTemplateLibraryFolderInput = {
  user_id: string;
  key: string;
  migrate_to_key?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FOLDER_STORE_FILE = path.join(DATA_DIR, "template-library-folders.json");
const TEMPLATE_LIBRARY_STORE_FILE = path.join(DATA_DIR, "template-library.json");
const RESERVED_FOLDER_KEYS = new Set(["all", "uncategorized"]);

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

function sanitizeFolderKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function ensureFolderStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FOLDER_STORE_FILE);
  } catch {
    await fs.writeFile(FOLDER_STORE_FILE, "[]", "utf8");
  }
}

function normalizeFolderStoreRecord(value: unknown): TemplateLibraryFolderStoreRecord | null {
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
  const key = sanitizeFolderKey(keyRaw);
  if (!key || RESERVED_FOLDER_KEYS.has(key)) {
    return null;
  }
  return {
    id,
    user_id: userId,
    key,
    label,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function readFolderStore() {
  await ensureFolderStoreFile();
  const raw = await fs.readFile(FOLDER_STORE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [] as TemplateLibraryFolderStoreRecord[];
  }
  return parsed
    .map((entry) => normalizeFolderStoreRecord(entry))
    .filter((entry): entry is TemplateLibraryFolderStoreRecord => entry !== null);
}

async function writeFolderStore(items: TemplateLibraryFolderStoreRecord[]) {
  await ensureFolderStoreFile();
  await fs.writeFile(FOLDER_STORE_FILE, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

function normalizeTemplateLibraryRawRecord(value: unknown): TemplateLibraryRawRecord | null {
  const row = asRecord(value);
  const id = toNonEmptyString(row.id);
  const userId = toNonEmptyString(row.user_id);
  if (!id || !userId) {
    return null;
  }
  const folderKeyRaw = toNonEmptyString(row.folder_key);
  const folderKey = folderKeyRaw ? sanitizeFolderKey(folderKeyRaw) : null;
  return {
    id,
    user_id: userId,
    folder_key: folderKey,
    raw: row,
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

function getTemplateCountByFolder(items: TemplateLibraryRawRecord[], userId: string) {
  const map = new Map<string, number>();
  for (const item of items) {
    if (item.user_id !== userId || !item.folder_key) {
      continue;
    }
    map.set(item.folder_key, (map.get(item.folder_key) ?? 0) + 1);
  }
  return map;
}

export async function listTemplateLibraryFoldersByUser(userId: string) {
  const [folderStore, templateStore] = await Promise.all([
    readFolderStore(),
    readTemplateLibraryRawStore(),
  ]);

  const templateCountMap = getTemplateCountByFolder(templateStore, userId);
  return folderStore
    .filter((item) => item.user_id === userId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((item) => ({
      key: item.key,
      label: item.label,
      user_id: item.user_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      template_count: templateCountMap.get(item.key) ?? 0,
    })) satisfies TemplateLibraryFolderRecord[];
}

export async function createTemplateLibraryFolder(input: CreateTemplateLibraryFolderInput) {
  const label = input.label.trim();
  const desiredKey = input.key?.trim().length
    ? sanitizeFolderKey(input.key)
    : sanitizeFolderKey(label);
  if (!label || !desiredKey || RESERVED_FOLDER_KEYS.has(desiredKey)) {
    throw new Error("Folder label/key is invalid");
  }

  const current = await readFolderStore();
  const userItems = current.filter((item) => item.user_id === input.user_id);
  if (userItems.some((item) => item.key === desiredKey)) {
    throw new Error("Folder key already exists");
  }

  const now = new Date().toISOString();
  const created: TemplateLibraryFolderStoreRecord = {
    id: randomUUID(),
    user_id: input.user_id,
    key: desiredKey,
    label,
    created_at: now,
    updated_at: now,
  };
  const next = [...current, created];
  await writeFolderStore(next);
  return {
    key: created.key,
    label: created.label,
    user_id: created.user_id,
    created_at: created.created_at,
    updated_at: created.updated_at,
    template_count: 0,
  } satisfies TemplateLibraryFolderRecord;
}

export async function updateTemplateLibraryFolder(input: UpdateTemplateLibraryFolderInput) {
  const label = input.label.trim();
  if (!label) {
    throw new Error("Folder label is invalid");
  }

  const current = await readFolderStore();
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
  await writeFolderStore(next);

  const templateStore = await readTemplateLibraryRawStore();
  const templateCountMap = getTemplateCountByFolder(templateStore, input.user_id);
  const updated = next[index];
  return {
    key: updated.key,
    label: updated.label,
    user_id: updated.user_id,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
    template_count: templateCountMap.get(updated.key) ?? 0,
  } satisfies TemplateLibraryFolderRecord;
}

export async function deleteTemplateLibraryFolder(input: DeleteTemplateLibraryFolderInput) {
  const current = await readFolderStore();
  const target = current.find(
    (item) => item.user_id === input.user_id && item.key === input.key,
  );
  if (!target) {
    return {
      deleted: false,
      deleted_key: input.key,
      migrated_to_key: null,
      migrated_template_count: 0,
    };
  }

  const templateStore = await readTemplateLibraryRawStore();
  const templateCountMap = getTemplateCountByFolder(templateStore, input.user_id);
  const templateCount = templateCountMap.get(input.key) ?? 0;

  if (input.migrate_to_key) {
    const migrateTarget = current.find(
      (item) => item.user_id === input.user_id && item.key === input.migrate_to_key,
    );
    if (!migrateTarget) {
      throw new Error("Migrate target folder not found");
    }
  }

  const nextFolders = current.filter(
    (item) => !(item.user_id === input.user_id && item.key === input.key),
  );
  await writeFolderStore(nextFolders);

  if (templateCount > 0) {
    const migratedTemplateStore = templateStore.map((item) => {
      if (item.user_id !== input.user_id || item.folder_key !== input.key) {
        return item;
      }
      const nextFolderKey = input.migrate_to_key ?? null;
      const raw = {
        ...item.raw,
        folder_key: nextFolderKey,
      };
      return {
        ...item,
        folder_key: nextFolderKey,
        raw,
      };
    });
    await writeTemplateLibraryRawStore(migratedTemplateStore);
  }

  return {
    deleted: true,
    deleted_key: input.key,
    migrated_to_key: input.migrate_to_key ?? null,
    migrated_template_count: templateCount,
  };
}
