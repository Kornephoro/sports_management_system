import { z } from "zod";

import { getTemplateLibraryItemByIdForUser, listTemplatePackagesByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { deriveActionEntryAnchorSummary } from "@/lib/action-entry-anchor";

const GetTrainingPlanningBootstrapInputSchema = z.object({
  userId: UuidLikeSchema,
  packageId: UuidLikeSchema.optional(),
});

export type GetTrainingPlanningBootstrapInput = z.input<
  typeof GetTrainingPlanningBootstrapInputSchema
>;

type UnitOverrideLike = {
  unit_sequence_no: number;
  unit_role?: string;
  progression_family?: string;
  progression_policy_type?: string;
  progression_policy_config?: Record<string, unknown>;
  adjustment_policy_type?: string;
  adjustment_policy_config?: Record<string, unknown>;
  success_criteria?: Record<string, unknown>;
  progress_track_key?: string;
};

function asRecord(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

type MicrocycleSlotLike = {
  slot_index: number;
  type: "train" | "rest";
  day_code: string | null;
  label: string | null;
};

function summarizeMicrocycle(slots: MicrocycleSlotLike[]) {
  const sorted = [...slots].sort((a, b) => a.slot_index - b.slot_index);
  const trainCount = sorted.filter((slot) => slot.type === "train").length;
  const restCount = sorted.length - trainCount;
  const slotPreview = sorted
    .map((slot) => (slot.type === "rest" ? "R" : slot.day_code ?? "T"))
    .join("/");
  const weeklyFrequencyEstimate =
    sorted.length > 0 ? Number(((trainCount / sorted.length) * 7).toFixed(1)) : 0;

  return {
    trainCount,
    restCount,
    slotPreview,
    weeklyFrequencyEstimate,
  };
}

function mergeOverride<T>(base: T, override: UnitOverrideLike | undefined) {
  if (!override) {
    return base;
  }

  const baseRecord = asRecord(base);
  const next = {
    ...baseRecord,
    ...(override.unit_role ? { unitRole: override.unit_role } : {}),
    ...(override.progression_family ? { progressionFamily: override.progression_family } : {}),
    ...(override.progression_policy_type
      ? { progressionPolicyType: override.progression_policy_type }
      : {}),
    ...(override.progression_policy_config
      ? { progressionPolicyConfig: override.progression_policy_config }
      : {}),
    ...(override.adjustment_policy_type
      ? { adjustmentPolicyType: override.adjustment_policy_type }
      : {}),
    ...(override.adjustment_policy_config
      ? { adjustmentPolicyConfig: override.adjustment_policy_config }
      : {}),
    ...(override.success_criteria ? { successCriteria: override.success_criteria } : {}),
    ...(override.progress_track_key ? { progressTrackKey: override.progress_track_key } : {}),
  };

  return next as T;
}

export async function getTrainingPlanningBootstrapUseCase(
  rawInput: GetTrainingPlanningBootstrapInput,
) {
  const input = GetTrainingPlanningBootstrapInputSchema.parse(rawInput);
  const packages = await listTemplatePackagesByUser(input.userId, {
    enabled: true,
  });
  const templateCache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getTemplateLibraryItemByIdForUser>>>
  >();
  const loadTemplate = (templateLibraryItemId: string) => {
    if (!templateCache.has(templateLibraryItemId)) {
      templateCache.set(
        templateLibraryItemId,
        getTemplateLibraryItemByIdForUser(templateLibraryItemId, input.userId),
      );
    }
    return templateCache.get(templateLibraryItemId)!;
  };

  const selectedPackage =
    (input.packageId
      ? packages.find((item) => item.id === input.packageId)
      : undefined) ?? packages[0] ?? null;

  if (!selectedPackage) {
    return {
      packages: [],
      selectedPackage: null,
      defaults: {
        durationWeeksPresets: [4, 8, 12],
        schedulingMode: "smart_elastic" as const,
        replaceFutureUnexecuted: true,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  const dayDetails = await Promise.all(
    selectedPackage.days.map(async (day) => {
      const template = await loadTemplate(day.template_library_item_id);

      if (!template) {
        return {
          id: day.id,
          dayCode: day.day_code,
          sequenceInMicrocycle: day.sequence_in_microcycle,
          label: day.label ?? day.day_code,
          templateLibraryItemId: day.template_library_item_id,
          templateLibraryItem: null,
          units: [],
        };
      }

      const overridesBySequence = new Map<number, UnitOverrideLike>();
      for (const override of day.progression_overrides) {
        overridesBySequence.set(override.unit_sequence_no, override);
      }

      const units = template.units.map((unit) =>
        mergeOverride(
          {
            sequenceNo: unit.sequence_no,
            exerciseLibraryItemId: unit.exercise_library_item_id,
            exerciseNameSnapshot: unit.exercise_name_snapshot,
            unitRole: unit.unit_role,
            progressTrackKey: unit.progress_track_key,
            progressionFamily: unit.progression_family,
            progressionPolicyType: unit.progression_policy_type,
            progressionPolicyConfig: unit.progression_policy_config,
            adjustmentPolicyType: unit.adjustment_policy_type,
            adjustmentPolicyConfig: unit.adjustment_policy_config,
            successCriteria: unit.success_criteria,
            required: unit.required,
            recordingMode: unit.recording_mode ?? null,
            recordMode: unit.record_mode,
            loadModel: unit.load_model,
            anchorDraft: deriveActionEntryAnchorSummary({
              recordingMode: unit.recording_mode ?? null,
              recordMode: unit.record_mode,
              loadModel: unit.load_model,
              setStructure: unit.sets,
              fallback: {
                defaultSets: unit.default_sets,
                defaultReps: unit.default_reps,
                defaultDurationSeconds: unit.default_duration_seconds,
                defaultLoadValue: unit.default_load_value,
                defaultAdditionalLoadValue: unit.default_additional_load_value,
                targetRpe:
                  unit.rpe_min !== null && unit.rpe_min === unit.rpe_max
                    ? unit.rpe_min
                    : null,
              },
            }),
          },
          overridesBySequence.get(unit.sequence_no),
        ),
      );

      return {
        id: day.id,
        dayCode: day.day_code,
        sequenceInMicrocycle: day.sequence_in_microcycle,
        label: day.label ?? day.day_code,
        templateLibraryItemId: day.template_library_item_id,
        templateLibraryItem: {
          id: template.id,
          name: template.name,
          splitType: template.split_type,
          unitCount: template.units.length,
          updatedAt: template.updated_at,
        },
        units,
      };
    }),
  );

  const packageCards = await Promise.all(
    packages.map(async (item) => {
      const dayPreviews = await Promise.all(
        item.days.map(async (day) => {
          const template = await loadTemplate(day.template_library_item_id);
          return {
            dayCode: day.day_code,
            label: day.label ?? day.day_code,
            templateLibraryItemId: day.template_library_item_id,
            templateName: template?.name ?? "模板缺失",
            unitCount: template?.units.length ?? 0,
            topExercises:
              template?.units
                .slice(0, 3)
                .map((unit) => unit.exercise_name_snapshot) ?? [],
          };
        }),
      );

      return {
        id: item.id,
        name: item.name,
        splitType: item.split_type,
        enabled: item.enabled,
        dayCount: item.day_count,
        notes: item.notes,
        lastUsedAt: item.last_used_at,
        linkedProgramId: item.linked_program_id,
        updatedAt: item.updated_at,
        microcycleSummary: summarizeMicrocycle(item.microcycle_slots),
        dayPreviews,
      };
    }),
  );

  return {
    packages: packageCards,
    selectedPackage: {
      id: selectedPackage.id,
      name: selectedPackage.name,
      splitType: selectedPackage.split_type,
      enabled: selectedPackage.enabled,
      notes: selectedPackage.notes,
      linkedProgramId: selectedPackage.linked_program_id,
      days: dayDetails,
      microcycleSlots: selectedPackage.microcycle_slots
        .slice()
        .sort((a, b) => a.slot_index - b.slot_index)
        .map((slot) => ({
          slotIndex: slot.slot_index,
          type: slot.type,
          dayCode: slot.day_code,
          label: slot.label,
        })),
      microcycleSummary: summarizeMicrocycle(selectedPackage.microcycle_slots),
    },
    defaults: {
      durationWeeksPresets: [4, 8, 12],
      schedulingMode: "smart_elastic" as const,
      replaceFutureUnexecuted: true,
    },
    generatedAt: new Date().toISOString(),
  };
}
