import { z } from "zod";

import {
  ADJUSTMENT_POLICY_TYPE_VALUES,
  PROGRESSION_FAMILY_VALUES,
  PROGRESSION_POLICY_TYPE_VALUES,
  UNIT_ROLE_VALUES,
} from "@/lib/progression-standards";
import { TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES } from "@/lib/template-package-standards";
import { createTemplatePackage } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

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

const CreateTemplatePackageInputSchema = z.object({
  userId: UuidLikeSchema,
  name: z.string().trim().min(1).max(120),
  splitType: z.enum(TEMPLATE_PACKAGE_SPLIT_TYPE_VALUES),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
  linkedProgramId: UuidLikeSchema.optional(),
  days: z.array(TemplatePackageDaySchema).min(1).max(12),
  microcycleSlots: z.array(TemplatePackageSlotSchema).optional(),
});

export type CreateTemplatePackageInput = z.input<typeof CreateTemplatePackageInputSchema>;

export async function createTemplatePackageUseCase(rawInput: CreateTemplatePackageInput) {
  const input = CreateTemplatePackageInputSchema.parse(rawInput);
  const created = await createTemplatePackage({
    user_id: input.userId,
    name: input.name,
    split_type: input.splitType,
    enabled: input.enabled,
    notes: input.notes ?? null,
    linked_program_id: input.linkedProgramId ?? null,
    days: input.days.map((day, index) => ({
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
    })),
    microcycle_slots: input.microcycleSlots?.map((slot, index) => ({
      slot_index: slot.slotIndex ?? index + 1,
      type: slot.type,
      day_code: slot.dayCode ?? null,
      label: slot.label ?? null,
    })),
  });

  return toTemplatePackageDto(created);
}
