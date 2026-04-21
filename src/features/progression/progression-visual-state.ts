import { ProgressionSnapshot } from "@/lib/progression-types";
import {
  getProgressForecastClassName,
  getProgressSourceHintClassName,
  getProgressVisualTone,
} from "@/features/shared/training-semantic-ui";

export type ActionProgressVisualStatus =
  | "no_change"
  | "threshold_progress"
  | "regular_progress"
  | "realization_round"
  | "planned_deload"
  | "exception_adjustment";

export type ProgressionMatrixAuxFlag =
  | "next_progression"
  | "reflowed"
  | "retry_pending"
  | "rotation_wait";

export type ProgressionMatrixIcon = "↑" | "↑↑" | "→" | "↓" | "⚠";
type MatrixActualOutcome = "success_met" | "partial" | "failed" | "skipped";

export type ActionProgressFieldChange = {
  field: string;
  label: string;
  summary: string;
};

export type ActionProgressVisualState = {
  status: ActionProgressVisualStatus;
  statusLabel: string;
  statusLabelEn: string;
  statusClassName: string;
  reasonCode: ProgressionSnapshot["change_reason"] | "unknown";
  outcome: ProgressionSnapshot["outcome"] | "unknown";
  reason: string;
  changed: boolean;
  changedFields: string[];
  fieldChanges: ActionProgressFieldChange[];
  forecastLabel: string | null;
  forecastClassName: string | null;
  sourceHintLabel: string | null;
  sourceHintClassName: string | null;
  assistHints: Array<{
    key: string;
    label: string;
    className: string;
  }>;
};

export type ProgressionMatrixVisualState = {
  snapshot: ProgressionSnapshot | null;
  status: ActionProgressVisualStatus;
  statusLabel: string;
  icon: ProgressionMatrixIcon;
  planLine: string;
  actualLine: string;
  actualSymbol: "✔" | "◐" | "✖" | "⤼" | "-";
  actualLabel: string;
  actualOutcome: "success_met" | "partial" | "failed" | "skipped" | null;
  deviationItems: string[];
  deviationLine: string;
  mainValue: string;
  reasonShort: string;
  cellClassName: string;
  changedFields: string[];
  auxFlags: ProgressionMatrixAuxFlag[];
  isThresholdHit: boolean;
  isSelectedForProgress: boolean;
  trendScore: number;
  actualScore: number;
  actualDetails: {
    hasExecutionData: boolean;
    plannedSetCount: number;
    completedPlannedCount: number;
    skippedPlannedCount: number;
    pendingPlannedCount: number;
    extraSetCount: number;
    completedRepsTotal: number;
    completedDurationTotal: number;
    coreSet: {
      plannedReps: number | null;
      actualReps: number | null;
      plannedWeight: number | null;
      actualWeight: number | null;
    } | null;
  } | null;
  resultDetails: {
    outcome: "success_met" | "partial" | "failed" | "skipped" | null;
    isMeetsTarget: boolean | null;
    holdReason: string | null;
    retryFlag: boolean;
    impactHint: string;
  } | null;
};

const PRIMARY_NUMERIC_FIELDS = [
  "current_load",
  "current_reps",
  "current_sets",
  "current_duration_seconds",
] as const;

