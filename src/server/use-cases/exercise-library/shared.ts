import { ExerciseLibraryRecord } from "@/server/repositories";

export function toExerciseLibraryItemDto(item: ExerciseLibraryRecord) {
  const record = item as ExerciseLibraryRecord & {
    last_used_at?: string | null;
  };

  return {
    id: item.id,
    userId: item.user_id,
    name: item.name,
    aliases: item.aliases,
    defaultRecordMode: item.default_record_mode,
    defaultLoadModel: item.default_load_model,
    recordingMode: item.recording_mode,
    category: item.category,
    movementPattern: item.movement_pattern,
    primaryRegions: item.primary_regions,
    secondaryRegions: item.secondary_regions,
    tags: item.tags,
    description: item.description,
    enabled: item.enabled,
    notes: item.notes,
    lastUsedAt: record.last_used_at ?? null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}
