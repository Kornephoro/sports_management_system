import { z } from "zod";

import {
  getSessionExecutionSetByIdForUser,
  SessionExecutionSetPatch,
  updateSessionExecutionSetById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const UpdateSessionExecutionSetInputSchema = z
  .object({
    userId: UuidLikeSchema,
    setId: UuidLikeSchema,
    actualReps: z.number().int().min(0).nullable().optional(),
    actualWeight: z.number().min(0).nullable().optional(),
    actualRpe: z.number().min(0).max(10).nullable().optional(),
    actualRestSeconds: z.number().int().min(0).nullable().optional(),
    actualTempo: z.string().trim().min(1).nullable().optional(),
    status: z.enum(["pending", "completed", "skipped", "extra"]).optional(),
    note: z.string().optional(),
  })
  .refine(
    (value) =>
      value.actualReps !== undefined ||
      value.actualWeight !== undefined ||
      value.actualRpe !== undefined ||
      value.actualRestSeconds !== undefined ||
      value.actualTempo !== undefined ||
      value.status !== undefined ||
      value.note !== undefined,
    {
      message: "At least one editable field is required",
    },
  );

export type UpdateSessionExecutionSetInput = z.input<typeof UpdateSessionExecutionSetInputSchema>;

function mapNoteInput(note: string | undefined) {
  if (note === undefined) {
    return undefined;
  }

  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateSessionExecutionSetUseCase(rawInput: UpdateSessionExecutionSetInput) {
  const input = UpdateSessionExecutionSetInputSchema.parse(rawInput);

  const existing = await getSessionExecutionSetByIdForUser(input.setId, input.userId);
  if (!existing) {
    throw notFoundError("Session execution set not found");
  }

  const updateData: SessionExecutionSetPatch = {
    ...(input.actualReps !== undefined ? { actual_reps: input.actualReps } : {}),
    ...(input.actualWeight !== undefined ? { actual_weight: input.actualWeight } : {}),
    ...(input.actualRpe !== undefined ? { actual_rpe: input.actualRpe } : {}),
    ...(input.actualRestSeconds !== undefined
      ? { actual_rest_seconds: input.actualRestSeconds }
      : {}),
    ...(input.actualTempo !== undefined ? { actual_tempo: input.actualTempo } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.note !== undefined ? { note: mapNoteInput(input.note) } : {}),
  };

  if (Object.keys(updateData).length === 0) {
    throw badRequestError("No changes to update");
  }

  return updateSessionExecutionSetById(existing.id, updateData);
}