type PrimaryNumericField = (typeof PRIMARY_NUMERIC_FIELDS)[number];

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

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function normalizeProgressionSnapshot(value: unknown): ProgressionSnapshot | null {
  const record = asRecord(value);
  const before = asRecord(record.before);
  const after = asRecord(record.after);
  const changedFields = toStringArray(record.changed_fields);
  const reason = typeof record.change_reason === "string" ? record.change_reason : "";
  const changeType = typeof record.change_type === "string" ? record.change_type : "no_change";
  const outcome = typeof record.outcome === "string" ? record.outcome : "skipped";

  if (Object.keys(before).length === 0 && Object.keys(after).length === 0 && changedFields.length === 0 && !reason) {
    return null;
  }

  return {
    before: before as ProgressionSnapshot["before"],
    after: after as ProgressionSnapshot["after"],
    changed_fields: changedFields,
    change_reason: reason as ProgressionSnapshot["change_reason"],
    change_type: changeType as ProgressionSnapshot["change_type"],
    outcome: outcome as ProgressionSnapshot["outcome"],
    policy_type: typeof record.policy_type === "string" ? record.policy_type : "",
    progression_family: typeof record.progression_family === "string" ? record.progression_family : "",
    track_key: typeof record.track_key === "string" ? record.track_key : "",
    track_phase: typeof record.track_phase === "string" ? record.track_phase : null,
    meta: asRecord(record.meta) as ProgressionSnapshot["meta"],
  };
}

function fieldLabel(field: string) {
  if (field === "current_sets") return "组数";
  if (field === "current_reps") return "次数";
  if (field === "current_duration_seconds") return "时长";
  if (field === "current_load") return "重量/附重";
  if (field === "current_phase") return "阶段";
  if (field === "cycle_index") return "周期步";
  if (field === "pending_retry") return "重试标记";
  return field;
}

function isDisplayField(field: string) {
  return (
    field === "current_sets" ||
    field === "current_reps" ||
    field === "current_duration_seconds" ||
    field === "current_load" ||
    field === "current_phase" ||
    field === "cycle_index"
  );
}

function formatChange(field: string, beforeValue: unknown, afterValue: unknown): ActionProgressFieldChange {
  const beforeNum = toNumber(beforeValue);
  const afterNum = toNumber(afterValue);
  const label = fieldLabel(field);

  if (beforeNum !== null && afterNum !== null) {
    const delta = Number((afterNum - beforeNum).toFixed(2));
    if (field === "current_sets") {
      if (delta > 0) return { field, label, summary: `+${delta}组` };
      if (delta < 0) return { field, label, summary: `-${Math.abs(delta)}组` };
      return { field, label, summary: `组数 ${afterNum}` };
    }
    if (field === "current_reps") {
      if (delta > 0) return { field, label, summary: `次数 +${delta}` };
      if (delta < 0) return { field, label, summary: `次数 -${Math.abs(delta)}` };
      return { field, label, summary: `次数 ${afterNum}` };
    }
    if (field === "current_duration_seconds") {
      if (delta > 0) return { field, label, summary: `时长 +${delta}秒` };
      if (delta < 0) return { field, label, summary: `时长 -${Math.abs(delta)}秒` };
      return { field, label, summary: `时长 ${afterNum}秒` };
    }
    if (field === "current_load") {
      if (delta > 0) return { field, label, summary: `重量 +${delta}` };
      if (delta < 0) return { field, label, summary: `重量 -${Math.abs(delta)}` };
      return { field, label, summary: `重量 ${afterNum}` };
    }
    if (field === "cycle_index") {
      return { field, label, summary: `${beforeNum} -> ${afterNum}` };
    }
  }

  return {
    field,
    label,
    summary: `${String(beforeValue ?? "-")} -> ${String(afterValue ?? "-")}`,
  };
}

function isThresholdWatch(snapshot: ProgressionSnapshot) {
  return (
    snapshot.change_type === "no_change" &&
    snapshot.change_reason === "hold_no_progress" &&
    snapshot.meta?.hold_reason === "not_met"
  );
}

function classifyStatus(snapshot: ProgressionSnapshot): ActionProgressVisualStatus {
  if (isThresholdWatch(snapshot)) {
    return "threshold_progress";
  }
  if (snapshot.change_type === "no_change") {
    return "no_change";
  }
  if (snapshot.change_type === "regular_progress") {
    return "regular_progress";
  }
  if (snapshot.change_type === "realization") {
    return "realization_round";
  }
  if (snapshot.change_type === "deload") {
    return "planned_deload";
  }
  if (snapshot.change_type === "adjustment") {
    return "exception_adjustment";
  }
  return snapshot.changed_fields.length > 0 ? "regular_progress" : "no_change";
}

