import { promises as fs } from "node:fs";
import path from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

type ExerciseLibraryRecord = {
  id: string;
  user_id: string;
  name: string;
  aliases: string[];
};

type PlannedUnitRow = {
  id: string;
  selected_exercise_name: string | null;
  target_payload: Prisma.JsonValue;
  planned_session: {
    user_id: string;
    sequence_index: number;
  };
};

type CliOptions = {
  apply: boolean;
  onlyUserId: string | null;
  verbose: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let onlyUserId: string | null = null;
  let verbose = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--user") {
      const value = argv[index + 1];
      if (value && value.trim().length > 0) {
        onlyUserId = value.trim();
        index += 1;
      }
      continue;
    }
    if (arg === "--verbose") {
      verbose = true;
    }
  }

  return {
    apply,
    onlyUserId,
    verbose,
  };
}

function parseDotenvLines(content: string) {
  const rows = content.split(/\r?\n/);
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    const rawValue = trimmed.slice(equalIndex + 1).trim();
    const unquoted =
      (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    process.env[key] = unquoted;
  }
}

async function loadEnvIfNeeded() {
  const envPaths = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
  ];
  for (const envPath of envPaths) {
    try {
      const content = await fs.readFile(envPath, "utf8");
      parseDotenvLines(content);
    } catch {
      // ignore missing env files
    }
  }
}

function normalizeNameKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "")
    .trim();
}

const MANUAL_NAME_SYNONYMS: Record<string, string> = {
  杠铃平板卧推: "杠铃卧推",
};

function getPayloadRecord(payload: Prisma.JsonValue): Record<string, unknown> {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function getPayloadExerciseLibraryItemId(payload: Prisma.JsonValue) {
  const record = getPayloadRecord(payload);
  const raw = record.exercise_library_item_id;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return null;
}

function buildUserIndex(records: ExerciseLibraryRecord[]) {
  const byId = new Map<string, ExerciseLibraryRecord>();
  const byNameKey = new Map<string, ExerciseLibraryRecord>();
  const byAliasKey = new Map<string, ExerciseLibraryRecord>();

  for (const record of records) {
    byId.set(record.id, record);
    const nameKey = normalizeNameKey(record.name);
    if (nameKey && !byNameKey.has(nameKey)) {
      byNameKey.set(nameKey, record);
    }
    for (const alias of record.aliases) {
      const aliasKey = normalizeNameKey(alias);
      if (aliasKey && !byAliasKey.has(aliasKey)) {
        byAliasKey.set(aliasKey, record);
      }
    }
  }

  return {
    byId,
    byNameKey,
    byAliasKey,
  };
}

function resolveMatch(
  row: PlannedUnitRow,
  userIndex: ReturnType<typeof buildUserIndex>,
) {
  const selectedName = row.selected_exercise_name?.trim() ?? "";
  if (!selectedName) {
    return null;
  }
  const nameKey = normalizeNameKey(selectedName);
  if (!nameKey) {
    return null;
  }
  const exactMatched = userIndex.byNameKey.get(nameKey) ?? userIndex.byAliasKey.get(nameKey);
  if (exactMatched) {
    return exactMatched;
  }

  const mappedName = MANUAL_NAME_SYNONYMS[selectedName];
  if (mappedName) {
    const mappedKey = normalizeNameKey(mappedName);
    const mappedMatch = userIndex.byNameKey.get(mappedKey) ?? userIndex.byAliasKey.get(mappedKey);
    if (mappedMatch) {
      return mappedMatch;
    }
  }

  const withoutFlatKey = normalizeNameKey(selectedName.replaceAll("平板", ""));
  if (withoutFlatKey && withoutFlatKey !== nameKey) {
    const flatMatch = userIndex.byNameKey.get(withoutFlatKey) ?? userIndex.byAliasKey.get(withoutFlatKey);
    if (flatMatch) {
      return flatMatch;
    }
  }

  return null;
}

async function readExerciseLibraryStore() {
  const storePath = path.join(process.cwd(), "data", "exercise-library.json");
  const raw = await fs.readFile(storePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [] as ExerciseLibraryRecord[];
  }
  return parsed
    .filter((item): item is ExerciseLibraryRecord => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return false;
      }
      const row = item as Record<string, unknown>;
      return (
        typeof row.id === "string" &&
        row.id.trim().length > 0 &&
        typeof row.user_id === "string" &&
        row.user_id.trim().length > 0 &&
        typeof row.name === "string" &&
        row.name.trim().length > 0 &&
        Array.isArray(row.aliases)
      );
    })
    .map((row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      aliases: row.aliases.filter((alias): alias is string => typeof alias === "string"),
    }));
}

