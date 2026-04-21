"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ExerciseNameLink } from "@/features/exercise-library/exercise-link";
import {
  ExerciseLibraryItem,
  listExerciseLibraryItems,
} from "@/features/exercise-library/exercise-library-api";
import {
  createTrainingUnitTemplate,
  deleteTrainingUnitTemplate,
  getProgramDetail,
  ProgramDetail,
  UpsertTrainingUnitTemplatePayload,
  updateTrainingUnitTemplate,
} from "@/features/programs/programs-api";
import {
  listTemplateLibraryItems,
  getTemplateLibraryItem,
  TemplateLibraryItem,
  TemplateLibraryItemDetail,
} from "@/features/template-library/template-library-api";
import {
  getBlockTypeLabel,
  getProgressionFamilyLabel,
  getProgressionPolicyTypeLabel,
  getProgramStatusLabel,
  getSportTypeLabel,
  getUnitRoleLabel,
  TERMS_ZH,
} from "@/features/shared/ui-zh";
import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_VALUES,
} from "@/lib/progression-standards";

type ProgramDetailClientProps = {
  userId: string;
  programId: string;
};

function toPayloadObject(payload: unknown): Record<string, unknown> {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function getPayloadString(payload: Record<string, unknown>, key: string, fallback = "") {
  const value = payload[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return fallback;
}

function getExerciseLibraryItemIdFromPayload(payload: Record<string, unknown>) {
  const itemId = payload.exercise_library_item_id;
  return typeof itemId === "string" ? itemId : null;
}

function parseRangeInput(value: string | null) {
  if (!value) {
    return { min: undefined, max: undefined };
  }
  const [rawMin, rawMax] = value.split(",").map((item) => item.trim());
  const min = Number(rawMin);
  const max = Number(rawMax);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: undefined, max: undefined };
  }
  return { min, max };
}

function parseNumberOrString(value: string | null) {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return trimmed;
}