function getStatusLabel(status: ActionProgressVisualStatus) {
  if (status === "no_change") return "无变化";
  if (status === "threshold_progress") return "阈值临近";
  if (status === "regular_progress") return "常规推进";
  if (status === "realization_round") return "实现轮";
  if (status === "planned_deload") return "计划减量";
  return "异常调整";
}

function getStatusLabelEn(status: ActionProgressVisualStatus) {
  if (status === "no_change") return "No Change";
  if (status === "threshold_progress") return "Threshold Watch";
  if (status === "regular_progress") return "Regular Progress";
  if (status === "realization_round") return "Realization";
  if (status === "planned_deload") return "Deload";
  return "Adjustment";
}

function getStatusClassName(status: ActionProgressVisualStatus) {
  return getProgressVisualTone(status).toneClassName;
}

function buildForecast(snapshot: ProgressionSnapshot): { label: string; className: string } | null {
  const meta = snapshot.meta ?? {};
  if (snapshot.change_reason !== "hold_no_progress") {
    return null;
  }

  if (meta.hold_reason === "not_selected") {
    return { label: "下次可能进入变化池", className: getProgressForecastClassName() };
  }
  if (meta.hold_reason === "not_met") {
    return { label: "达标后可进阶", className: getProgressForecastClassName() };
  }
  if (meta.hold_reason === "pending_retry") {
    return { label: "重试后再进阶", className: getProgressForecastClassName() };
  }
  if (meta.hold_reason === "cooldown") {
    return { label: "冷却结束后可进阶", className: getProgressForecastClassName() };
  }
  return null;
}

function buildSourceHint(snapshot: ProgressionSnapshot): { label: string; className: string } | null {
  const meta = snapshot.meta ?? {};
  const outcome = meta.last_outcome_basis;
  if (outcome === "skipped") {
    return { label: "受上次未训练影响", className: getProgressSourceHintClassName("skipped") };
  }
  if (outcome === "partial") {
    return { label: "受上次部分完成影响", className: getProgressSourceHintClassName("partial") };
  }
  if (outcome === "success_unmet") {
    return { label: "受上次未达标影响", className: getProgressSourceHintClassName("unmet") };
  }
  return null;
}

function buildReasonText(snapshot: ProgressionSnapshot) {
  const holdReason = snapshot.meta?.hold_reason ?? null;

  if (snapshot.change_reason === "normal_progression") {
    return "按既定策略常规推进。";
  }
  if (snapshot.change_reason === "threshold_reached") {
    return "达到阈值后推进。";
  }
  if (snapshot.change_reason === "cycle_step_advance") {
    return "进入下一周期步。";
  }
  if (snapshot.change_reason === "planned_deload") {
    return "按计划进入减量。";
  }
  if (snapshot.change_reason === "regression") {
    return "状态回退，进行保护性调整。";
  }
  if (snapshot.change_reason === "not_selected_in_rotation") {
    return "本次未进入轮转变化池。";
  }
  if (snapshot.change_reason === "retry_pending") {
    return "当前处于等待重试。";
  }
  if (snapshot.change_reason === "rescheduled_reflow") {
    return "因改期或队列变化触发重算。";
  }
  if (snapshot.change_reason === "manual_override") {
    return "由手动配置覆盖自动变化。";
  }
  if (snapshot.change_reason === "hold_no_progress") {
    if (holdReason === "not_selected") {
      return "本次未入轮转池，保持不变。";
    }
    if (holdReason === "not_met") {
      return "未达推进条件，保持不变。";
    }
    if (holdReason === "pending_retry") {
      return "等待重试后再推进。";
    }
    if (holdReason === "missing_baseline") {
      return "缺少基线参数，保持不变。";
    }
    if (holdReason === "frequency_gate") {
      return "推进频率未满足，保持不变。";
    }
    if (holdReason === "max_attempts_reached") {
      return "失败次数达到上限，暂缓推进。";
    }
    return "本次保持不变。";
  }
  return "本次未记录变化原因";
}

