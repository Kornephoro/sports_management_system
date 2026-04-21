import { Prisma, SessionExecutionCompletionStatus } from "@prisma/client";
import { z } from "zod";

import {
  getSessionExecutionByIdForUser,
  updateSessionExecutionById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const UpdateSessionExecutionInputSchema = z
  .object({
    userId: UuidLikeSchema,
    sessionExecutionId: UuidLikeSchema,
    completionStatus: z.nativeEnum(SessionExecutionCompletionStatus).optional(),
    actualDurationMin: z.number().int().positive().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (value) =>
      value.completionStatus !== undefined ||
      value.actualDurationMin !== undefined ||
      value.notes !== undefined,
    {
      message: "At least one editable field is required",
    },
  );

export type UpdateSessionExecutionInput = z.input<typeof UpdateSessionExecutionInputSchema>;

function mapNotesInput(notes: string | undefined) {
  if (notes === undefined) {
    return undefined;
  }

  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateSessionExecutionUseCase(rawInput: UpdateSessionExecutionInput) {
  const input = UpdateSessionExecutionInputSchema.parse(rawInput);

  const existing = await getSessionExecutionByIdForUser(input.sessionExecutionId, input.userId);
  if (!existing) {
    throw notFoundError("Session execution not found");
  }

  const updateData: Prisma.SessionExecutionUncheckedUpdateInput = {
    ...(input.completionStatus !== undefined ? { completion_status: input.completionStatus } : {}),
    ...(input.actualDurationMin !== undefined ? { actual_duration_min: input.actualDurationMin } : {}),
    ...(input.notes !== undefined ? { notes: mapNotesInput(input.notes) } : {}),
  };

  if (Object.keys(updateData).length === 0) {
    throw badRequestError("No changes to update");
  }

  const updated = await updateSessionExecutionById(existing.id, updateData);

  return updated;
}
