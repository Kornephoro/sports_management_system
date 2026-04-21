"use client";

import { TemplateSplitType } from "@/lib/template-library-standards";
import { RecordingModeValue } from "@/lib/recording-mode-standards";
import { TrainingUnitSet } from "@/lib/training-set-standards";
import { ActionEntryAnchorSummary } from "@/lib/action-entry-anchor";
import {
  SupersetGroupValue,
  SupersetSelectionMode,
} from "@/lib/template-library-superset";
import { fetchJson } from "@/features/shared/http-client";

export type TemplateUnitSetPayload = {
  type:
    | "warmup"
    | "working"
    | "backoff"
    | "dropset"
    | "failure"
    | "amrap"
    | "tempo"
    | "ramp"
    | "top_set"
    | "volume"
    | "pause"
    | "cluster";
  reps?: number | { min: number; max: number };
  durationSeconds?: number;
  weightMode?: "absolute" | "relative_to_working";
  weight?: number;
  relativeIntensityRatio?: number;
  tempo?: [number, number, number, number];
  assistWeight?: number;
  rpe?: number;
  restSeconds?: number;
  participatesInProgression?: boolean;
  notes?: string;
};

export type TemplateLibraryUnitBase = {
  exerciseLibraryItemId: string;
  exerciseNameSnapshot: string;
  sequenceNo: number;
  unitRole:
    | "main"
    | "secondary"
    | "accessory"
    | "skill"
    | "conditioning"
    | "warmup"
    | "cooldown"
    | "mobility"
    | "prehab";
  progressTrackKey: string;
  progressionFamily:
    | "strict_load"
    | "threshold"
    | "exposure"
    | "performance"
    | "autoregulated";
  progressionPolicyType:
    | "linear_load_step"
    | "linear_periodization_step"
    | "scripted_cycle"
    | "double_progression"
    | "total_reps_threshold"
    | "add_set_then_load"
    | "reps_then_external_load"
    | "duration_threshold"
    | "bodyweight_reps_progression"
    | "hold_or_manual"
    | "manual"
    | string;
  progressionPolicyConfig: Record<string, unknown>;
  adjustmentPolicyType: "always" | "rotating_pool" | "gated" | "manual";
  adjustmentPolicyConfig: Record<string, unknown>;
  successCriteria: Record<string, unknown>;
  recordingMode?: RecordingModeValue | null;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  defaultSets: number;
  defaultReps: number | null;
  defaultDurationSeconds: number | null;
  defaultLoadValue: number | null;
  defaultLoadUnit: "kg" | "lbs" | null;
  defaultAdditionalLoadValue: number | null;
  defaultAdditionalLoadUnit: "kg" | "lbs" | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  rpeMin: number | null;
  rpeMax: number | null;
  sets: TrainingUnitSet[];
  anchorDraft?: ActionEntryAnchorSummary | null;
  notes: string | null;
  required: boolean;
  supersetGroup?: SupersetGroupValue | null;
};

export type TemplateLibraryUnit = TemplateLibraryUnitBase;

export type TemplateLibraryItem = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  splitType: TemplateSplitType;
  folderKey: string | null;
  aliases: string[];
  enabled: boolean;
  notes: string | null;
  lastUsedAt: string | null;
  unitCount: number;
  referenceProgramCount?: number;
  units: TemplateLibraryUnit[];
  createdAt: string;
  updatedAt: string;
};

export type TemplateLibraryItemDetail = TemplateLibraryItem & {
  summary: {
    totalTemplateReferences: number;
    totalProgramReferences: number;
    totalPlannedReferences: number;
    totalPackageReferences: number;
    latestUsedAt: string | null;
  };
  references: {
    templates: Array<{
      unitTemplateId: string;
      unitName: string;
      sessionTemplateId: string;
      sessionTemplateName: string;
      blockId: string;
      blockName: string;
      programId: string;
      programName: string;
      updatedAt: string;
    }>;
    planned: Array<{
      plannedSessionId: string;
      sessionDate: string;
      sequenceIndex: number;
      status: string;
      programId: string;
      programName: string;
    }>;
    packages: Array<{
      packageId: string;
      packageName: string;
      dayCode: string;
      dayLabel: string | null;
      updatedAt: string;
    }>;
  };
  governance: {
    duplicateCandidates: Array<{
      id: string;
      name: string;
    }>;
  };
};