function buildReasonShort(snapshot: ProgressionSnapshot) {
  const holdReason = snapshot.meta?.hold_reason ?? null;

  if (snapshot.change_reason === "normal_progression") return "常规推进";
  if (snapshot.change_reason === "threshold_reached") return "达到阈值";
  if (snapshot.change_reason === "cycle_step_advance") return "周期推进";
  if (snapshot.change_reason === "planned_deload") return "计划减量";
  if (snapshot.change_reason === "regression") return "保护性回退";
  if (snapshot.change_reason === "not_selected_in_rotation") return "未选中（避免同肌群连续进步）";
  if (snapshot.change_reason === "retry_pending") return "等待重试";
  if (snapshot.change_reason === "rescheduled_reflow") return "改期重算";
  if (snapshot.change_reason === "manual_override") return "手动覆盖";
  if (snapshot.change_reason === "hold_no_progress") {
    if (holdReason === "not_selected") return "未选中（避免同肌群连续进步）";
    if (holdReason === "not_met") return "阈值未达";
    if (holdReason === "pending_retry") return "等待重试";
    if (holdReason === "frequency_gate") return "频率门控";
    if (holdReason === "max_attempts_reached") return "失败上限";
    return "保持不变";
  }

  return "原因未记录";
}

function buildAssistHints(snapshot: ProgressionSnapshot) {
  const hints: Array<{ key: string; label: string; className: string }> = [];
  const meta = snapshot.meta ?? {};

  if (snapshot.change_reason === "rescheduled_reflow" || meta.hold_reason === "rescheduled") {
    hints.push({
      key: "reflow",
      label: "已重算",
      className: "border border-orange-300 bg-orange-50 text-orange-700",
    });
  }

  if (
    snapshot.change_reason === "retry_pending" ||
    meta.retry_flag === true ||
    meta.hold_reason === "pending_retry"
  ) {
    hints.push({
      key: "retry",
      label: "等待重试",
      className: "border border-amber-300 bg-amber-50 text-amber-700",
    });
  }

  if (snapshot.change_reason === "not_selected_in_rotation" || meta.hold_reason === "not_selected") {
    hints.push({
      key: "rotation_wait",
      label: "轮转等待",
      className: "border border-zinc-300 bg-zinc-50 text-zinc-700",
    });
  }

  return hints;
}

type PrimaryNumericDelta = {
  field: PrimaryNumericField;
  before: number;
  after: number;
  delta: number;
};

function resolvePrimaryNumericDelta(snapshot: ProgressionSnapshot): PrimaryNumericDelta | null {
  const before = asRecord(snapshot.before);
  const after = asRecord(snapshot.after);
  const changed = new Set(snapshot.changed_fields);

  for (const field of PRIMARY_NUMERIC_FIELDS) {
    const beforeValue = toNumber(before[field]);
    const afterValue = toNumber(after[field]);
    if (beforeValue === null || afterValue === null) {
      continue;
    }
    if (!changed.has(field) && beforeValue === afterValue) {
      continue;
    }
    return {
      field,
      before: beforeValue,
      after: afterValue,
      delta: Number((afterValue - beforeValue).toFixed(2)),
    };
  }

  return null;
}

function formatPrimaryValue(delta: PrimaryNumericDelta): string {
  if (delta.field === "current_duration_seconds") {
    return `${formatNumber(delta.before)}s -> ${formatNumber(delta.after)}s`;
  }
  return `${formatNumber(delta.before)} -> ${formatNumber(delta.after)}`;
}

