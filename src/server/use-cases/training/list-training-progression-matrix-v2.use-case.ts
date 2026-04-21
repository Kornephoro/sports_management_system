import { z } from "zod";

import { listProgressionMatrixCellsUseCase } from "@/server/use-cases/progression/list-progression-matrix-cells.use-case";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListTrainingProgressionMatrixV2InputSchema = z.object({
  userId: UuidLikeSchema,
  window: z.union([z.literal(7), z.literal(10), z.literal(14)]).default(10),
  includeRecent: z.coerce.boolean().default(true),
  recentCount: z.coerce.number().int().min(0).max(7).default(3),
  axis: z.enum(["calendar", "exposure"]).default("exposure"),
  rowAxis: z.enum(["track", "session_type"]).default("track"),
  sessionType: z.string().optional(),
  movementPattern: z.string().optional(),
  primaryMuscle: z.string().optional(),
  onlyAbnormal: z.coerce.boolean().default(false),
});

export type ListTrainingProgressionMatrixV2Input = z.input<
  typeof ListTrainingProgressionMatrixV2InputSchema
>;

type MatrixCell = {
  rowKey: string;
  rowLabel: string;
  sessionId: string;
  sessionDate: Date;
  sequenceIndex: number;
  sessionTemplateId: string | null;
  columnId: string;
  columnLabel: string;
  unitId: string;
  unitSequenceNo: number;
  exerciseName: string;
  progressTrackId: string | null;
  movementPatterns: string[];
  primaryMuscles: string[];
  progressionSnapshot: Record<string, unknown> | null;
  matrixCellPayload: Record<string, unknown>;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parsePlanStatus(snapshot: Record<string, unknown>) {
  const changeType = typeof snapshot.change_type === "string" ? snapshot.change_type : "no_change";
  if (changeType === "realization") return "realization_round";
  if (changeType === "regular_progress") return "regular_progress";
  if (changeType === "deload") return "planned_deload";
  if (changeType === "adjustment") return "exception_adjustment";
  if (
    changeType === "no_change" &&
    typeof snapshot.change_reason === "string" &&
    snapshot.change_reason === "hold_no_progress"
  ) {
    const meta = toRecord(snapshot.meta);
    if (meta.hold_reason === "not_met") return "threshold_progress";
  }
  return "no_change";
}

function buildSessionTypeLabel(sessionTemplateId: string | null, indexMap: Map<string, number>) {
  if (!sessionTemplateId) {
    return "未绑定模板日";
  }
  const index = indexMap.get(sessionTemplateId) ?? 0;
  return `训练日类型 ${index + 1}`;
}

export async function listTrainingProgressionMatrixV2UseCase(
  rawInput: ListTrainingProgressionMatrixV2Input,
) {
  const input = ListTrainingProgressionMatrixV2InputSchema.parse(rawInput);

  const sessions = await listProgressionMatrixCellsUseCase({
    userId: input.userId,
    window: input.window,
    includeRecent: input.includeRecent,
    recentCount: input.recentCount,
  });

  const sessionTemplateIds = Array.from(
    new Set(
      sessions
        .map((session) => session.session_template_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const sessionTypeIndexMap = new Map(sessionTemplateIds.map((id, index) => [id, index]));

  const allCells: MatrixCell[] = [];
  for (const session of sessions) {
    for (const unit of session.planned_units) {
      const snapshot = toRecord(unit.progression_snapshot ?? unit.matrix_cell_payload?.plan?.snapshot);
      const matrixCellPayload = toRecord(unit.matrix_cell_payload);
      const actual = toRecord(matrixCellPayload.actual);
      const result = toRecord(matrixCellPayload.result);
      const outcome = typeof actual.outcome === "string" ? actual.outcome : null;
      const planStatus = parsePlanStatus(snapshot);
      const abnormal =
        outcome === "partial" ||
        outcome === "failed" ||
        outcome === "skipped" ||
        planStatus === "planned_deload" ||
        planStatus === "exception_adjustment";

      const movementPatterns = toStringArray(unit.filter_tags?.movement_patterns);
      const primaryMuscles = toStringArray(unit.filter_tags?.primary_muscles);

      if (input.onlyAbnormal && !abnormal) {
        continue;
      }
      if (input.sessionType && (session.session_template_id ?? "__none__") !== input.sessionType) {
        continue;
      }
      if (input.movementPattern && !movementPatterns.includes(input.movementPattern)) {
        continue;
      }
      if (input.primaryMuscle && !primaryMuscles.includes(input.primaryMuscle)) {
        continue;
      }

      const defaultTrackKey =
        (typeof snapshot.track_key === "string" && snapshot.track_key.trim()) ||
        unit.progress_track_id ||
        `name:${unit.selected_exercise_name ?? `unit-${unit.sequence_no}`}`;
      const sessionTypeKey = session.session_template_id ?? "__none__";
      const rowKey = input.rowAxis === "track" ? defaultTrackKey : `session_type:${sessionTypeKey}`;
      const rowLabel =
        input.rowAxis === "track"
          ? unit.selected_exercise_name ?? `训练单元 #${unit.sequence_no}`
          : buildSessionTypeLabel(session.session_template_id ?? null, sessionTypeIndexMap);

      allCells.push({
        rowKey,
        rowLabel,
        sessionId: session.id,
        sessionDate: new Date(session.session_date),
        sequenceIndex: session.sequence_index,
        sessionTemplateId: session.session_template_id ?? null,
        columnId: session.id,
        columnLabel: `训练 #${session.sequence_index}`,
        unitId: unit.id,
        unitSequenceNo: unit.sequence_no,
        exerciseName: unit.selected_exercise_name ?? `训练单元 #${unit.sequence_no}`,
        progressTrackId: unit.progress_track_id ?? null,
        movementPatterns,
        primaryMuscles,
        progressionSnapshot: unit.progression_snapshot ? toRecord(unit.progression_snapshot) : null,
        matrixCellPayload: matrixCellPayload,
      });
      void result;
    }
  }

  const sessionTypeOptions = [
    { id: "__all__", label: "全部训练日类型", count: allCells.length },
    ...sessionTemplateIds.map((id) => ({
      id,
      label: buildSessionTypeLabel(id, sessionTypeIndexMap),
      count: allCells.filter((cell) => cell.sessionTemplateId === id).length,
    })),
  ];

  const movementPatternOptions = Array.from(
    new Set(allCells.flatMap((cell) => cell.movementPatterns)),
  ).map((value) => ({
    value,
    count: allCells.filter((cell) => cell.movementPatterns.includes(value)).length,
  }));

  const primaryMuscleOptions = Array.from(
    new Set(allCells.flatMap((cell) => cell.primaryMuscles)),
  ).map((value) => ({
    value,
    count: allCells.filter((cell) => cell.primaryMuscles.includes(value)).length,
  }));

  const rowsMap = new Map<
    string,
    {
      key: string;
      label: string;
      sessionTemplateId: string | null;
      movementPatterns: Set<string>;
      primaryMuscles: Set<string>;
      cells: MatrixCell[];
    }
  >();
  for (const cell of allCells) {
    const existing = rowsMap.get(cell.rowKey) ?? {
      key: cell.rowKey,
      label: cell.rowLabel,
      sessionTemplateId: cell.sessionTemplateId,
      movementPatterns: new Set<string>(),
      primaryMuscles: new Set<string>(),
      cells: [],
    };
    cell.movementPatterns.forEach((value) => existing.movementPatterns.add(value));
    cell.primaryMuscles.forEach((value) => existing.primaryMuscles.add(value));
    existing.cells.push(cell);
    rowsMap.set(cell.rowKey, existing);
  }

  const rowEntries = Array.from(rowsMap.values()).map((row) => {
    const sorted = [...row.cells].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    return {
      ...row,
      cells: sorted,
    };
  });

  if (input.axis === "exposure") {
    const maxExposure = rowEntries.reduce((max, row) => Math.max(max, row.cells.length), 0);
    const columns = Array.from({ length: maxExposure }, (_, index) => ({
      id: `E${index + 1}`,
      label: `E${index + 1}`,
      subLabel: "曝光",
      exposureIndex: index + 1,
    }));

    return {
      axis: input.axis,
      rowAxis: input.rowAxis,
      columns,
      rows: rowEntries.map((row) => ({
        key: row.key,
        label: row.label,
        sessionTemplateId: row.sessionTemplateId,
        movementPatterns: Array.from(row.movementPatterns),
        primaryMuscles: Array.from(row.primaryMuscles),
        cells: row.cells.map((cell, index) => ({
          columnId: `E${index + 1}`,
          exposureIndex: index + 1,
          sessionId: cell.sessionId,
          sessionDate: cell.sessionDate,
          sequenceIndex: cell.sequenceIndex,
          unitId: cell.unitId,
          unitSequenceNo: cell.unitSequenceNo,
          exerciseName: cell.exerciseName,
          progressTrackId: cell.progressTrackId,
          progressionSnapshot: cell.progressionSnapshot,
          matrixCellPayload: cell.matrixCellPayload,
        })),
      })),
      filters: {
        sessionTypeOptions,
        movementPatternOptions,
        primaryMuscleOptions,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  const columns = sessions.map((session) => ({
    id: session.id,
    label: `训练 #${session.sequence_index}`,
    subLabel: toDateKey(new Date(session.session_date)),
    sequenceIndex: session.sequence_index,
    dateKey: toDateKey(new Date(session.session_date)),
  }));

  return {
    axis: input.axis,
    rowAxis: input.rowAxis,
    columns,
    rows: rowEntries.map((row) => ({
      key: row.key,
      label: row.label,
      sessionTemplateId: row.sessionTemplateId,
      movementPatterns: Array.from(row.movementPatterns),
      primaryMuscles: Array.from(row.primaryMuscles),
      cells: row.cells.map((cell) => ({
        columnId: cell.columnId,
        sessionId: cell.sessionId,
        sessionDate: cell.sessionDate,
        sequenceIndex: cell.sequenceIndex,
        unitId: cell.unitId,
        unitSequenceNo: cell.unitSequenceNo,
        exerciseName: cell.exerciseName,
        progressTrackId: cell.progressTrackId,
        progressionSnapshot: cell.progressionSnapshot,
        matrixCellPayload: cell.matrixCellPayload,
      })),
    })),
    filters: {
      sessionTypeOptions,
      movementPatternOptions,
      primaryMuscleOptions,
    },
    generatedAt: new Date().toISOString(),
  };
}
