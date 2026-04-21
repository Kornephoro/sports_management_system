import { ProgressionSnapshot, ProgressTrackState } from "@/lib/progression-types";

type ProgressionSummary = {
  changed: boolean;
  changeCount: number;
  fieldDiffs: string[];
  reason: string;
  rawChangedFields: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toSnapshot(value: unknown): ProgressionSnapshot | null {
  const record = asRecord(value);
  const before = asRecord(record.before);
  const after = asRecord(record.after);
  const changedFields = toStringArray(record.changed_fields);
  const reason = typeof record.change_reason === "string" ? record.change_reason : "";
  const changeType = typeof record.change_type === "string" ? record.change_type : "no_change";
  const outcome = typeof record.outcome === "string" ? record.outcome : "skipped";
  const policyType = typeof record.policy_type === "string" ? record.policy_type : "";
  const family = typeof record.progression_family === "string" ? record.progression_family : "";
  const trackKey = typeof record.track_key === "string" ? record.track_key : "";

  if (Object.keys(before).length === 0 && Object.keys(after).length === 0 && changedFields.length === 0) {
    return null;
  }

  return {
    before: before as ProgressTrackState,
    after: after as ProgressTrackState,
    changed_fields: changedFields,
    change_reason: reason as ProgressionSnapshot["change_reason"],
    change_type: changeType as ProgressionSnapshot["change_type"],
    outcome: outcome as ProgressionSnapshot["outcome"],
    policy_type: policyType,
    progression_family: family,
    track_key: trackKey,
  };
}

function formatValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (field === "current_duration_seconds") {
    return `${value} 秒`;
  }

  if (
    field === "current_sets" ||
    field === "current_reps" ||
    field === "cycle_index" ||
    field === "current_phase" ||
    field === "pending_retry"
  ) {
    return String(value);
  }

  if (field === "current_load") {
    return `${value}`;
  }

  if (field === "extra_state") {
    return "已更新";
  }

  return String(value);
}

function getFieldLabel(field: string) {
  if (field === "current_sets") return "组数";
  if (field === "current_reps") return "次数";
  if (field === "current_duration_seconds") return "时长";
  if (field === "current_load") return "重量/附重";
  if (field === "current_phase") return "阶段";
  if (field === "cycle_index") return "周期步";
  if (field === "pending_retry") return "重试状态";
  if (field === "cooldown_until") return "冷却时间";
  if (field === "last_change_reason") return "变化标记";
  if (field === "extra_state") return "附加状态";
  return field;
}

function formatFieldDiff(field: string, before: unknown, after: unknown) {
  const label = getFieldLabel(field);
  const beforeText = formatValue(field, before);
  const afterText = formatValue(field, after);
  return `${label} ${beforeText} -> ${afterText}`;
}

export function summarizeProgression(snapshotValue: unknown, maxFields = 2): ProgressionSummary {
  const snapshot = toSnapshot(snapshotValue);
  if (!snapshot) {
    return {
      changed: false,
      changeCount: 0,
      fieldDiffs: [],
      reason: "暂无进步快照",
      rawChangedFields: [],
    };
  }

  const before = asRecord(snapshot.before);
  const after = asRecord(snapshot.after);
  const changedFields = snapshot.changed_fields;
  const reason = snapshot.change_reason || "本次未记录变化原因";

  const fieldDiffs = changedFields.map((field) => formatFieldDiff(field, before[field], after[field]));

  return {
    changed: changedFields.length > 0,
    changeCount: changedFields.length,
    fieldDiffs: fieldDiffs.slice(0, Math.max(1, maxFields)),
    reason,
    rawChangedFields: changedFields,
  };
}
