import { z } from "zod";

import {
  getExerciseLibraryItemByIdForUser,
  getExerciseLibraryItemDetailAggregate,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

import { toExerciseLibraryItemDto } from "./shared";

const GetExerciseLibraryItemInputSchema = z.object({
  userId: UuidLikeSchema,
  itemId: UuidLikeSchema,
});

export type GetExerciseLibraryItemInput = z.input<typeof GetExerciseLibraryItemInputSchema>;

export async function getExerciseLibraryItemUseCase(rawInput: GetExerciseLibraryItemInput) {
  const input = GetExerciseLibraryItemInputSchema.parse(rawInput);
  const [item, aggregate] = await Promise.all([
    getExerciseLibraryItemByIdForUser(input.itemId, input.userId),
    getExerciseLibraryItemDetailAggregate(input.itemId, input.userId),
  ]);

  if (!item || !aggregate) {
    throw notFoundError("Exercise library item not found");
  }
  return {
    ...toExerciseLibraryItemDto(item),
    weightTrendPoints: aggregate.weight_trend_points.map((point) => ({
      performedAt: point.performed_at,
      value: point.value,
    })),
    summary: {
      totalExecutions: aggregate.summary.total_executions,
      latestPerformedAt: aggregate.summary.latest_performed_at,
      bestLoadValue: aggregate.summary.best_load_value,
      bestReps: aggregate.summary.best_reps,
      bestDurationSeconds: aggregate.summary.best_duration_seconds,
      trend: aggregate.summary.trend,
    },
    references: {
      template: aggregate.template_references.map((item) => ({
        unitTemplateId: item.unit_template_id,
        unitName: item.unit_name,
        sessionTemplateId: item.session_template_id,
        sessionTemplateName: item.session_template_name,
        blockId: item.block_id,
        blockName: item.block_name,
        programId: item.program_id,
        programName: item.program_name,
      })),
      planned: aggregate.planned_references.map((item) => ({
        plannedUnitId: item.planned_unit_id,
        plannedSessionId: item.planned_session_id,
        sequenceIndex: item.sequence_index,
        sessionDate: item.session_date,
        status: item.status,
        selectedExerciseName: item.selected_exercise_name,
        programId: item.program_id,
        programName: item.program_name,
      })),
      recentUsage: aggregate.recent_usage_locations.map((item) => ({
        sessionExecutionId: item.session_execution_id,
        unitExecutionId: item.unit_execution_id,
        performedAt: item.performed_at,
        completionStatus: item.completion_status,
        plannedSessionId: item.planned_session_id,
        sequenceIndex: item.sequence_index,
        programId: item.program_id,
        programName: item.program_name,
      })),
    },
    governance: {
      duplicateCandidates: aggregate.duplicate_candidates.map((item) => ({
        id: item.id,
        name: item.name,
      })),
    },
  };
}