function formatStableValue(snapshot: ProgressionSnapshot): string {
  const before = asRecord(snapshot.before);
  const after = asRecord(snapshot.after);

  for (const field of PRIMARY_NUMERIC_FIELDS) {
    const beforeValue = toNumber(before[field]);
    const afterValue = toNumber(after[field]);
    if (beforeValue === null && afterValue === null) {
      continue;
    }
    if (field === "current_duration_seconds") {
      return `${formatNumber(beforeValue ?? 0)}s -> ${formatNumber(afterValue ?? 0)}s`;
    }
    return `${formatNumber(beforeValue ?? 0)} -> ${formatNumber(afterValue ?? 0)}`;
  }

  return "保持不变";
}

function parseActualOutcome(value: unknown): MatrixActualOutcome | null {
  if (value === "success_met" || value === "partial" || value === "failed" || value === "skipped") {
    return value;
  }
  return null;
}

function parseActualSymbol(value: unknown): "✔" | "◐" | "✖" | "⤼" | "-" {
  if (value === "✔" || value === "◐" || value === "✖" || value === "⤼") {
    return value;
  }
  return "-";
}

type ParsedMatrixCellPayload = {
  actual: {
    hasExecutionData: boolean;
    outcome: MatrixActualOutcome | null;
    statusSymbol: "✔" | "◐" | "✖" | "⤼" | "-";
    statusLabel: string;
    plannedSetCount: number;
    completedPlannedCount: number;
    skippedPlannedCount: number;
    pendingPlannedCount: number;
    extraSetCount: number;
    completedRepsTotal: number;
    completedDurationTotal: number;
    coreSet: {
      plannedReps: number | null;
      actualReps: number | null;
      plannedWeight: number | null;
      actualWeight: number | null;
    } | null;
  };
  deviationItems: string[];
  result: {
    outcome: MatrixActualOutcome | null;
    isMeetsTarget: boolean | null;
    holdReason: string | null;
    retryFlag: boolean;
    impactHint: string;
  };
};

function parseMatrixCellPayload(value: unknown): ParsedMatrixCellPayload {
  const record = asRecord(value);
  const actual = asRecord(record.actual);
  const deviation = asRecord(record.deviation);
  const result = asRecord(record.result);
  const coreSet = asRecord(actual.core_set);
  const displayItems = toStringArray(deviation.display_items).slice(0, 2);
  const symbol = parseActualSymbol(actual.status_symbol);
  const label = typeof actual.status_label === "string" ? actual.status_label : "未执行";

  return {
    actual: {
      hasExecutionData: actual.has_execution_data === true,
      outcome: parseActualOutcome(actual.outcome),
      statusSymbol: symbol,
      statusLabel: label,
      plannedSetCount: toNumber(actual.planned_set_count) ?? 0,
      completedPlannedCount: toNumber(actual.completed_planned_count) ?? 0,
      skippedPlannedCount: toNumber(actual.skipped_planned_count) ?? 0,
      pendingPlannedCount: toNumber(actual.pending_planned_count) ?? 0,
      extraSetCount: toNumber(actual.extra_set_count) ?? 0,
      completedRepsTotal: toNumber(actual.completed_reps_total) ?? 0,
      completedDurationTotal: toNumber(actual.completed_duration_total) ?? 0,
      coreSet:
        Object.keys(coreSet).length > 0
          ? {
              plannedReps: toNumber(coreSet.planned_reps),
              actualReps: toNumber(coreSet.actual_reps),
              plannedWeight: toNumber(coreSet.planned_weight),
              actualWeight: toNumber(coreSet.actual_weight),
            }
          : null,
    },
    deviationItems: displayItems,
    result: {
      outcome: parseActualOutcome(result.outcome),
      isMeetsTarget: typeof result.is_meets_target === "boolean" ? result.is_meets_target : null,
      holdReason: typeof result.hold_reason === "string" ? result.hold_reason : null,
      retryFlag: result.retry_flag === true,
      impactHint:
        typeof result.impact_hint === "string" && result.impact_hint.trim().length > 0
          ? result.impact_hint.trim()
          : "等待执行后判断",
    },
  };
}

