import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function createObservation(data: Prisma.ObservationUncheckedCreateInput) {
  return prisma.observation.create({
    data,
  });
}

export async function listObservationsByMetric(userId: string, metricKey: string, limit = 20) {
  return prisma.observation.findMany({
    where: {
      user_id: userId,
      metric_key: metricKey,
    },
    orderBy: {
      observed_at: "desc",
    },
    take: limit,
  });
}

export async function listLatestObservationsByMetrics(userId: string, metricKeys: string[]) {
  if (metricKeys.length === 0) {
    return [];
  }

  const observations = await prisma.$transaction(
    metricKeys.map((metricKey) =>
      prisma.observation.findFirst({
        where: {
          user_id: userId,
          metric_key: metricKey,
        },
        orderBy: {
          observed_at: "desc",
        },
      }),
    ),
  );

  return observations.filter((item): item is NonNullable<typeof item> => !!item);
}
