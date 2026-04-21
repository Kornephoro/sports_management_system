import { z } from "zod";

import { getProgramDetailWithStructure } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

const GetProgramDetailInputSchema = z.object({
  userId: UuidLikeSchema,
  programId: UuidLikeSchema,
});

export type GetProgramDetailInput = z.infer<typeof GetProgramDetailInputSchema>;

export async function getProgramDetailUseCase(rawInput: GetProgramDetailInput) {
  const input = GetProgramDetailInputSchema.parse(rawInput);
  const program = await getProgramDetailWithStructure(input.programId, input.userId);

  if (!program) {
    throw notFoundError("Program not found");
  }

  return program;
}
