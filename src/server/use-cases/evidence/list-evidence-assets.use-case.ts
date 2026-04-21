import { EvidenceParseStatus } from "@prisma/client";
import { z } from "zod";

import { listEvidenceAssetsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListEvidenceAssetsInputSchema = z.object({
  userId: UuidLikeSchema,
  limit: z.coerce.number().int().positive().max(100).default(20),
  parseStatus: z.nativeEnum(EvidenceParseStatus).optional(),
});

export type ListEvidenceAssetsInput = z.input<typeof ListEvidenceAssetsInputSchema>;

export async function listEvidenceAssetsUseCase(rawInput: ListEvidenceAssetsInput) {
  const input = ListEvidenceAssetsInputSchema.parse(rawInput);
  return listEvidenceAssetsByUser(input.userId, input.limit, input.parseStatus);
}
