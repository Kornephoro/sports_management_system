import { createHash } from "node:crypto";

import { EvidenceDomainHint } from "@prisma/client";
import { z } from "zod";

import { createEvidenceAsset } from "@/server/repositories";
import {
  resolveEvidenceAssetTypeFromMimeType,
  uploadEvidenceBinaryToStorage,
} from "@/server/services/evidence/evidence-storage.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const UploadEvidenceInputSchema = z.object({
  userId: UuidLikeSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
  domainHint: z.nativeEnum(EvidenceDomainHint).default("other"),
  sourceApp: z.string().optional(),
  capturedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type UploadEvidenceInput = z.input<typeof UploadEvidenceInputSchema>;

export async function uploadEvidenceUseCase(rawInput: UploadEvidenceInput) {
  const input = UploadEvidenceInputSchema.parse(rawInput);
  const uploadedAt = new Date();
  const fileHash = createHash("sha256").update(input.bytes).digest("hex");

  const storage = await uploadEvidenceBinaryToStorage({
    userId: input.userId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    bytes: input.bytes,
  });

  return createEvidenceAsset({
    user_id: input.userId,
    asset_type: resolveEvidenceAssetTypeFromMimeType(input.mimeType, input.fileName),
    source_app: input.sourceApp,
    domain_hint: input.domainHint,
    captured_at: input.capturedAt,
    uploaded_at: uploadedAt,
    storage_url: storage.storageUrl,
    mime_type: input.mimeType,
    file_hash: fileHash,
    parse_status: "pending",
    notes: input.notes,
  });
}
