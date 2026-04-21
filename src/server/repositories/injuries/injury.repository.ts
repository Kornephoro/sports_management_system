import { prisma } from "@/lib/prisma";
import { InjuryStatus, Prisma } from "@prisma/client";

export async function createInjuryIncident(data: Prisma.InjuryIncidentUncheckedCreateInput) {
  return prisma.injuryIncident.create({
    data,
  });
}

export async function listInjuryIncidentsByUser(userId: string, status?: InjuryStatus, limit = 50) {
  return prisma.injuryIncident.findMany({
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

export async function getInjuryIncidentByIdForUser(injuryIncidentId: string, userId: string) {
  return prisma.injuryIncident.findFirst({
    where: {
      id: injuryIncidentId,
      user_id: userId,
    },
  });
}

export async function updateInjuryIncidentById(
  injuryIncidentId: string,
  data: Prisma.InjuryIncidentUncheckedUpdateInput,
) {
  return prisma.injuryIncident.update({
    where: {
      id: injuryIncidentId,
    },
    data,
  });
}
