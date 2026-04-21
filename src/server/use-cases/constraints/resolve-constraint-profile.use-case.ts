import { z } from "zod";

import {
  getConstraintProfileByIdForUser,
  updateConstraintProfileById,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const ResolveConstraintProfileInputSchema = z.object({
  userId: UuidLikeSchema,
  constraintProfileId: UuidLikeSchema,
  resolvedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type ResolveConstraintProfileInput = z.input<typeof ResolveConstraintProfileInputSchema>;

export async function resolveConstraintProfileUseCase(rawInput: ResolveConstraintProfileInput) {
  const input = ResolveConstraintProfileInputSchema.parse(rawInput);
  const constraint = await getConstraintProfileByIdForUser(input.constraintProfileId, input.userId);

  if (!constraint) {
    throw notFoundError("ConstraintProfile not found");
  }

  if (constraint.status === "resolved") {
    throw badRequestError("ConstraintProfile is already resolved");
  }

  const mergedNotes = [constraint.notes, input.notes].filter((item) => !!item).join("\n");

  return updateConstraintProfileById(constraint.id, {
    status: "resolved",
    resolved_at: input.resolvedAt ?? new Date(),
    notes: mergedNotes || undefined,
  });
}
