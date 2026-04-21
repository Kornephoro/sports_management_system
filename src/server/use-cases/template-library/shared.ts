import { TemplateLibraryRecord } from "@/server/repositories";
import { countLogicalTemplateSlots } from "@/lib/template-library-superset";
import { deriveActionEntryAnchorSummary } from "@/lib/action-entry-anchor";

function decimalToNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number((value as { toString: () => string }).toString());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function toTemplateLibraryItemDto(item: TemplateLibraryRecord) {
  return {
    id: item.id,
    userId: item.user_id,
    name: item.name,
    description: item.description,
    splitType: item.split_type,
    folderKey: item.folder_key,
    aliases: item.aliases,
    enabled: item.enabled,
    notes: item.notes,
    lastUsedAt: item.last_used_at,
    unitCount: countLogicalTemplateSlots(
      item.units.map((unit) => ({
        supersetGroup: unit.superset_group
          ? {
              groupId: unit.superset_group.group_id,
              groupName: unit.superset_group.group_name,
              orderIndex: unit.superset_group.order_index,
              totalUnits: unit.superset_group.total_units,
              betweenExercisesRestSeconds:
                unit.superset_group.between_exercises_rest_seconds,
              betweenRoundsRestSeconds:
                unit.superset_group.between_rounds_rest_seconds,
              progressionBudgetPerExposure:
                unit.superset_group.progression_budget_per_exposure,
              selectionMode: unit.superset_group.selection_mode,
            }
          : null,
      })),
    ),
    units: item.units.map((unit) => ({
      exerciseLibraryItemId: unit.exercise_library_item_id,
      exerciseNameSnapshot: unit.exercise_name_snapshot,
      sequenceNo: unit.sequence_no,
      unitRole: unit.unit_role,
      progressTrackKey: unit.progress_track_key,
      progressionFamily: unit.progression_family,
      progressionPolicyType: unit.progression_policy_type,
      progressionPolicyConfig: unit.progression_policy_config,
      adjustmentPolicyType: unit.adjustment_policy_type,
      adjustmentPolicyConfig: unit.adjustment_policy_config,
      successCriteria: unit.success_criteria,
      recordingMode: unit.recording_mode ?? null,
      recordMode: unit.record_mode,
      loadModel: unit.load_model,
      defaultSets: unit.default_sets,
      defaultReps: unit.default_reps,
      defaultDurationSeconds: unit.default_duration_seconds,
      defaultLoadValue: decimalToNumber(unit.default_load_value),
      defaultLoadUnit: unit.default_load_unit,
      defaultAdditionalLoadValue: decimalToNumber(unit.default_additional_load_value),
      defaultAdditionalLoadUnit: unit.default_additional_load_unit,
      targetRepsMin: decimalToNumber(unit.target_reps_min),
      targetRepsMax: decimalToNumber(unit.target_reps_max),
      rpeMin: decimalToNumber(unit.rpe_min),
      rpeMax: decimalToNumber(unit.rpe_max),
      sets: unit.sets,
      anchorDraft: deriveActionEntryAnchorSummary({
        recordingMode: unit.recording_mode ?? null,
        recordMode: unit.record_mode,
        loadModel: unit.load_model,
        setStructure: unit.sets,
        fallback: {
          defaultSets: unit.default_sets,
          defaultReps: unit.default_reps,
          defaultDurationSeconds: unit.default_duration_seconds,
          defaultLoadValue: decimalToNumber(unit.default_load_value),
          defaultAdditionalLoadValue: decimalToNumber(unit.default_additional_load_value),
          targetRpe:
            decimalToNumber(unit.rpe_min) !== null && decimalToNumber(unit.rpe_min) === decimalToNumber(unit.rpe_max)
              ? decimalToNumber(unit.rpe_min)
              : null,
        },
      }),
      notes: unit.notes,
      required: unit.required,
      supersetGroup: unit.superset_group
        ? {
            groupId: unit.superset_group.group_id,
            groupName: unit.superset_group.group_name,
            orderIndex: unit.superset_group.order_index,
            totalUnits: unit.superset_group.total_units,
            betweenExercisesRestSeconds:
              unit.superset_group.between_exercises_rest_seconds,
            betweenRoundsRestSeconds:
              unit.superset_group.between_rounds_rest_seconds,
            progressionBudgetPerExposure:
              unit.superset_group.progression_budget_per_exposure,
            selectionMode: unit.superset_group.selection_mode,
          }
        : null,
    })),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}
