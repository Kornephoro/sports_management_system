import { prisma } from "@/lib/prisma";
import { EvidenceParseStatus, Prisma } from "@prisma/client";

export async function createEvidenceAsset(data: Prisma.EvidenceAssetUncheckedCreateInput) {
  return prisma.evidenceAsset.create({
    data,
  });
}

export async function listEvidenceAssetsByUser(
  userId: string,
  limit = 20,
  parseStatus?: EvidenceParseStatus,
) {
  return prisma.evidenceAsset.findMany({
    where: {
      user_id: userId,
      ...(parseStatus ? { parse_status: parseStatus } : {}),
    },
    orderBy: {
      uploaded_at: "desc",
    },
    take: limit,
  });
}

export async function getEvidenceAssetByIdForUser(evidenceAssetId: string, userId: string) {
  return prisma.evidenceAsset.findFirst({
    where: {
      id: evidenceAssetId,
      user_id: userId,
    },
  });
}

export async function updateEvidenceAssetById(
  evidenceAssetId: string,
  data: Prisma.EvidenceAssetUncheckedUpdateInput,
) {
  return prisma.evidenceAsset.update({
    where: {
      id: evidenceAssetId,
    },
    data,
  });
}
