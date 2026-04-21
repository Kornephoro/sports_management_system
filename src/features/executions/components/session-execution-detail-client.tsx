"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileCode2,
  ImageDown,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { ExerciseNameLink } from "@/features/exercise-library/exercise-link";
import {
  ExerciseLibraryItem,
  listExerciseLibraryItems,
} from "@/features/exercise-library/exercise-library-api";
import { getMuscleAnatomySvgTemplate } from "@/features/exercise-library/components/muscle-svg-template-cache";
import { TrainingRecordAnatomyPreview } from "@/features/executions/components/training-record-anatomy-preview";
import {
  getMovementPatternLabel,
  getMuscleRegionLabel,
  MovementPatternV1,
  MuscleRegionV1,
} from "@/lib/exercise-library-standards";
import {
  deleteSessionExecution,
  getSessionExecutionDetail,
  SessionExecutionDetailResponse,
} from "@/features/executions/executions-api";
import {
  finalizeSessionExecution,
  getLatestSessionExecutionByPlannedSession,
  SessionExecutionSet,
  SessionExecutionSetStatus,
  updateSessionExecutionSet,
} from "@/features/sessions/sessions-api";
import {
  buildTrainingRecordAnatomyDataUri,
  renderTrainingRecordAnatomySvg,
} from "@/features/executions/training-record-anatomy";
import { AppCard, EmptyState, InlineAlert } from "@/features/shared/components/ui-primitives";
import {
  getSessionExecutionStatusLabel,
} from "@/features/shared/ui-zh";
import { getTrainingStatusBadgeClass } from "@/features/shared/training-semantic-ui";

type Props = {
  userId: string;
  sessionExecutionId: string;
};

type SetDraft = {
  actualRepsInput: string;
  actualWeightInput: string;
  actualRpeInput: string;
  actualRestSecondsInput: string;
  actualTempoInput: string;
  status: SessionExecutionSetStatus;
  noteInput: string;
};

type SetChange = {
  setId: string;
  unitName: string;
  setIndex: number;
  label: string;
  before: string;
  after: string;
};

type UnitWithMeta = SessionExecutionDetailResponse["units"][number] & {
  exercise: ExerciseLibraryItem | null;
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asText(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString("zh-CN")} ${date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "未关联日期";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatSetTypeLabel(setType: string | null) {
  if (!setType) return "工作组";
  const map: Record<string, string> = {
    warmup: "热身",
    working: "正式",
    top_set: "顶组",
    backoff: "回退",
    dropset: "递减",
    failure: "力竭",
    amrap: "AMRAP",
    tempo: "节奏",
    ramp: "爬坡",
    volume: "容量",
    pause: "停顿",
    cluster: "簇组",
  };
  return map[setType] ?? setType;
}

function formatValue(value: string | number | null | undefined, fallback = "-") {
  const text = asText(value).trim();
  return text.length > 0 ? text : fallback;
}

function getExerciseLibraryItemId(unit: SessionExecutionDetailResponse["units"][number]) {
  const payload = toRecord(unit.planned_unit.target_payload);
  const itemId = payload.exercise_library_item_id;
  return typeof itemId === "string" ? itemId : null;
}

function getUnitName(unit: SessionExecutionDetailResponse["units"][number]) {
  return unit.planned_unit.selected_exercise_name?.trim() || `动作 ${unit.planned_unit.sequence_no}`;
}

function getUnitWeightUnit(unit: SessionExecutionDetailResponse["units"][number]) {
  const payload = toRecord(unit.planned_unit.target_payload);
  const loadModel = typeof payload.load_model === "string" ? payload.load_model : "external";
  if (loadModel === "bodyweight_plus_external") {
    return payload.additional_load_unit === "lbs" ? "lbs" : "kg";
  }
  return payload.load_unit === "lbs" ? "lbs" : "kg";
}

function completedSetsOf(unit: SessionExecutionDetailResponse["units"][number]) {
  return unit.sets.filter((setRow) => setRow.status === "completed");
}

function toDraft(setRow: SessionExecutionSet): SetDraft {
  return {
    actualRepsInput: asText(setRow.actual_reps),
    actualWeightInput: asText(setRow.actual_weight),
    actualRpeInput: asText(setRow.actual_rpe),
    actualRestSecondsInput: asText(setRow.actual_rest_seconds),
    actualTempoInput: asText(setRow.actual_tempo),
    status: setRow.status,
    noteInput: setRow.note ?? "",
  };
}

function normalizeNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("请输入非负数字");
  }
  return parsed;
}

