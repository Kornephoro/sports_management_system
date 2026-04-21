import { z } from "zod";

import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_VALUES,
} from "@/lib/progression-standards";
import { TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES } from "@/lib/template-package-standards";
import { getTemplatePackageByIdForUser, updateTemplatePackageById } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

import { toTemplatePackageDto } from "./shared";

const TemplatePackageUnitOverrideSchema = z.object({
  unitSequenceNo: z.number().int().positive(),
  unitRole: z.enum(UNIT_ROLE_VALUES).optional(),
  progressionFamily: z.enum(PROGRESSION_FAMILY_VALUES).optional(),
  progressionPolicyType: z.union([z.enum(PROGRESSION_POLICY_TYPE_VALUES), z.string().trim().min(1)]).optional(),
  progressionPolicyConfig: z.record(z.string(), z.unknown()).optional(),
  adjustmentPolicyType: z.enum(ADJUSTMENT_POLICY_TYPE_VALUES).optional(),
  adjustmentPolicyConfig: z.record(z.string(), z.unknown()).optional(),
  successCriteria: z.record(z.string(), z.unknown()).optional(),
  progressTrackKey: z.string().trim().min(1).optional(),
});

const TemplatePackageDaySchema = z.object({
  id: UuidLikeSchema.optional(),
  dayCode: z.string().trim().min(1).max(20),
  sequenceInMicrocycle: z.number().int().positive(),
  templateLibraryItemId: UuidLikeSchema,
  label: z.string().optional(),
  notes: z.string().optional(),
  progressionOverrides: z.array(TemplatePackageUnitOverrideSchema).default([]),
});

const TemplatePackageSlotSchema = z.object({
  slotIndex: z.number().int().positive().optional(),
  type: z.enum(["train", "rest"]),
  dayCode: z.string().trim().min(1).max(20).nullable().optional(),
  label: z.string().optional(),
});

const UpdateTemplatePackageInputSchema = z
  .object({
    userId: UuidLikeSchema,
    packageId: UuidLikeSchema,
    name: z.string().trim().min(1).max(120).optional(),
    splitType: z.enum(TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES).optional(),
    enabled: z.boolean().optional(),
    notes: z.string().optional(),
    linkedProgramId: z.union([UuidLikeSchema, z.null()]).optional(),
    days: z.array(TemplatePackageDaySchema).min(1).max(12).optional(),
    microcycleSlots: z.array(TemplatePackageSlotSchema).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.splitType !== undefined ||
      value.enabled !== undefined ||
      value.notes !== undefined ||
      value.linkedProgramId !== undefined ||
      value.days !== undefined ||
      value.microcycleSlots !== undefined,
    { message: "至少需要提供一个可编辑字段" },
  );

export type UpdateTemplatePackageInput = z.input<typeof UpdateTemplatePackageInputSchema>;

export async function updateTemplatePackageUseCase(rawInput: UpdateTemplatePackageInput) {
  const input = UpdateTemplatePackageInputSchema.parse(rawInput);
  const updated = await updateTemplatePackageById(input.packageId, input.userId, {
    name: input.name,
    split_type: input.splitType,
    enabled: input.enabled,
    notes: input.notes,
    linked_program_id: input.linkedProgramId ?? undefined,
    days:
      input.days?.map((day, index) => ({
        id: day.id ?? undefined,
        day_code: day.dayCode,
        sequence_in_microcycle: day.sequenceInMicrocycle ?? index + 1,
        template_library_item_id: day.templateLibraryItemId,
        label: day.label ?? null,
        notes: day.notes ?? null,
        progression_overrides: day.progressionOverrides.map((override) => ({
          unit_sequence_no: override.unitSequenceNo,
          unit_role: override.unitRole,
          progression_family: override.progressionFamily,
          progression_policy_type: override.progressionPolicyType,
          progression_policy_config: override.progressionPolicyConfig ?? {},
          adjustment_policy_type: override.adjustmentPolicyType,
          adjustment_policy_config: override.adjustmentPolicyConfig ?? {},
          success_criteria: override.successCriteria ?? {},
          progress_track_key: override.progressTrackKey,
        })),
      })) ?? undefined,
    microcycle_slots:
      input.microcycleSlots?.map((slot, index) => ({
        slot_index: slot.slotIndex ?? index + 1,
        type: slot.type,
        day_code: slot.dayCode ?? null,
        label: slot.label ?? null,
      })) ?? undefined,
  });

  if (updated.count === 0) {
    throw notFoundError("Template package not found");
  }

  const next = await getTemplatePackageByIdForUser(input.packageId, input.userId);
  if (!next) {
    throw notFoundError("Template package not found");
  }
  return toTemplatePackageDto(next);
}