function parseJsonObjectFromPrompt(value: string | null, label: string) {
  if (!value || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("必须是 JSON 对象");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${label}格式错误：${error.message}`);
    }
    throw new Error(`${label}格式错误`);
  }
}

function normalizeProgressionPolicyTypeForPayload(value: string) {
  if ((PROGRESSION_POLICY_TYPE_VALUES as readonly string[]).includes(value)) {
    return value as NonNullable<UpsertTrainingUnitTemplatePayload["progressionPolicyType"]>;
  }
  return "manual" as const;
}

function getUnitSummary(unit: {
  prescription_type: string;
  prescription_payload: Record<string, unknown>;
}) {
  const payload = toPayloadObject(unit.prescription_payload);
  const sets = getPayloadString(payload, "sets");
  const reps = getPayloadString(payload, "reps");
  const durationSeconds = getPayloadString(payload, "duration_seconds");
  const targetRange = payload.target_reps_range;
  const rpeRange = payload.rpe_range;
  const load = toPayloadObject(payload.default_load);
  const loadValue = getPayloadString(load, "value");
  const loadUnit = getPayloadString(load, "unit");

  const parts: string[] = [];
  if (sets) {
    parts.push(`组数 ${sets}`);
  }
  if (unit.prescription_type === "sets_time") {
    if (durationSeconds) {
      parts.push(`时长 ${durationSeconds} 秒`);
    }
  } else if (reps) {
    parts.push(`次数 ${reps}`);
  }
  if (Array.isArray(targetRange) && targetRange.length >= 2) {
    parts.push(`次数范围 ${targetRange[0]}-${targetRange[1]}`);
  }
  if (Array.isArray(rpeRange) && rpeRange.length >= 2) {
    parts.push(`主观用力程度（RPE）${rpeRange[0]}-${rpeRange[1]}`);
  }
  if (loadValue) {
    parts.push(`重量 ${loadValue}${loadUnit ? ` ${loadUnit}` : ""}`);
  }

  return parts.join(" | ") || "未设置处方";
}

function getProgressionSummary(unit: {
  unit_role: string;
  progression_family: string;
  progression_policy_type: string;
  progress_track_key: string;
}) {
  return `角色 ${getUnitRoleLabel(unit.unit_role)} | 家族 ${getProgressionFamilyLabel(
    unit.progression_family,
  )} | 策略 ${getProgressionPolicyTypeLabel(unit.progression_policy_type)} | 跟踪键 ${
    unit.progress_track_key
  }`;
}

export function ProgramDetailClient({ userId, programId }: ProgramDetailClientProps) {
  type UnitTemplateItem =
    ProgramDetail["blocks"][number]["session_templates"][number]["training_unit_templates"][number];
  type EditableSessionTemplate = {
    id: string;
    label: string;
  };

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [actionLibraryItems, setActionLibraryItems] = useState<ExerciseLibraryItem[]>([]);
  const [selectedSessionTemplateId, setSelectedSessionTemplateId] = useState<string>("");
  const [selectedActionLibraryId, setSelectedActionLibraryId] = useState<string>("");
  const [templateLibraryItems, setTemplateLibraryItems] = useState<TemplateLibraryItem[]>([]);
  const [selectedTemplateLibraryItemId, setSelectedTemplateLibraryItemId] = useState<string>("");

  const editableSessionTemplates = useMemo<EditableSessionTemplate[]>(() => {
    if (!program) {
      return [];
    }

    return program.blocks.flatMap((block) =>
      block.session_templates
        .filter((sessionTemplate) => sessionTemplate.enabled)
        .map((sessionTemplate) => ({
          id: sessionTemplate.id,
          label: `${block.name} / ${sessionTemplate.name}`,
        })),
    );
  }, [program]);

  const loadProgram = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [detail, actions, templates] = await Promise.all([
        getProgramDetail(userId, programId),
        listExerciseLibraryItems(userId, { enabled: "true" }),
        listTemplateLibraryItems(userId, { enabled: "true" }),
      ]);
      setProgram(detail);
      setActionLibraryItems(actions);
      setTemplateLibraryItems(templates.filter((item) => item.enabled));
      setSelectedActionLibraryId((current) => current || actions[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载训练计划详情失败");
    } finally {
      setLoading(false);
    }
  }, [programId, userId]);

  useEffect(() => {
    void loadProgram();
  }, [loadProgram]);

  useEffect(() => {
    if (actionLibraryItems.length === 0) {
      setSelectedActionLibraryId("");
      return;
    }
    if (!actionLibraryItems.some((item) => item.id === selectedActionLibraryId)) {
      setSelectedActionLibraryId(actionLibraryItems[0].id);
    }
  }, [actionLibraryItems, selectedActionLibraryId]);

  useEffect(() => {
    if (templateLibraryItems.length === 0) {
      setSelectedTemplateLibraryItemId("");
      return;
    }
    if (templateLibraryItems.some((item) => item.id === selectedTemplateLibraryItemId)) {
      return;
    }
    setSelectedTemplateLibraryItemId(templateLibraryItems[0].id);
  }, [templateLibraryItems, selectedTemplateLibraryItemId]);

  useEffect(() => {
    if (editableSessionTemplates.length === 0) {
      setSelectedSessionTemplateId("");
      return;
    }

    if (editableSessionTemplates.some((item) => item.id === selectedSessionTemplateId)) {
      return;
    }

    setSelectedSessionTemplateId(editableSessionTemplates[0].id);
  }, [editableSessionTemplates, selectedSessionTemplateId]);

  const handleAddUnit = async (sessionTemplateId: string) => {
    const name = window.prompt("动作名称（必填）", "");
    if (!name || !name.trim()) {
      return;
    }

    const typeInput = window.prompt("记录类型：sets_reps（按组次）或 sets_time（按时长）", "sets_reps");
    const prescriptionType = typeInput === "sets_time" ? "sets_time" : "sets_reps";

    const setsInput = window.prompt("组数", "3");
    const sets = setsInput ? Number.parseInt(setsInput, 10) : undefined;
    const repsInput = prescriptionType === "sets_reps" ? window.prompt("次数", "8") : null;
    const durationInput = prescriptionType === "sets_time" ? window.prompt("时长（秒）", "60") : null;
    const loadValueInput = window.prompt("重量值（可填数字或“自重”）", "");
    const loadUnitInput = window.prompt("重量单位（kg / lbs / bodyweight）", "kg");
    const repRangeInput = window.prompt("次数范围（例如 6,12；可留空）", "");
    const rpeRangeInput = window.prompt("RPE 范围（例如 6,9；可留空）", "");
    const notesInput = window.prompt("备注（可留空）", "");

    const repRange = parseRangeInput(repRangeInput);
    const rpeRange = parseRangeInput(rpeRangeInput);

    setActionSaving(true);
    setActionMessage(null);
    setError(null);
    try {
      await createTrainingUnitTemplate(sessionTemplateId, {
        userId,
        name: name.trim(),
        prescriptionType,
        sets: Number.isFinite(sets) ? sets : undefined,
        reps: repsInput ? Number.parseInt(repsInput, 10) : undefined,
        durationSeconds: durationInput ? Number.parseInt(durationInput, 10) : undefined,
        loadValue: parseNumberOrString(loadValueInput),
        loadUnit: loadUnitInput?.trim() || undefined,
        targetRepsMin: repRange.min,
        targetRepsMax: repRange.max,
        rpeMin: rpeRange.min,
        rpeMax: rpeRange.max,
        notes: notesInput ?? undefined,
      });
      setActionMessage("动作已新增。该模板改动会用于后续新生成计划，不追溯已生成安排。");
      await loadProgram();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "新增动作失败");
    } finally {
      setActionSaving(false);
    }
  };

  const handleAddFromActionLibrary = async () => {
    if (!selectedSessionTemplateId) {
      setError("请先选择一个训练日模板作为导入目标。");
      return;
    }

    const action = actionLibraryItems.find((item) => item.id === selectedActionLibraryId);
    if (!action) {
      setError("未找到动作库条目。");
      return;
    }

    setActionSaving(true);
    setActionMessage(null);
    setError(null);

    try {
      const prescriptionType = action.defaultRecordMode === "duration" ? "sets_time" : "sets_reps";
      const loadModel = action.defaultLoadModel === "bodyweight_plus" ? "bodyweight_plus_external" : "external";
      await createTrainingUnitTemplate(selectedSessionTemplateId, {
        userId,
        name: action.name,
        exerciseLibraryItemId: action.id,
        prescriptionType,
        sets: 3,
        reps: prescriptionType === "sets_reps" ? 8 : undefined,
        durationSeconds: prescriptionType === "sets_time" ? 60 : undefined,
        loadValue: undefined,
        loadUnit: loadModel === "external" ? "kg" : "bodyweight",
        notes: action.notes ?? undefined,
      });
      setActionMessage(`已从动作库加入“${action.name}”。该变更仅作用于后续新生成计划。`);
      await loadProgram();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "从动作库添加失败");
    } finally {
      setActionSaving(false);
    }
  };

  const handleImportTemplateLibraryItem = async () => {
    if (!selectedSessionTemplateId) {
      setError("请先选择一个训练日模板作为导入目标。");
      return;
    }

    if (!selectedTemplateLibraryItemId) {
      setError("请先选择一个模板库条目。");
      return;
    }

    let templateDetail: TemplateLibraryItemDetail;
    try {
      templateDetail = await getTemplateLibraryItem(selectedTemplateLibraryItemId, userId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取模板详情失败");
      return;
    }

    if (templateDetail.units.length === 0) {
      setError("当前模板没有动作，请先到模板详情页补充动作。");
      return;
    }

    if (!templateDetail.enabled) {
      setError("该模板已归档，请先启用后再导入。");
      return;
    }

    const templateName = templateDetail.name;
    if (!templateName) {
      setError("未找到模板库条目。");
      return;
    }

    const confirmed = window.confirm(
      `确认将模板“${templateName}”的 ${templateDetail.units.length} 个动作导入当前训练日模板吗？`,
    );
    if (!confirmed) {
      return;
    }

    setActionSaving(true);
    setActionMessage(null);
    setError(null);

    try {
      for (const unit of templateDetail.units) {
        await createTrainingUnitTemplate(selectedSessionTemplateId, {
          userId,
          name: unit.exerciseNameSnapshot,
          exerciseLibraryItemId: unit.exerciseLibraryItemId,
          sourceTemplateLibraryItemId: templateDetail.id,
          unitRole: unit.unitRole,
          progressTrackKey: unit.progressTrackKey,
          progressionFamily: unit.progressionFamily,
          progressionPolicyType: normalizeProgressionPolicyTypeForPayload(
            unit.progressionPolicyType,
          ),
          progressionPolicyConfig: unit.progressionPolicyConfig,
          adjustmentPolicyType: unit.adjustmentPolicyType,
          adjustmentPolicyConfig: unit.adjustmentPolicyConfig,
          successCriteria: unit.successCriteria,
          prescriptionType: unit.recordMode,
          sets: unit.defaultSets,
          reps: unit.defaultReps ?? undefined,
          durationSeconds: unit.defaultDurationSeconds ?? undefined,
          loadValue:
            unit.loadModel === "bodyweight_plus_external"
              ? unit.defaultAdditionalLoadValue ?? undefined
              : unit.defaultLoadValue ?? undefined,
          loadUnit:
            unit.loadModel === "bodyweight_plus_external"
              ? unit.defaultAdditionalLoadUnit ?? "bodyweight"
              : unit.defaultLoadUnit ?? undefined,
          targetRepsMin: unit.targetRepsMin ?? undefined,
          targetRepsMax: unit.targetRepsMax ?? undefined,
          rpeMin: unit.rpeMin ?? undefined,
          rpeMax: unit.rpeMax ?? undefined,
          notes: unit.notes ?? undefined,
        });
      }

      setActionMessage(
        `模板“${templateName}”已导入（${templateDetail.units.length} 个动作）。将用于后续新生成计划。`,
      );
      await loadProgram();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "模板导入失败");
    } finally {
      setActionSaving(false);
    }
  };

  const handleEditUnit = async (unit: UnitTemplateItem) => {
    const payload = toPayloadObject(unit.prescription_payload);
    const defaultLoad = toPayloadObject(payload.default_load);
    const currentRepsRange = Array.isArray(payload.target_reps_range)
      ? String(payload.target_reps_range.join(","))
      : "";
    const currentRpeRange = Array.isArray(payload.rpe_range) ? String(payload.rpe_range.join(",")) : "";

    const name = window.prompt("动作名称", unit.name);
    if (!name || !name.trim()) {
      return;
    }

    const typeInput = window.prompt("记录类型：sets_reps 或 sets_time", unit.prescription_type);
    const prescriptionType = typeInput === "sets_time" ? "sets_time" : "sets_reps";
    const setsInput = window.prompt("组数", getPayloadString(payload, "sets", "3"));
    const repsInput =
      prescriptionType === "sets_reps"
        ? window.prompt("次数", getPayloadString(payload, "reps", "8"))
        : null;
    const durationInput =
      prescriptionType === "sets_time"
        ? window.prompt("时长（秒）", getPayloadString(payload, "duration_seconds", "60"))
        : null;
    const loadValueInput = window.prompt("重量值", getPayloadString(defaultLoad, "value", ""));
    const loadUnitInput = window.prompt("重量单位", getPayloadString(defaultLoad, "unit", "kg"));
    const repRangeInput = window.prompt("次数范围（min,max）", currentRepsRange);
    const rpeRangeInput = window.prompt("RPE 范围（min,max）", currentRpeRange);
    const notesInput = window.prompt("备注", unit.notes ?? "");

    const repRange = parseRangeInput(repRangeInput);
    const rpeRange = parseRangeInput(rpeRangeInput);

    setActionSaving(true);
    setActionMessage(null);
    setError(null);
    try {
      await updateTrainingUnitTemplate(unit.id, {
        userId,
        name: name.trim(),
        prescriptionType,
        sets: setsInput ? Number.parseInt(setsInput, 10) : undefined,
        reps: repsInput ? Number.parseInt(repsInput, 10) : undefined,
        durationSeconds: durationInput ? Number.parseInt(durationInput, 10) : undefined,
        loadValue: parseNumberOrString(loadValueInput),
        loadUnit: loadUnitInput?.trim() || undefined,
        targetRepsMin: repRange.min,
        targetRepsMax: repRange.max,
        rpeMin: rpeRange.min,
        rpeMax: rpeRange.max,
        notes: notesInput ?? undefined,
      });
      setActionMessage("动作已更新。该模板改动会用于后续新生成计划。");
      await loadProgram();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "修改动作失败");
    } finally {
      setActionSaving(false);
    }
  };

  const handleEditUnitProgression = async (unit: UnitTemplateItem) => {
    const unitRoleInput = window.prompt(
      `训练单元角色（${UNIT_ROLE_VALUES.join(" / ")}）`,
      unit.unit_role,
    );
    if (!unitRoleInput) {
      return;
    }

    const progressionFamilyInput = window.prompt(
      `进步家族（${PROGRESSION_FAMILY_VALUES.join(" / ")}）`,
      unit.progression_family,
    );
    if (!progressionFamilyInput) {
      return;
    }

    const progressionPolicyTypeInput = window.prompt(
      `进步策略类型（${PROGRESSION_POLICY_TYPE_VALUES.join(" / ")}）`,
      unit.progression_policy_type,
    );
    if (!progressionPolicyTypeInput) {
      return;
    }

    const adjustmentPolicyTypeInput = window.prompt(
      `调整策略类型（${ADJUSTMENT_POLICY_TYPE_VALUES.join(" / ")}）`,
      unit.adjustment_policy_type,
    );
    if (!adjustmentPolicyTypeInput) {
      return;
    }

    const trackKeyInput = window.prompt("进步跟踪键（progress_track_key）", unit.progress_track_key);
    if (!trackKeyInput || !trackKeyInput.trim()) {
      return;
    }

    const progressionConfigInput = window.prompt(
      "进步策略配置（JSON 对象）",
      JSON.stringify(unit.progression_policy_config ?? {}, null, 2),
    );
    const adjustmentConfigInput = window.prompt(
      "调整策略配置（JSON 对象）",
      JSON.stringify(unit.adjustment_policy_config ?? {}, null, 2),
    );
    const successCriteriaInput = window.prompt(
      "成功判定配置（JSON 对象）",
      JSON.stringify(unit.success_criteria ?? {}, null, 2),
    );

    setActionSaving(true);
    setActionMessage(null);
    setError(null);
    try {
      const progressionPolicyConfig = parseJsonObjectFromPrompt(
        progressionConfigInput,
        "进步策略配置",
      );
      const adjustmentPolicyConfig = parseJsonObjectFromPrompt(
        adjustmentConfigInput,
        "调整策略配置",
      );
      const successCriteria = parseJsonObjectFromPrompt(successCriteriaInput, "成功判定配置");

      await updateTrainingUnitTemplate(unit.id, {
        userId,
        unitRole: unitRoleInput.trim() as NonNullable<UpsertTrainingUnitTemplatePayload["unitRole"]>,
        progressionFamily:
          progressionFamilyInput.trim() as NonNullable<
            UpsertTrainingUnitTemplatePayload["progressionFamily"]
          >,
        progressionPolicyType:
          progressionPolicyTypeInput.trim() as NonNullable<
            UpsertTrainingUnitTemplatePayload["progressionPolicyType"]
          >,
        progressionPolicyConfig,
        adjustmentPolicyType:
          adjustmentPolicyTypeInput.trim() as NonNullable<
            UpsertTrainingUnitTemplatePayload["adjustmentPolicyType"]
          >,
        adjustmentPolicyConfig,
        successCriteria,
        progressTrackKey: trackKeyInput.trim(),
      });

      setActionMessage("进步配置已更新。");
      await loadProgram();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "更新进步配置失败");
    } finally {
      setActionSaving(false);
    }
  };

  const handleDeleteUnit = async (unit: UnitTemplateItem) => {
    const confirmed = window.confirm(`确认从当前训练日模板移除动作“${unit.name}”吗？`);
    if (!confirmed) {
      return;
    }

    setActionSaving(true);
    setActionMessage(null);
    setError(null);
    try {
      const result = await deleteTrainingUnitTemplate(unit.id, userId);
      setActionMessage(
        result.mode === "soft_disabled"
          ? "动作已从模板移除（保留历史关联数据）。"
          : "动作已从模板移除。",
      );
      await loadProgram();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "移除动作失败");
    } finally {
      setActionSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">{TERMS_ZH.program}详情</h1>
        <Link className="text-sm text-blue-700 underline" href={`/programs/${programId}/planned-sessions`}>
          查看已安排训练
        </Link>
      </div>

      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">术语说明</p>
        <p className="mt-1">训练日模板：定义一次训练的整体结构。</p>
        <p>训练单元模板：训练日下的具体动作或训练单元。</p>
        <p className="mt-1 text-xs text-zinc-600">
          模板层改动影响后续新生成计划，不会自动改写当前已安排训练或本次执行记录。
        </p>
      </div>

      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">动作库 / 模板库（最小可用）</p>
        <p className="text-xs text-zinc-600">
          先选择目标训练日模板，再从动作库单个加入，或从模板库批量导入一组动作（模板层标准结构维护）。
        </p>

        <label className="block text-sm text-zinc-700">
          目标训练日模板
          <select
            value={selectedSessionTemplateId}
            onChange={(event) => setSelectedSessionTemplateId(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            disabled={editableSessionTemplates.length === 0 || actionSaving}
          >
            {editableSessionTemplates.length === 0 ? (
              <option value="">暂无可编辑训练日模板</option>
            ) : null}
            {editableSessionTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold text-zinc-900">从动作库拉入动作</p>
            <label className="mt-2 block text-sm text-zinc-700">
              动作选择
              <select
                value={selectedActionLibraryId}
                onChange={(event) => setSelectedActionLibraryId(event.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                disabled={actionSaving}
              >
                {actionLibraryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {actionLibraryItems.length === 0 ? (
              <p className="mt-1 text-[11px] text-zinc-600">
                当前没有启用动作，请先去
                <Link href="/exercise-library" className="mx-1 underline">
                  动作库
                </Link>
                新建并启用动作。
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleAddFromActionLibrary()}
              disabled={actionSaving || !selectedSessionTemplateId || actionLibraryItems.length === 0}
              className="mt-2 rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 disabled:opacity-60"
            >
              从动作库加入
            </button>
          </div>

          <div className="rounded border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold text-zinc-900">从模板库拉入训练日模板</p>
            <label className="mt-2 block text-sm text-zinc-700">
              模板选择
              <select
                value={selectedTemplateLibraryItemId}
                onChange={(event) => setSelectedTemplateLibraryItemId(event.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                disabled={actionSaving}
              >
                {templateLibraryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-1 text-[11px] text-zinc-600">
              {templateLibraryItems.find((item) => item.id === selectedTemplateLibraryItemId)
                ?.description ?? "请选择模板"}
            </p>
            {templateLibraryItems.length === 0 ? (
              <p className="mt-1 text-[11px] text-zinc-600">
                当前没有可用模板，请先去
                <Link href="/template-library" className="mx-1 underline">
                  模板库
                </Link>
                新建并启用模板。
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleImportTemplateLibraryItem()}
              disabled={actionSaving || !selectedSessionTemplateId || templateLibraryItems.length === 0}
              className="mt-2 rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-700 disabled:opacity-60"
            >
              导入模板动作
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="animate-pulse rounded-md border border-zinc-200 bg-white p-4">
            <div className="h-5 w-56 rounded bg-zinc-200" />
            <div className="mt-2 h-3 w-72 rounded bg-zinc-100" />
            <div className="mt-2 h-3 w-64 rounded bg-zinc-100" />
          </div>
          <div className="animate-pulse rounded-md border border-zinc-200 bg-white p-4">
            <div className="h-4 w-40 rounded bg-zinc-200" />
            <div className="mt-2 h-3 w-48 rounded bg-zinc-100" />
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {actionMessage ? <p className="text-sm text-green-700">{actionMessage}</p> : null}

      {!loading && !error && program ? (
        <div className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <p className="text-lg font-medium text-zinc-900">{program.name}</p>
            <p className="mt-1 text-sm text-zinc-600">
              运动类型：{getSportTypeLabel(program.sport_type)} | 状态：{getProgramStatusLabel(program.status)}
            </p>
            <p className="mt-1 text-sm text-zinc-600">目标：{program.goal.name}</p>
            <p className="mt-1 text-sm text-zinc-600">
              开始日期：{new Date(program.start_date).toLocaleDateString()} | 结束日期：{" "}
              {program.end_date ? new Date(program.end_date).toLocaleDateString() : "-"}
            </p>
          </div>

          <div className="space-y-3">
            {program.blocks.map((block) => (
              <article key={block.id} className="rounded-md border border-zinc-200 bg-white p-4">
                <p className="font-medium text-zinc-900">
                  {TERMS_ZH.block} #{block.sequence_no}：{block.name}
                </p>
                <p className="mt-1 text-sm text-zinc-600">类型：{getBlockTypeLabel(block.block_type)}</p>

                <ul className="mt-3 space-y-2">
                  {block.session_templates
                    .filter((sessionTemplate) => sessionTemplate.enabled)
                    .map((sessionTemplate) => {
                      const activeUnits = sessionTemplate.training_unit_templates.filter((unitTemplate) => unitTemplate.is_key_unit);
                      return (
                        <li key={sessionTemplate.id} className="rounded border border-zinc-100 bg-zinc-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold tracking-wide text-zinc-500">{TERMS_ZH.sessionTemplate}</p>
                              <p className="mt-1 text-sm font-medium text-zinc-900">{sessionTemplate.name}</p>
                              <p className="mt-1 text-xs text-zinc-600">训练单元数量：{activeUnits.length}</p>
                            </div>
                            <button
                              type="button"
                              disabled={actionSaving}
                              onClick={() => void handleAddUnit(sessionTemplate.id)}
                              className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 disabled:opacity-60"
                            >
                              新增动作
                            </button>
                          </div>

                          <ul className="mt-2 space-y-1">
                            {activeUnits.map((unitTemplate) => (
                              <li
                                key={unitTemplate.id}
                                className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-xs text-blue-900"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p>
                                    <span className="font-semibold">{TERMS_ZH.trainingUnitTemplate}</span>：#
                                    {unitTemplate.sequence_no}{" "}
                                    <ExerciseNameLink
                                      name={unitTemplate.name}
                                      exerciseLibraryItemId={getExerciseLibraryItemIdFromPayload(
                                        toPayloadObject(unitTemplate.prescription_payload),
                                      )}
                                      className="text-blue-700 underline"
                                      unknownHintClassName="ml-1 text-[11px] text-blue-700"
                                    />
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={actionSaving}
                                      onClick={() => void handleEditUnit(unitTemplate)}
                                      className="rounded border border-indigo-300 px-2 py-1 text-[11px] text-indigo-700 disabled:opacity-60"
                                    >
                                      编辑
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionSaving}
                                      onClick={() => void handleEditUnitProgression(unitTemplate)}
                                      className="rounded border border-violet-300 px-2 py-1 text-[11px] text-violet-700 disabled:opacity-60"
                                    >
                                      进步配置
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionSaving}
                                      onClick={() => void handleDeleteUnit(unitTemplate)}
                                      className="rounded border border-red-300 px-2 py-1 text-[11px] text-red-700 disabled:opacity-60"
                                    >
                                      移除
                                    </button>
                                  </div>
                                </div>
                                <p className="mt-1 text-[11px] text-blue-800">{getUnitSummary(unitTemplate)}</p>
                                <p className="mt-1 text-[11px] text-blue-700">
                                  {getProgressionSummary(unitTemplate)}
                                </p>
                                {unitTemplate.notes ? (
                                  <p className="mt-1 text-[11px] text-blue-700">备注：{unitTemplate.notes}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                </ul>

                {block.session_templates.filter((sessionTemplate) => sessionTemplate.enabled).length === 0 ? (
                  <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    当前训练阶段没有启用的训练日模板，暂时无法生成已安排训练。
                  </p>
                ) : null}
              </article>
            ))}
          </div>

          {program.blocks.length === 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              当前训练计划没有训练阶段或训练日模板，暂时无法生成已安排训练。
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