function normalizeIntInput(value: string) {
  const parsed = normalizeNumberInput(value);
  if (parsed === null) return null;
  if (!Number.isInteger(parsed)) {
    throw new Error("请输入整数");
  }
  return parsed;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getStatusTone(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "skipped") return "border-zinc-200 bg-zinc-50 text-zinc-600";
  if (status === "extra") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function getSetExecutionStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "未完成",
    completed: "已完成",
    skipped: "已跳过",
    extra: "加组",
  };
  return map[status] ?? status;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildReportHtml({
  detail,
  units,
  muscleRows,
  movementRows,
  totals,
  anatomySvgMarkup,
}: {
  detail: SessionExecutionDetailResponse;
  units: UnitWithMeta[];
  muscleRows: Array<{ label: string; score: number }>;
  movementRows: Array<{ label: string; sets: number }>;
  totals: {
    completedSets: number;
    totalSets: number;
    totalVolume: number;
    totalReps: number;
    avgRpe: number | null;
  };
  anatomySvgMarkup: string | null;
}) {
  const title = detail.session.program?.name ?? "训练记录";
  const statusLabel = getSessionExecutionStatusLabel(detail.session.completion_status);
  const rows = units
    .map((unit) => {
      const unitName = getUnitName(unit);
      const weightUnit = getUnitWeightUnit(unit);
      const setRows = unit.sets
        .map(
          (setRow) => `<tr>
            <td>第 ${setRow.set_index} 组</td>
            <td>${escapeHtml(formatSetTypeLabel(setRow.planned_set_type))}</td>
            <td>${escapeHtml(formatValue(setRow.actual_weight ?? setRow.planned_weight))}${weightUnit}</td>
            <td>${escapeHtml(formatValue(setRow.actual_reps ?? setRow.planned_reps))}</td>
            <td>${escapeHtml(formatValue(setRow.actual_rpe ?? setRow.planned_rpe))}</td>
            <td>${escapeHtml(formatValue(setRow.actual_rest_seconds ?? setRow.planned_rest_seconds))}</td>
            <td>${escapeHtml(getSetExecutionStatusLabel(setRow.status))}</td>
          </tr>`,
        )
        .join("");
      return `<section class="card">
        <div class="unit-head">
          <div>
            <h2>${escapeHtml(unitName)}</h2>
            <p class="muted">${escapeHtml(unit.exercise ? getMovementPatternLabel(unit.exercise.movementPattern) : "未匹配动作库")} · ${completedSetsOf(unit).length} 完成组</p>
          </div>
          <span class="pill">${completedSetsOf(unit).length} / ${unit.sets.length}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>组</th>
              <th>类型</th>
              <th>重量</th>
              <th>次数</th>
              <th>RPE</th>
              <th>休息</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>${setRows}</tbody>
        </table>
      </section>`;
    })
    .join("");

  const anatomySection = anatomySvgMarkup
    ? `<section class="card">
        <div class="section-head">
          <div>
            <h2>肌群统计</h2>
            <p class="muted">主要肌群按 1 组，次要肌群按 0.5 组</p>
          </div>
        </div>
        <div class="anatomy-frame">${anatomySvgMarkup}</div>
        <div class="legend">
          <span><i class="swatch primary"></i>主要肌群</span>
          <span><i class="swatch secondary"></i>次要肌群</span>
        </div>
        <div class="bars">
          ${muscleRows
            .slice(0, 8)
            .map((item, index) => {
              const ratio = muscleRows[0]?.score ? item.score / muscleRows[0].score : 0;
              const tone = index < 3 ? "primary" : "secondary";
              return `<div class="bar-row">
                <div class="bar-head"><span>${escapeHtml(item.label)}</span><strong>${item.score} 组</strong></div>
                <div class="bar-track"><div class="bar-fill ${tone}" style="width:${Math.max(10, Math.round(ratio * 100))}%"></div></div>
              </div>`;
            })
            .join("")}
        </div>
      </section>`
    : `<section class="card"><h2>肌群统计</h2><p class="muted">暂无高亮图，已保留统计列表。</p><div class="chips">${muscleRows
        .slice(0, 8)
        .map((item) => `<span class="chip">${escapeHtml(item.label)} ${item.score}</span>`)
        .join("")}</div></section>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f4f4f5;color:#18181b}
    main{max-width:860px;margin:0 auto;padding:24px}
    h1{font-size:30px;margin:0 0 8px;font-weight:900}
    h2{font-size:18px;margin:0 0 4px;font-weight:850}
    .muted{color:#71717a}
    .topline{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
    .stat,.card{background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:14px}
    .stat strong{display:block;font-size:22px}
    .section-head,.unit-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    .chip,.pill{border-radius:999px;background:#fff7ed;color:#c2410c;padding:6px 10px;font-size:12px;font-weight:700;border:1px solid #fdba74}
    .status-pill{border-radius:999px;background:#ecfdf5;color:#047857;padding:6px 10px;font-size:12px;font-weight:800;border:1px solid #a7f3d0}
    .anatomy-frame{margin-top:14px;overflow:hidden;border:1px solid #e4e4e7;border-radius:24px;background:#fff}
    .anatomy-frame svg{display:block;width:100%;height:auto}
    .legend{display:flex;justify-content:flex-end;gap:18px;margin-top:12px;font-size:12px;font-weight:700;color:#52525b}
    .legend span{display:inline-flex;align-items:center;gap:6px}
    .swatch{display:inline-block;width:12px;height:12px;border-radius:999px}
    .swatch.primary{background:#ef4444}
    .swatch.secondary{background:#f59e0b}
    .bars{display:grid;gap:10px;margin-top:14px}
    .bar-head{display:flex;justify-content:space-between;gap:12px;font-size:13px;font-weight:700}
    .bar-track{height:8px;border-radius:999px;background:#f4f4f5;overflow:hidden}
    .bar-fill{height:100%;border-radius:999px}
    .bar-fill.primary{background:linear-gradient(90deg,#fb923c,#ef4444)}
    .bar-fill.secondary{background:linear-gradient(90deg,#fdba74,#f59e0b)}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
    th,td{border-top:1px solid #e4e4e7;padding:8px;text-align:left}
    th{color:#71717a;font-size:12px}
    @media (max-width:720px){main{padding:16px}.grid{grid-template-columns:repeat(2,1fr)}}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <div class="topline">
      <p class="muted">${escapeHtml(formatDateTime(detail.session.performed_at))}</p>
      <span class="status-pill">${escapeHtml(statusLabel)}</span>
      <span class="muted">平均 RPE ${totals.avgRpe === null ? "-" : totals.avgRpe.toFixed(1)}</span>
    </div>
    <div class="grid">
      <div class="stat"><strong>${totals.completedSets}/${totals.totalSets}</strong><span>完成组</span></div>
      <div class="stat"><strong>${Math.round(totals.totalVolume)}</strong><span>总训练量</span></div>
      <div class="stat"><strong>${totals.totalReps}</strong><span>总次数</span></div>
      <div class="stat"><strong>${detail.session.actual_duration_min ?? "-"}</strong><span>分钟</span></div>
    </div>
    ${anatomySection}
    <section class="card">
      <h2>动作模式</h2>
      <div class="chips">${movementRows
        .map((item) => `<span class="chip">${escapeHtml(item.label)} ${item.sets} 组</span>`)
        .join("")}</div>
    </section>
    ${rows}
  </main>
</body>
</html>`;
}

