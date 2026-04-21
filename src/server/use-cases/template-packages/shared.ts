import {
  TemplatePackageDayRecord,
  TemplatePackageListItem,
  TemplatePackageRecord,
  TemplatePackageSlotRecord,
  TemplatePackageUnitOverrideRecord,
} from "@/server/repositories";

function toUnitOverrideDto(record: TemplatePackageUnitOverrideRecord) {
  return {
    unitSequenceNo: record.unit_sequence_no,
    unitRole: record.unit_role ?? null,
    progressionFamily: record.progression_family ?? null,
    progressionPolicyType: record.progression_policy_type ?? null,
    progressionPolicyConfig: record.progression_policy_config ?? {},
    adjustmentPolicyType: record.adjustment_policy_type ?? null,
    adjustmentPolicyConfig: record.adjustment_policy_config ?? {},
    successCriteria: record.success_criteria ?? {},
    progressTrackKey: record.progress_track_key ?? null,
  };
}

function toDayDto(record: TemplatePackageDayRecord) {
  return {
    id: record.id,
    dayCode: record.day_code,
    sequenceInMicrocycle: record.sequence_in_microcycle,
    templateLibraryItemId: record.template_library_item_id,
    label: record.label,
    notes: record.notes,
    progressionOverrides: record.progression_overrides.map(toUnitOverrideDto),
  };
}

function toSlotDto(record: TemplatePackageSlotRecord) {
  return {
    slotIndex: record.slot_index,
    type: record.type,
    dayCode: record.day_code,
    label: record.label,
  };
}

export function toTemplatePackageDto(record: TemplatePackageRecord) {
  return {
    id: record.id,
    userId: record.user_id,
    name: record.name,
    splitType: record.split_type,
    enabled: record.enabled,
    notes: record.notes,
    linkedProgramId: record.linked_program_id,
    lastUsedAt: record.last_used_at,
    days: record.days.map(toDayDto),
    microcycleSlots: record.microcycle_slots.map(toSlotDto),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function toTemplatePackageListItemDto(record: TemplatePackageListItem) {
  return {
    ...toTemplatePackageDto(record),
    dayCount: record.day_count,
  };
}
