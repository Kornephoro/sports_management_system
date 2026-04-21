import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const DEFAULT_EVIDENCE_BUCKET = "evidence-assets";

type UploadEvidenceBinaryParams = {
  userId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildStoragePath(userId: string, fileName: string) {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${userId}/${yyyy}-${mm}-${dd}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

async function ensureEvidenceBucketExists(bucket: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.getBucket(bucket);

  if (!error) {
    return;
  }

  const missingBucket =
    error.message.toLowerCase().includes("not found") ||
    error.message.toLowerCase().includes("does not exist");

  if (!missingBucket) {
    throw new Error(`Storage bucket check failed: ${error.message}`);
  }

  const { error: createError } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: "20MB",
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw new Error(`Failed to create storage bucket: ${createError.message}`);
  }
}

function resolveEvidenceBucketName() {
  const serverEnv = getServerEnv();
  return serverEnv.SUPABASE_EVIDENCE_BUCKET ?? DEFAULT_EVIDENCE_BUCKET;
}

export async function uploadEvidenceBinaryToStorage({
  userId,
  fileName,
  mimeType,
  bytes,
}: UploadEvidenceBinaryParams) {
  const supabase = createSupabaseAdminClient();
  const bucket = resolveEvidenceBucketName();
  const storagePath = buildStoragePath(userId, fileName);

  await ensureEvidenceBucketExists(bucket);

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Failed to upload evidence to storage: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  return {
    bucket,
    storagePath,
    storageUrl: `supabase://${bucket}/${storagePath}`,
    publicUrl,
  };
}

export function resolveEvidenceAssetTypeFromMimeType(mimeType: string, fileName: string) {
  if (mimeType.startsWith("image/")) {
    return "image" as const;
  }
  if (mimeType === "application/pdf") {
    return "pdf" as const;
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".webp")) {
    return "image" as const;
  }
  if (lowerName.endsWith(".pdf")) {
    return "pdf" as const;
  }
  return "other" as const;
}