export type UpsertTemplateLibraryUnitPayload = {
  exerciseLibraryItemId: string;
  exerciseNameSnapshot: string;
  sequenceNo: number;
  unitRole?:
    | "main"
    | "secondary"
    | "accessory"
    | "skill"
    | "conditioning"
    | "warmup"
    | "cooldown"
    | "mobility"
    | "prehab";
  progressTrackKey?: string;
  progressionFamily?:
    | "strict_load"
    | "threshold"
    | "exposure"
    | "performance"
    | "autoregulated";
  progressionPolicyType?:
    | "linear_load_step"
    | "linear_periodization_step"
    | "scripted_cycle"
    | "double_progression"
    | "total_reps_threshold"
    | "add_set_then_load"
    | "reps_then_external_load"
    | "duration_threshold"
    | "bodyweight_reps_progression"
    | "hold_or_manual"
    | "manual";
  progressionPolicyConfig?: Record<string, unknown>;
  adjustmentPolicyType?: "always" | "rotating_pool" | "gated" | "manual";
  adjustmentPolicyConfig?: Record<string, unknown>;
  successCriteria?: Record<string, unknown>;
  recordingMode?: RecordingModeValue;
  recordMode: "sets_reps" | "sets_time";
  loadModel: "external" | "bodyweight_plus_external";
  defaultSets: number;
  defaultReps?: number;
  defaultDurationSeconds?: number;
  defaultLoadValue?: number;
  defaultLoadUnit?: "kg" | "lbs";
  defaultAdditionalLoadValue?: number;
  defaultAdditionalLoadUnit?: "kg" | "lbs";
  targetRepsMin?: number;
  targetRepsMax?: number;
  rpeMin?: number;
  rpeMax?: number;
  sets?: TemplateUnitSetPayload[];
  anchorDraft?: {
    setCount?: number | null;
    reps?: number | null;
    durationSeconds?: number | null;
    loadValue?: number | null;
    additionalLoadValue?: number | null;
    assistWeight?: number | null;
    restSeconds?: number | null;
    tempo?: [number, number, number, number] | null;
    targetRpe?: number | null;
    recommendedRir?: number | null;
    setStructure?: TemplateUnitSetPayload[];
  } | null;
  notes?: string;
  required?: boolean;
  supersetGroup?: {
    groupId: string;
    groupName?: string | null;
    orderIndex: number;
    totalUnits: number;
    betweenExercisesRestSeconds?: number | null;
    betweenRoundsRestSeconds?: number | null;
    progressionBudgetPerExposure?: number;
    selectionMode?: SupersetSelectionMode;
  } | null;
};

export type UpsertTemplateLibraryItemPayload = {
  userId: string;
  name: string;
  description?: string;
  splitType: TemplateSplitType;
  folderKey?: string | null;
  aliases: string[];
  enabled?: boolean;
  notes?: string;
  units: UpsertTemplateLibraryUnitPayload[];
};

export type ListTemplateLibraryItemsOptions = {
  query?: string;
  enabled?: "true" | "false" | "all";
  splitType?: string | "all";
  folderKey?: string | "all" | "uncategorized";
};

export type TemplateLibrarySplitTypeItem = {
  key: string;
  label: string;
  builtin: boolean;
  templateCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TemplateLibraryFolderItem = {
  key: string;
  label: string;
  templateCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function listTemplateLibraryItems(
  userId: string,
  options: ListTemplateLibraryItemsOptions = {},
) {
  const params = new URLSearchParams();
  params.set("userId", userId);
  if (options.query?.trim()) {
    params.set("query", options.query.trim());
  }
  if (options.enabled) {
    params.set("enabled", options.enabled);
  }
  if (options.splitType && options.splitType !== "all") {
    params.set("splitType", options.splitType);
  }
  if (options.folderKey && options.folderKey !== "all") {
    params.set("folderKey", options.folderKey);
  }

  return fetchJson<TemplateLibraryItem[]>(`/api/template-library?${params.toString()}`);
}

export async function getTemplateLibraryItem(itemId: string, userId: string) {
  return fetchJson<TemplateLibraryItemDetail>(
    `/api/template-library/${encodeURIComponent(itemId)}?userId=${encodeURIComponent(userId)}`,
  );
}

export async function createTemplateLibraryItem(payload: UpsertTemplateLibraryItemPayload) {
  return fetchJson<TemplateLibraryItem>("/api/template-library", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTemplateLibraryItem(
  itemId: string,
  payload: Partial<UpsertTemplateLibraryItemPayload> & { userId: string },
) {
  return fetchJson<TemplateLibraryItem>(`/api/template-library/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function setTemplateLibraryItemEnabled(
  itemId: string,
  payload: { userId: string; enabled: boolean },
) {
  return fetchJson<TemplateLibraryItem>(
    `/api/template-library/${encodeURIComponent(itemId)}/enabled`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function listTemplateLibrarySplitTypes(userId: string) {
  const params = new URLSearchParams();
  params.set("userId", userId);
  return fetchJson<TemplateLibrarySplitTypeItem[]>(
    `/api/template-library/split-types?${params.toString()}`,
  );
}

export async function createTemplateLibrarySplitType(payload: {
  userId: string;
  label: string;
  key?: string;
}) {
  return fetchJson<TemplateLibrarySplitTypeItem>("/api/template-library/split-types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTemplateLibrarySplitType(
  key: string,
  payload: {
    userId: string;
    label: string;
  },
) {
  return fetchJson<TemplateLibrarySplitTypeItem>(
    `/api/template-library/split-types/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteTemplateLibrarySplitType(
  key: string,
  payload: {
    userId: string;
    migrateToKey?: string;
  },
) {
  return fetchJson<{
    deleted: boolean;
    deletedKey: string;
    migratedToKey: string | null;
    migratedTemplateCount: number;
  }>(`/api/template-library/split-types/${encodeURIComponent(key)}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export async function listTemplateLibraryFolders(userId: string) {
  const params = new URLSearchParams();
  params.set("userId", userId);
  return fetchJson<TemplateLibraryFolderItem[]>(
    `/api/template-library/folders?${params.toString()}`,
  );
}

export async function createTemplateLibraryFolder(payload: {
  userId: string;
  label: string;
  key?: string;
}) {
  return fetchJson<TemplateLibraryFolderItem>("/api/template-library/folders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTemplateLibraryFolder(
  key: string,
  payload: {
    userId: string;
    label: string;
  },
) {
  return fetchJson<TemplateLibraryFolderItem>(
    `/api/template-library/folders/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteTemplateLibraryFolder(
  key: string,
  payload: {
    userId: string;
    migrateToKey?: string;
  },
) {
  return fetchJson<{
    deleted: boolean;
    deletedKey: string;
    migratedToKey: string | null;
    migratedTemplateCount: number;
  }>(`/api/template-library/folders/${encodeURIComponent(key)}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}