export function SessionExecutionDetailClient({ userId, sessionExecutionId }: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState<SessionExecutionDetailResponse | null>(null);
  const [exerciseItems, setExerciseItems] = useState<ExerciseLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [pendingChanges, setPendingChanges] = useState<SetChange[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [latestExecutionId, setLatestExecutionId] = useState<string | null>(null);
  const [anatomyTemplate, setAnatomyTemplate] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDetail, nextExercises, nextAnatomyTemplate] = await Promise.all([
        getSessionExecutionDetail(sessionExecutionId, userId),
        listExerciseLibraryItems(userId, { enabled: "all" }),
        getMuscleAnatomySvgTemplate().catch(() => null),
      ]);
      setDetail(nextDetail);
      setExerciseItems(nextExercises);
      setAnatomyTemplate(nextAnatomyTemplate);
      if (nextDetail.session.planned_session?.id) {
        const latestExecution = await getLatestSessionExecutionByPlannedSession(
          nextDetail.session.planned_session.id,
          userId,
        ).catch(() => null);
        setLatestExecutionId(latestExecution?.id ?? null);
      } else {
        setLatestExecutionId(nextDetail.session.id);
      }
      const nextDrafts: Record<string, SetDraft> = {};
      nextDetail.units.forEach((unit) => {
        unit.sets.forEach((setRow) => {
          nextDrafts[setRow.id] = toDraft(setRow);
        });
      });
      setDrafts(nextDrafts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载训练记录详情失败");
    } finally {
      setLoading(false);
    }
  }, [sessionExecutionId, userId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const exerciseById = useMemo(
    () => new Map(exerciseItems.map((item) => [item.id, item])),
    [exerciseItems],
  );

  const units = useMemo<UnitWithMeta[]>(() => {
    if (!detail) return [];
    return detail.units.map((unit) => {
      const itemId = getExerciseLibraryItemId(unit);
      return {
        ...unit,
        exercise: itemId ? exerciseById.get(itemId) ?? null : null,
      };
    });
  }, [detail, exerciseById]);

  const totals = useMemo(() => {
    const allSets = units.flatMap((unit) => unit.sets);
    const completedSets = allSets.filter((setRow) => setRow.status === "completed");
    const totalVolume = completedSets.reduce((sum, setRow) => {
      const weight = Number(setRow.actual_weight ?? setRow.planned_weight ?? 0);
      const reps = Number(setRow.actual_reps ?? setRow.planned_reps ?? 0);
      if (!Number.isFinite(weight) || !Number.isFinite(reps)) return sum;
      return sum + weight * reps;
    }, 0);
    const totalReps = completedSets.reduce((sum, setRow) => {
      const reps = Number(setRow.actual_reps ?? setRow.planned_reps ?? 0);
      return Number.isFinite(reps) ? sum + reps : sum;
    }, 0);
    const avgRpeValues = completedSets
      .map((setRow) => Number(setRow.actual_rpe ?? setRow.planned_rpe))
      .filter((value) => Number.isFinite(value));
    return {
      totalSets: allSets.length,
      completedSets: completedSets.length,
      skippedSets: allSets.filter((setRow) => setRow.status === "skipped").length,
      totalVolume,
      totalReps,
      avgRpe:
        avgRpeValues.length > 0
          ? avgRpeValues.reduce((sum, value) => sum + value, 0) / avgRpeValues.length
          : null,
    };
  }, [units]);

  const muscleStats = useMemo(() => {
    const scoreByRegion = new Map<MuscleRegionV1, number>();
    units.forEach((unit) => {
      if (!unit.exercise) return;
      const completedCount = completedSetsOf(unit).length;
      if (completedCount === 0) return;
      unit.exercise.primaryRegions.forEach((region) => {
        scoreByRegion.set(region, (scoreByRegion.get(region) ?? 0) + completedCount);
      });
      unit.exercise.secondaryRegions.forEach((region) => {
        scoreByRegion.set(region, (scoreByRegion.get(region) ?? 0) + completedCount * 0.5);
      });
    });
    const rows = Array.from(scoreByRegion.entries())
      .map(([region, score]) => ({
        region,
        label: getMuscleRegionLabel(region),
        score: Math.round(score * 10) / 10,
      }))
      .sort((a, b) => b.score - a.score);
    const maxScore = rows[0]?.score ?? 0;
    const intensity = Object.fromEntries(
      rows.map((row) => [row.region, maxScore > 0 ? row.score / maxScore : 0]),
    );
    return {
      rows,
      intensity,
      primary: rows.filter((row) => row.score >= Math.max(1, maxScore * 0.55)).map((row) => row.region),
      secondary: rows.filter((row) => row.score > 0 && row.score < Math.max(1, maxScore * 0.55)).map((row) => row.region),
    };
  }, [units]);

  const movementStats = useMemo(() => {
    const countByPattern = new Map<MovementPatternV1, number>();
    units.forEach((unit) => {
      if (!unit.exercise) return;
      const completedCount = completedSetsOf(unit).length;
      if (completedCount === 0) return;
      countByPattern.set(
        unit.exercise.movementPattern,
        (countByPattern.get(unit.exercise.movementPattern) ?? 0) + completedCount,
      );
    });
    return Array.from(countByPattern.entries())
      .map(([pattern, sets]) => ({
        pattern,
        label: getMovementPatternLabel(pattern),
        sets,
      }))
      .sort((a, b) => b.sets - a.sets);
  }, [units]);

  const anatomySvgMarkup = useMemo(() => {
    if (!anatomyTemplate || muscleStats.rows.length === 0) {
      return null;
    }
    return renderTrainingRecordAnatomySvg({
      template: anatomyTemplate,
      primary: muscleStats.primary,
      secondary: muscleStats.secondary,
      showLabels: true,
    });
  }, [anatomyTemplate, muscleStats.primary, muscleStats.rows.length, muscleStats.secondary]);

  const anatomyDataUri = useMemo(() => {
    if (!anatomyTemplate || muscleStats.rows.length === 0) {
      return null;
    }
    return buildTrainingRecordAnatomyDataUri({
      template: anatomyTemplate,
      primary: muscleStats.primary,
      secondary: muscleStats.secondary,
      showLabels: true,
    });
  }, [anatomyTemplate, muscleStats.primary, muscleStats.rows.length, muscleStats.secondary]);

  const isLatestExecution = useMemo(() => {
    if (!detail) return true;
    if (!detail.session.planned_session?.id) return true;
    if (!latestExecutionId) return true;
    return latestExecutionId === detail.session.id;
  }, [detail, latestExecutionId]);

  const changeSetDraft = (setId: string, patch: Partial<SetDraft>) => {
    setDrafts((current) => ({
      ...current,
      [setId]: {
        ...current[setId],
        ...patch,
      },
    }));
  };

  const collectChanges = useCallback(() => {
    if (!detail) return [];
    const changes: SetChange[] = [];
    detail.units.forEach((unit) => {
      const unitName = getUnitName(unit);
      unit.sets.forEach((setRow) => {
        const draft = drafts[setRow.id];
        if (!draft) return;
        const candidates = [
          ["重量", asText(setRow.actual_weight), draft.actualWeightInput],
          ["次数", asText(setRow.actual_reps), draft.actualRepsInput],
          ["RPE", asText(setRow.actual_rpe), draft.actualRpeInput],
          ["休息", asText(setRow.actual_rest_seconds), draft.actualRestSecondsInput],
          ["节奏", asText(setRow.actual_tempo), draft.actualTempoInput],
          ["状态", setRow.status, draft.status],
          ["备注", setRow.note ?? "", draft.noteInput],
        ] as const;
        candidates.forEach(([label, before, after]) => {
          if (before.trim() !== after.trim()) {
            changes.push({
              setId: setRow.id,
              unitName,
              setIndex: setRow.set_index,
              label,
              before: before.trim() || "-",
              after: after.trim() || "-",
            });
          }
        });
      });
    });
    return changes;
  }, [detail, drafts]);

  const openSaveConfirm = () => {
    const changes = collectChanges();
    if (changes.length === 0) {
      setEditMode(false);
      setMessage("没有需要保存的修改。");
      return;
    }
    setPendingChanges(changes);
    setConfirmOpen(true);
  };

  const saveChanges = async () => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const changedSetIds = [...new Set(pendingChanges.map((item) => item.setId))];
      for (const setId of changedSetIds) {
        const draft = drafts[setId];
        if (!draft) continue;
        await updateSessionExecutionSet(setId, {
          userId,
          actualReps: normalizeIntInput(draft.actualRepsInput),
          actualWeight: normalizeNumberInput(draft.actualWeightInput),
          actualRpe: normalizeNumberInput(draft.actualRpeInput),
          actualRestSeconds: normalizeIntInput(draft.actualRestSecondsInput),
          actualTempo: draft.actualTempoInput.trim() || null,
          status: draft.status,
          note: draft.noteInput,
        });
      }
      await finalizeSessionExecution(detail.session.id, {
        userId,
        actualDurationMin: detail.session.actual_duration_min ?? undefined,
        notes: detail.session.notes ?? undefined,
      });
      setConfirmOpen(false);
      setEditMode(false);
      setPendingChanges([]);
      await loadDetail();
      setMessage("训练记录已修正，并已重新汇总后续训练影响。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存训练记录修正失败");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (detail) {
      const nextDrafts: Record<string, SetDraft> = {};
      detail.units.forEach((unit) => {
        unit.sets.forEach((setRow) => {
          nextDrafts[setRow.id] = toDraft(setRow);
        });
      });
      setDrafts(nextDrafts);
    }
    setEditMode(false);
    setPendingChanges([]);
    setConfirmOpen(false);
  };

  const openDeleteConfirm = () => {
    setExportMenuOpen(false);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteExecution = async () => {
    if (!detail) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await deleteSessionExecution(detail.session.id, userId);
      router.push("/training?view=calendar");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除训练记录失败");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const exportHtml = () => {
    if (!detail) return;
    const html = buildReportHtml({
      detail,
      units,
      muscleRows: muscleStats.rows,
      movementRows: movementStats,
      totals,
      anatomySvgMarkup,
    });
    downloadTextFile(`training-record-${detail.session.id}.html`, html, "text/html;charset=utf-8");
    setExportMenuOpen(false);
  };

  const exportImage = async () => {
    if (!detail) return;
    const title = detail.session.program?.name ?? "训练记录";
    const statusLabel = getSessionExecutionStatusLabel(detail.session.completion_status);
    const unitCards = units.map((unit) => ({
      unit,
      headerHeight: 82,
      tableHeaderHeight: 30,
      setRowHeight: Math.max(unit.sets.length, 1) * 34,
      footerHeight: 14,
    }));
    const summaryHeight = 230;
    const anatomyHeight =
      anatomyDataUri
        ? 640 + Math.max(0, muscleStats.rows.slice(0, 8).length - 3) * 44
        : 220;
    const movementRowCount = Math.max(1, Math.ceil(Math.max(movementStats.length, 1) / 4));
    const movementHeight = 120 + movementRowCount * 104;
    const unitBlockHeight = unitCards.reduce(
      (sum, item) => sum + item.headerHeight + item.tableHeaderHeight + item.setRowHeight + item.footerHeight + 36,
      0,
    );
    const totalHeight = 210 + summaryHeight + anatomyHeight + movementHeight + unitBlockHeight + 140;
    const anatomyChartStartY = 446;
    const anatomyRowsStartY = anatomyDataUri ? 958 : 492;
    const anatomyRowsEndY = anatomyRowsStartY + muscleStats.rows.slice(0, 8).length * 44;
    const movementStartY = Math.max(anatomyRowsEndY + 74, anatomyDataUri ? 1278 : 760);
    const movementCardY = movementStartY + 26;
    const movementCardRows = Array.from({ length: movementRowCount }, (_, rowIndex) =>
      movementStats.slice(rowIndex * 4, rowIndex * 4 + 4),
    );
    const unitsStartY = movementCardY + movementRowCount * 104 + 88;
    let currentUnitY = unitsStartY + 26;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${totalHeight}" viewBox="0 0 1080 ${totalHeight}">
      <rect width="1080" height="${totalHeight}" fill="#f4f4f5"/>
      <rect x="42" y="42" width="996" height="${totalHeight - 84}" rx="36" fill="#ffffff" stroke="#e4e4e7"/>
      <text x="88" y="132" font-family="Arial, sans-serif" font-size="56" font-weight="900" fill="#18181b">${escapeHtml(title)}</text>
      <text x="88" y="182" font-family="Arial, sans-serif" font-size="26" fill="#71717a">${escapeHtml(formatDateTime(detail.session.performed_at))}</text>
      <rect x="88" y="196" width="154" height="38" rx="19" fill="#ecfdf5" stroke="#a7f3d0"/>
      <text x="118" y="221" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="#047857">${escapeHtml(statusLabel)}</text>
      <text x="272" y="221" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#71717a">平均 RPE ${totals.avgRpe === null ? "-" : totals.avgRpe.toFixed(1)}</text>

      <rect x="88" y="226" width="214" height="124" rx="24" fill="#ffffff" stroke="#e4e4e7"/>
      <rect x="322" y="226" width="214" height="124" rx="24" fill="#ffffff" stroke="#e4e4e7"/>
      <rect x="556" y="226" width="214" height="124" rx="24" fill="#ffffff" stroke="#e4e4e7"/>
      <rect x="790" y="226" width="202" height="124" rx="24" fill="#ffffff" stroke="#e4e4e7"/>
      <text x="112" y="286" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#18181b">${totals.completedSets}/${totals.totalSets}</text>
      <text x="112" y="324" font-family="Arial, sans-serif" font-size="22" fill="#71717a">完成组</text>
      <text x="346" y="286" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#18181b">${Math.round(totals.totalVolume)}</text>
      <text x="346" y="324" font-family="Arial, sans-serif" font-size="22" fill="#71717a">总训练量</text>
      <text x="580" y="286" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#18181b">${totals.totalReps}</text>
      <text x="580" y="324" font-family="Arial, sans-serif" font-size="22" fill="#71717a">总次数</text>
      <text x="814" y="286" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#18181b">${detail.session.actual_duration_min ?? "-"}</text>
      <text x="814" y="324" font-family="Arial, sans-serif" font-size="22" fill="#71717a">分钟</text>

      <text x="88" y="418" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#18181b">肌群统计</text>
      ${
        anatomyDataUri
          ? `<rect x="88" y="${anatomyChartStartY}" width="904" height="470" rx="28" fill="#ffffff" stroke="#e4e4e7"/>
             <image href="${anatomyDataUri}" x="118" y="${anatomyChartStartY + 28}" width="844" height="388" preserveAspectRatio="xMidYMid meet"/>
             <circle cx="808" cy="${anatomyChartStartY + 442}" r="8" fill="#ef4444" />
             <text x="826" y="${anatomyChartStartY + 448}" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#52525b">主要肌群</text>
             <circle cx="934" cy="${anatomyChartStartY + 442}" r="8" fill="#f59e0b" />
             <text x="952" y="${anatomyChartStartY + 448}" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#52525b">次要肌群</text>`
          : `<text x="88" y="462" font-family="Arial, sans-serif" font-size="24" fill="#71717a">暂无高亮图</text>`
      }
      ${muscleStats.rows
        .slice(0, 8)
        .map((item, index) => {
          const y = anatomyRowsStartY + index * 44;
          const width = muscleStats.rows[0]?.score ? Math.max(120, Math.round((item.score / muscleStats.rows[0].score) * 280)) : 120;
          const fill = index < 3 ? "url(#primaryBar)" : "url(#secondaryBar)";
          return `<text x="88" y="${y}" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#27272a">${escapeHtml(item.label)}</text>
            <rect x="282" y="${y - 18}" width="320" height="12" rx="6" fill="#f4f4f5"/>
            <rect x="282" y="${y - 18}" width="${width}" height="12" rx="6" fill="${fill}"/>
            <text x="624" y="${y}" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#71717a">${item.score} 组</text>`;
        })
        .join("")}

      <defs>
        <linearGradient id="primaryBar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#fb923c"/>
          <stop offset="100%" stop-color="#ef4444"/>
        </linearGradient>
        <linearGradient id="secondaryBar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#fdba74"/>
          <stop offset="100%" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>

      <text x="88" y="${movementStartY}" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#18181b">动作模式</text>
      ${movementCardRows
        .map((row, rowIndex) =>
          row
            .map((item, index) => {
              const x = 88 + index * 226;
              const y = movementCardY + rowIndex * 104;
              return `<rect x="${x}" y="${y}" width="206" height="88" rx="22" fill="#fff7ed" stroke="#fdba74"/>
                <text x="${x + 24}" y="${y + 38}" font-family="Arial, sans-serif" font-size="28" font-weight="900" fill="#c2410c">${item.sets} 组</text>
                <text x="${x + 24}" y="${y + 66}" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#7c2d12">${escapeHtml(item.label)}</text>`;
            })
            .join(""),
        )
        .join("")}

      <text x="88" y="${unitsStartY}" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#18181b">动作与组信息</text>
      ${unitCards
        .map(({ unit, headerHeight, tableHeaderHeight, setRowHeight, footerHeight }) => {
          const cardHeight = headerHeight + tableHeaderHeight + setRowHeight + footerHeight;
          const y = currentUnitY;
          currentUnitY += cardHeight + 36;
          return `<rect x="88" y="${y}" width="904" height="${cardHeight}" rx="24" fill="#ffffff" stroke="#e4e4e7"/>
            <text x="116" y="${y + 34}" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#18181b">${escapeHtml(getUnitName(unit))}</text>
            <text x="116" y="${y + 64}" font-family="Arial, sans-serif" font-size="18" fill="#71717a">${escapeHtml(unit.exercise ? getMovementPatternLabel(unit.exercise.movementPattern) : "未匹配动作库")} · ${completedSetsOf(unit).length}/${unit.sets.length} 组</text>
            <text x="116" y="${y + 102}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#71717a">组次</text>
            <text x="204" y="${y + 102}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#71717a">类型</text>
            <text x="358" y="${y + 102}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#71717a">重量</text>
            <text x="500" y="${y + 102}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#71717a">次数</text>
            <text x="598" y="${y + 102}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#71717a">RPE</text>
            <text x="680" y="${y + 102}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#71717a">休息</text>
            <text x="790" y="${y + 102}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#71717a">状态</text>
            ${unit.sets
              .map((setRow, index) => {
                const rowY = y + 132 + index * 34;
                return `<line x1="112" y1="${rowY - 18}" x2="968" y2="${rowY - 18}" stroke="#e4e4e7"/>
                  <text x="116" y="${rowY}" font-family="Arial, sans-serif" font-size="16" fill="#27272a">第 ${setRow.set_index} 组</text>
                  <text x="204" y="${rowY}" font-family="Arial, sans-serif" font-size="16" fill="#27272a">${escapeHtml(formatSetTypeLabel(setRow.planned_set_type))}</text>
                  <text x="358" y="${rowY}" font-family="Arial, sans-serif" font-size="16" fill="#27272a">${escapeHtml(formatValue(setRow.actual_weight ?? setRow.planned_weight))}${getUnitWeightUnit(unit)}</text>
                  <text x="500" y="${rowY}" font-family="Arial, sans-serif" font-size="16" fill="#27272a">${escapeHtml(formatValue(setRow.actual_reps ?? setRow.planned_reps))}</text>
                  <text x="598" y="${rowY}" font-family="Arial, sans-serif" font-size="16" fill="#27272a">${escapeHtml(formatValue(setRow.actual_rpe ?? setRow.planned_rpe))}</text>
                  <text x="680" y="${rowY}" font-family="Arial, sans-serif" font-size="16" fill="#27272a">${escapeHtml(formatValue(setRow.actual_rest_seconds ?? setRow.planned_rest_seconds))}</text>
                  <text x="790" y="${rowY}" font-family="Arial, sans-serif" font-size="16" fill="#27272a">${escapeHtml(getSetExecutionStatusLabel(setRow.status))}</text>`;
              })
              .join("")}
            ${unit.sets.length === 0
              ? `<text x="116" y="${y + 150}" font-family="Arial, sans-serif" font-size="16" fill="#71717a">暂无组数据</text>`
              : ""}`;
        })
        .join("")}
    </svg>`;
    const image = new Image();
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("生成图片失败"));
      image.src = svgUrl;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = 1080 * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("当前浏览器不支持图片导出");
    }
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, 1080, totalHeight);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (!nextBlob) {
          reject(new Error("导出图片失败"));
          return;
        }
        resolve(nextBlob);
      }, "image/png");
    });
    const pngUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = `training-record-${detail.session.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(pngUrl);
    setExportMenuOpen(false);
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[560px] space-y-3 px-3 py-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/60"
          />
        ))}
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-3 py-4">
        <InlineAlert tone="error">{error}</InlineAlert>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-3 py-4">
        <EmptyState title="没有找到这条训练记录" hint="可以回到训练日程重新打开。" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-3 px-3 py-4 sm:px-4">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-[28px] font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              {detail.session.program?.name ?? "训练记录"}
            </h1>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {formatDate(detail.session.planned_session?.session_date)} ·{" "}
              {formatDateTime(detail.session.performed_at)}
            </p>
          </div>
          <span className={getTrainingStatusBadgeClass(detail.session.completion_status)}>
            {getSessionExecutionStatusLabel(detail.session.completion_status)}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <AppCard className="p-2.5">
            <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">
              {totals.completedSets}/{totals.totalSets}
            </p>
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">完成组</p>
          </AppCard>
          <AppCard className="p-2.5">
            <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">
              {Math.round(totals.totalVolume)}
            </p>
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">总量</p>
          </AppCard>
          <AppCard className="p-2.5">
            <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">{totals.totalReps}</p>
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">次数</p>
          </AppCard>
          <AppCard className="p-2.5">
            <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">
              {totals.avgRpe === null ? "-" : totals.avgRpe.toFixed(1)}
            </p>
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">均RPE</p>
          </AppCard>
        </div>
      </header>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}

      <AppCard emphasis="soft" className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">后续影响</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              本页只修正训练记录。保存修正后会重新汇总本次组数据，并可能改变后续重量、目标次数或进阶判断。
            </p>
          </div>
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        </div>
      </AppCard>

      <div className="grid grid-cols-3 gap-2">
        {editMode ? (
          <>
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <X className="h-4 w-4" />
              取消
            </button>
            <button
              type="button"
              onClick={openSaveConfirm}
              className="col-span-2 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-black text-white"
            >
              <Save className="h-4 w-4" />
              保存修正
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-sm font-black text-white dark:bg-blue-600"
            >
              <Pencil className="h-4 w-4" />
              调整数据
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setExportMenuOpen((current) => !current);
              }}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <Download className="h-4 w-4" />
              导出
              <ChevronDown className={cn("h-4 w-4 transition-transform", exportMenuOpen && "rotate-180")} />
            </button>
            <button
              type="button"
              onClick={openDeleteConfirm}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </>
        )}
      </div>

      {exportMenuOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3">
          <div className="w-full max-w-[560px] rounded-[28px] border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-lg font-black text-zinc-900 dark:text-zinc-50">导出</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  图片适合分享复盘，网页适合完整留档，两者都会带上当前肌群高亮图。
                </p>
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => void exportImage()}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-left dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div>
                    <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">导出图片</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">保留摘要、肌群图、动作模式和关键组信息</p>
                  </div>
                  <ImageDown className="h-5 w-5 text-zinc-500" />
                </button>
                <button
                  type="button"
                  onClick={exportHtml}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-left dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div>
                    <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">导出网页</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">完整保留肌群图、动作模式和全部组数据</p>
                  </div>
                  <FileCode2 className="h-5 w-5 text-zinc-500" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setExportMenuOpen(false)}
                className="h-11 w-full rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AppCard className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">肌群统计</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">主要肌群按 1 组，次要肌群按 0.5 组</p>
          </div>
        </div>
        {muscleStats.rows.length > 0 ? (
          <>
            <TrainingRecordAnatomyPreview
              primary={muscleStats.primary}
              secondary={muscleStats.secondary}
            />
            <div className="space-y-2">
              {muscleStats.rows.slice(0, 8).map((item) => {
                const ratio = muscleStats.rows[0]?.score ? item.score / muscleStats.rows[0].score : 0;
                return (
                  <div key={item.region} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-700 dark:text-zinc-200">{item.label}</span>
                      <span className="text-zinc-500 dark:text-zinc-400">{item.score} 组</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          item.score >= Math.max(1, (muscleStats.rows[0]?.score ?? 0) * 0.55)
                            ? "bg-gradient-to-r from-orange-400 to-red-500"
                            : "bg-gradient-to-r from-amber-300 to-orange-400",
                        )}
                        style={{ width: `${Math.max(8, Math.round(ratio * 100))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState title="暂无肌群统计" hint="有些动作还没有匹配动作库肌群定义。" />
        )}
      </AppCard>

      <AppCard className="space-y-3 p-3">
        <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">动作模式</p>
        {movementStats.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {movementStats.map((item) => (
              <div
                key={item.pattern}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/40"
              >
                <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">{item.sets} 组</p>
                <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">{item.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无动作模式统计" hint="动作库匹配后会按完成组数统计。" />
        )}
      </AppCard>

      <div className="space-y-2">
        <p className="px-1 text-sm font-black text-zinc-900 dark:text-zinc-50">动作与组数据</p>
        {units.map((unit) => {
          const itemId = getExerciseLibraryItemId(unit);
          const weightUnit = getUnitWeightUnit(unit);
          return (
            <AppCard key={unit.planned_unit.id} className="space-y-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="text-base font-black text-zinc-900 dark:text-zinc-50">
                    <ExerciseNameLink
                      name={getUnitName(unit)}
                      exerciseLibraryItemId={itemId}
                      className="text-zinc-900 dark:text-zinc-50"
                      unknownHintClassName="ml-1 text-[11px] text-zinc-500"
                    />
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {unit.exercise
                      ? `${getMovementPatternLabel(unit.exercise.movementPattern)} · ${completedSetsOf(unit).length} 完成组`
                      : "未匹配动作库统计"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-1 text-[11px] font-bold",
                    unit.all_sets_completed
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600",
                  )}
                >
                  {unit.all_sets_completed ? "全部完成" : "有偏差"}
                </span>
              </div>

              <div className="space-y-2">
                {unit.sets.map((setRow) => {
                  const draft = drafts[setRow.id] ?? toDraft(setRow);
                  return (
                    <div
                      key={setRow.id}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950/40"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-black text-zinc-900 dark:text-zinc-50">
                            第 {setRow.set_index} 组
                            {setRow.is_extra_set ? " · 加组" : ""}
                          </p>
                          <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                            {formatSetTypeLabel(setRow.planned_set_type)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                            getStatusTone(editMode ? draft.status : setRow.status),
                          )}
                        >
                          {getSetExecutionStatusLabel(editMode ? draft.status : setRow.status)}
                        </span>
                      </div>

                      {editMode ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold text-zinc-500">重量</span>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                inputMode="decimal"
                                value={draft.actualWeightInput}
                                placeholder={formatValue(setRow.planned_weight)}
                                onChange={(event) =>
                                  changeSetDraft(setRow.id, { actualWeightInput: event.target.value })
                                }
                                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-bold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold text-zinc-500">次数</span>
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={draft.actualRepsInput}
                                placeholder={formatValue(setRow.planned_reps)}
                                onChange={(event) =>
                                  changeSetDraft(setRow.id, { actualRepsInput: event.target.value })
                                }
                                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-bold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold text-zinc-500">RPE</span>
                              <input
                                type="number"
                                min={0}
                                max={10}
                                step={0.5}
                                inputMode="decimal"
                                value={draft.actualRpeInput}
                                placeholder={formatValue(setRow.planned_rpe)}
                                onChange={(event) =>
                                  changeSetDraft(setRow.id, { actualRpeInput: event.target.value })
                                }
                                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-bold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                              />
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold text-zinc-500">休息秒数</span>
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={draft.actualRestSecondsInput}
                                placeholder={formatValue(setRow.planned_rest_seconds)}
                                onChange={(event) =>
                                  changeSetDraft(setRow.id, {
                                    actualRestSecondsInput: event.target.value,
                                  })
                                }
                                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-bold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold text-zinc-500">状态</span>
                              <select
                                value={draft.status}
                                onChange={(event) =>
                                  changeSetDraft(setRow.id, {
                                    status: event.target.value as SessionExecutionSetStatus,
                                  })
                                }
                                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-bold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                              >
                                <option value="pending">未完成</option>
                                <option value="completed">完成</option>
                                <option value="skipped">跳过</option>
                                <option value="extra">加组</option>
                              </select>
                            </label>
                          </div>
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold text-zinc-500">组备注</span>
                            <input
                              value={draft.noteInput}
                              onChange={(event) =>
                                changeSetDraft(setRow.id, { noteInput: event.target.value })
                              }
                              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5 text-center">
                          <div className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-900">
                            <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                              {formatValue(setRow.actual_weight ?? setRow.planned_weight)}
                            </p>
                            <p className="text-[10px] text-zinc-500">{weightUnit}</p>
                          </div>
                          <div className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-900">
                            <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                              {formatValue(setRow.actual_reps ?? setRow.planned_reps)}
                            </p>
                            <p className="text-[10px] text-zinc-500">次数</p>
                          </div>
                          <div className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-900">
                            <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                              {formatValue(setRow.actual_rpe ?? setRow.planned_rpe)}
                            </p>
                            <p className="text-[10px] text-zinc-500">RPE</p>
                          </div>
                          <div className="rounded-lg bg-white px-2 py-1 dark:bg-zinc-900">
                            <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                              {formatValue(setRow.actual_rest_seconds ?? setRow.planned_rest_seconds)}
                            </p>
                            <p className="text-[10px] text-zinc-500">休息</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </AppCard>
          );
        })}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-3 pb-3">
          <div className="w-full max-w-[560px] rounded-[28px] border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50">确认保存修正</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    这些修改会重新汇总本次训练记录，可能影响之后的训练重量、目标次数和进阶判断。
                  </p>
                </div>
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900/70">
                {pendingChanges.slice(0, 10).map((change, index) => (
                  <div key={`${change.setId}:${change.label}:${index}`} className="text-xs">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100">
                      {change.unitName} 第 {change.setIndex} 组 · {change.label}
                    </p>
                    <p className="text-zinc-500 dark:text-zinc-400">
                      {change.before} 改为 {change.after}
                    </p>
                  </div>
                ))}
                {pendingChanges.length > 10 ? (
                  <p className="text-xs font-bold text-zinc-500">
                    还有 {pendingChanges.length - 10} 项修改
                  </p>
                ) : null}
              </div>

              <InlineAlert tone="warn">
                本次保存只更新训练记录数据，不会修改动作库、模板、动作模式或肌群定义。
              </InlineAlert>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmOpen(false)}
                  className="h-11 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  再检查
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveChanges()}
                  className="h-11 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-60"
                >
                  {saving ? "保存中..." : "保存并重新汇总"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 px-3 pb-3">
          <div className="w-full max-w-[560px] rounded-[28px] border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50">确认删除训练记录</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {isLatestExecution
                      ? "这是当前最新一条训练记录。删除后会影响后续训练安排与最新进步判断，但不会回滚已经沉淀的疲劳记录。"
                      : "这是历史训练记录。删除后只移除历史档案，不会回滚当前进步状态，也不会删除已沉淀的疲劳记录。"}
                  </p>
                </div>
              </div>

              <InlineAlert tone="warn">
                删除只发生在详情页内，避免误触。动作库、模板定义与肌群映射不会被一并删除。
              </InlineAlert>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="h-11 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDeleteExecution()}
                  className="h-11 rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-60"
                >
                  {deleting ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
