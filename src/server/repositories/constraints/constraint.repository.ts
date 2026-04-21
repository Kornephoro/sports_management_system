import { prisma } from "@/lib/prisma";
import { ConstraintStatus, Prisma } from "@prisma/client";

export async function createConstraintProfile(data: Prisma.ConstraintProfileUncheckedCreateInput) {
  return prisma.constraintProfile.create({
    data,
  });
}

export async function listConstraintProfilesByUser(
  userId: string,
  status?: ConstraintStatus,
  limit = 50,
) {
  return prisma.constraintProfile.findMany({
    where: {
      user_id: userId,
      ...(status ? { status } : {}),
    },
    orderBy: {
      created_at: "desc",
    },
    take: limit,
  });
}

export async function listActiveConstraintProfilesByUser(userId: string, limit = 50) {
  return listConstraintProfilesByUser(userId, "active", limit);
}

export async function getConstraintProfileByIdForUser(constraintProfileId: string, userId: string) {
  return prisma.constraintProfile.findFirst({
    where: {
      id: constraintProfileId,
      user_id: userId,
    },
  });
}

export async function updateConstraintProfileById(
  constraintProfileId: string,
  data: Prisma.ConstraintProfileUncheckedUpdateInput,
) {
  return prisma.constraintProfile.update({
    where: {
      id: constraintProfileId,
    },
    data,
  });
}