function scorePlanStatus(status: ActionProgressVisualStatus) {
  if (status === "no_change") return 0;
  if (status === "threshold_progress") return 0.2;
  if (status === "regular_progress") return 1;
  if (status === "realization_round") return 2;
  if (status === "planned_deload") return -0.8;
  return -0.5;
}

function scoreActualOutcome(outcome: "success_met" | "partial" | "failed" | "skipped" | null) {
  if (outcome === "success_met") return 2;
  if (outcome === "partial") return 0.8;
  if (outcome === "failed") return -1;
  if (outcome === "skipped") return -0.4;
  return -0.2;
}

function resolveMatrixIcon(status: ActionProgressVisualStatus, delta: PrimaryNumericDelta | null): ProgressionMatrixIcon {
  if (status === "exception_adjustment") return "⚠";
  if (status === "planned_deload") return "↓";

  if (delta) {
    if (delta.delta < 0) return "↓";
    if (delta.delta > 0 && delta.field === "current_load") return "↑↑";
    if (delta.delta > 0) return "↑";
  }

  if (status === "realization_round") return "↑↑";
  if (status === "regular_progress") return "↑";

  return "→";
}

function buildMatrixAuxFlags(snapshot: ProgressionSnapshot): ProgressionMatrixAuxFlag[] {
  const flags: ProgressionMatrixAuxFlag[] = [];
  const meta = snapshot.meta ?? {};

  if (snapshot.change_reason === "rescheduled_reflow" || meta.hold_reason === "rescheduled") {
    flags.push("reflowed");
  }

  if (
    snapshot.change_reason === "retry_pending" ||
    meta.retry_flag === true ||
    meta.hold_reason === "pending_retry"
  ) {
    flags.push("retry_pending");
  }

  if (snapshot.change_reason === "not_selected_in_rotation" || meta.hold_reason === "not_selected") {
    flags.push("rotation_wait");
  }

  if (
    snapshot.change_reason === "hold_no_progress" &&
    (meta.hold_reason === "not_met" || meta.hold_reason === "not_selected" || meta.hold_reason === "cooldown")
  ) {
    flags.push("next_progression");
  }

  return flags;
}

function isSelectedForProgress(snapshot: ProgressionSnapshot) {
  const holdReason = snapshot.meta?.hold_reason ?? null;
  if (snapshot.change_reason === "not_selected_in_rotation") {
    return false;
  }
  if (holdReason === "not_selected") {
    return false;
  }
  return true;
}

export function getProgressionMatrixAuxFlagLabel(flag: ProgressionMatrixAuxFlag) {
  if (flag === "next_progression") return "下次进阶";
  if (flag === "reflowed") return "已重算";
  if (flag === "retry_pending") return "等待重试";
  return "轮转等待";
}