async function main() {
  await loadEnvIfNeeded();
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient({ log: ["error"] });

  try {
    const [allLibraryRecords, rows] = await Promise.all([
      readExerciseLibraryStore(),
      prisma.plannedUnit.findMany({
        where: options.onlyUserId
          ? {
              planned_session: {
                user_id: options.onlyUserId,
              },
            }
          : undefined,
        select: {
          id: true,
          selected_exercise_name: true,
          target_payload: true,
          planned_session: {
            select: {
              user_id: true,
              sequence_index: true,
            },
          },
        },
      }),
    ]);

    const libraryByUser = new Map<string, ReturnType<typeof buildUserIndex>>();
    for (const record of allLibraryRecords) {
      const records = libraryByUser.get(record.user_id);
      if (!records) {
        libraryByUser.set(record.user_id, buildUserIndex([record]));
      } else {
        const merged = buildUserIndex([
          ...Array.from(records.byId.values()),
          record,
        ]);
        libraryByUser.set(record.user_id, merged);
      }
    }

    let checked = 0;
    let alreadyLinked = 0;
    let linkedByName = 0;
    let relinkedInvalidId = 0;
    let unmatched = 0;
    const unmatchedSamples: Array<{
      unitId: string;
      userId: string;
      sequenceIndex: number;
      selectedName: string | null;
      reason: string;
    }> = [];
    const updates: Array<{ id: string; payload: Prisma.JsonObject }> = [];

    for (const row of rows) {
      checked += 1;
      const userId = row.planned_session.user_id;
      const userIndex = libraryByUser.get(userId);
      if (!userIndex) {
        unmatched += 1;
        if (options.verbose && unmatchedSamples.length < 20) {
          unmatchedSamples.push({
            unitId: row.id,
            userId,
            sequenceIndex: row.planned_session.sequence_index,
            selectedName: row.selected_exercise_name,
            reason: "no_library_for_user",
          });
        }
        continue;
      }

      const payloadRecord = getPayloadRecord(row.target_payload);
      const currentId = getPayloadExerciseLibraryItemId(row.target_payload);
      const currentLinkedItem = currentId ? userIndex.byId.get(currentId) ?? null : null;

      if (currentId && currentLinkedItem) {
        alreadyLinked += 1;
        continue;
      }

      const matched = resolveMatch(row, userIndex);
      if (!matched) {
        unmatched += 1;
        if (options.verbose && unmatchedSamples.length < 20) {
          unmatchedSamples.push({
            unitId: row.id,
            userId,
            sequenceIndex: row.planned_session.sequence_index,
            selectedName: row.selected_exercise_name,
            reason: "no_name_or_alias_match",
          });
        }
        continue;
      }

      const nextPayload: Prisma.JsonObject = {
        ...(payloadRecord as Prisma.JsonObject),
        exercise_library_item_id: matched.id,
      };

      updates.push({
        id: row.id,
        payload: nextPayload,
      });

      if (currentId && !currentLinkedItem) {
        relinkedInvalidId += 1;
      } else {
        linkedByName += 1;
      }
    }

    if (options.apply && updates.length > 0) {
      await prisma.$transaction(
        updates.map((item) =>
          prisma.plannedUnit.update({
            where: { id: item.id },
            data: {
              target_payload: item.payload,
            },
          }),
        ),
      );
    }

    console.log("planned-unit exercise link backfill");
    console.log(`mode: ${options.apply ? "apply" : "dry-run"}`);
    if (options.onlyUserId) {
      console.log(`user filter: ${options.onlyUserId}`);
    }
    console.log(`checked: ${checked}`);
    console.log(`already_linked_valid: ${alreadyLinked}`);
    console.log(`to_link_by_name_or_alias: ${linkedByName}`);
    console.log(`to_relink_invalid_id: ${relinkedInvalidId}`);
    console.log(`unmatched: ${unmatched}`);
    console.log(`${options.apply ? "updated" : "would_update"}: ${updates.length}`);

    if (updates.length > 0) {
      const preview = updates.slice(0, 8).map((item) => item.id);
      console.log(`preview_unit_ids: ${preview.join(", ")}`);
    }
    if (options.verbose && unmatchedSamples.length > 0) {
      console.log("unmatched_samples:");
      for (const sample of unmatchedSamples) {
        console.log(
          `- unit=${sample.unitId} user=${sample.userId} session#${sample.sequenceIndex} name=${sample.selectedName ?? "(null)"} reason=${sample.reason}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