export function buildProgressionMatrixVisualState(
  snapshotValue: unknown,
  matrixCellPayloadValue?: unknown,
): ProgressionMatrixVisualState {
  const snapshot = normalizeProgressionSnapshot(snapshotValue);
  const payload = parseMatrixCellPayload(matrixCellPayloadValue);
  const actualScore = scoreActualOutcome(payload.actual.outcome);
  if (!snapshot) {
    const tone = getProgressVisualTone("no_change");
    const trendScore = Number((0.6 * scorePlanStatus("no_change") + 0.4 * actualScore).toFixed(3));
    return {
      snapshot: null,
      status: "no_change",
      statusLabel: getStatusLabel("no_change"),
      icon: "→",
      planLine: "无快照",
      actualLine: `${payload.actual.statusSymbol} ${payload.actual.statusLabel}`,
      actualSymbol: payload.actual.statusSymbol,
      actualLabel: payload.actual.statusLabel,
      actualOutcome: payload.actual.outcome,
      deviationItems: payload.deviationItems,
      deviationLine: payload.deviationItems.length > 0 ? payload.deviationItems.join(" · ") : "无偏差",
      mainValue: "无快照",
      reasonShort: payload.result.impactHint,
      cellClassName: tone.matrixCellClassName,
      changedFields: [],
      auxFlags: [],
      isThresholdHit: false,
      isSelectedForProgress: false,
      trendScore,
      actualScore,
      actualDetails: payload.actual,
      resultDetails: payload.result,
    };
  }

  const status = classifyStatus(snapshot);
  const delta = resolvePrimaryNumericDelta(snapshot);
  const icon = resolveMatrixIcon(status, delta);
  const tone = getProgressVisualTone(status);
  const planLine = delta ? formatPrimaryValue(delta) : formatStableValue(snapshot);
  const trendScore = Number((0.6 * scorePlanStatus(status) + 0.4 * actualScore).toFixed(3));

  return {
    snapshot,
    status,
    statusLabel: getStatusLabel(status),
    icon,
    planLine,
    actualLine: `${payload.actual.statusSymbol} ${payload.actual.statusLabel}`,
    actualSymbol: payload.actual.statusSymbol,
    actualLabel: payload.actual.statusLabel,
    actualOutcome: payload.actual.outcome,
    deviationItems: payload.deviationItems,
    deviationLine: payload.deviationItems.length > 0 ? payload.deviationItems.join(" · ") : "无偏差",
    mainValue: planLine,
    reasonShort: buildReasonShort(snapshot),
    cellClassName: tone.matrixCellClassName,
    changedFields: snapshot.changed_fields,
    auxFlags: buildMatrixAuxFlags(snapshot),
    isThresholdHit: snapshot.change_reason === "threshold_reached",
    isSelectedForProgress: isSelectedForProgress(snapshot),
    trendScore,
    actualScore,
    actualDetails: payload.actual,
    resultDetails: payload.result,
  };
}

export function buildActionProgressVisualState(
  snapshotValue: unknown,
  options?: {
    maxFieldChanges?: number;
  },
): ActionProgressVisualState {
  const snapshot = normalizeProgressionSnapshot(snapshotValue);
  if (!snapshot) {
    return {
      status: "no_change",
      statusLabel: "无变化",
      statusLabelEn: "No Change",
      statusClassName: getStatusClassName("no_change"),
      reasonCode: "unknown",
      outcome: "unknown",
      reason: "暂无进步快照",
      changed: false,
      changedFields: [],
      fieldChanges: [],
      forecastLabel: null,
      forecastClassName: null,
      sourceHintLabel: null,
      sourceHintClassName: null,
      assistHints: [],
    };
  }

  const before = asRecord(snapshot.before);
  const after = asRecord(snapshot.after);
  const changedFields = snapshot.changed_fields.filter(isDisplayField);
  const status = classifyStatus(snapshot);
  const fieldChanges = changedFields
    .map((field) => formatChange(field, before[field], after[field]))
    .slice(0, Math.max(1, options?.maxFieldChanges ?? 2));

  const forecast = buildForecast(snapshot);
  const sourceHint = buildSourceHint(snapshot);
  const assistHints = buildAssistHints(snapshot);

  return {
    status,
    statusLabel: getStatusLabel(status),
    statusLabelEn: getStatusLabelEn(status),
    statusClassName: getStatusClassName(status),
    reasonCode: snapshot.change_reason,
    outcome: snapshot.outcome,
    reason: buildReasonText(snapshot),
    changed: changedFields.length > 0 || snapshot.change_type !== "no_change",
    changedFields,
    fieldChanges,
    forecastLabel: forecast?.label ?? null,
    forecastClassName: forecast?.className ?? null,
    sourceHintLabel: sourceHint?.label ?? null,
    sourceHintClassName: sourceHint?.className ?? null,
    assistHints,
  };
}
