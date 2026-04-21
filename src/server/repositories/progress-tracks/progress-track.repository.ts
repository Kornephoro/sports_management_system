import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function getDbClient(tx?: Prisma.TransactionClient) {
  return tx ?? prisma;
}

export async function listProgressTracksByUser(userId: string, programId?: string) {
  return prisma.progressTrack.findMany({
    where: {
      user_id: userId,
      ...(programId ? { program_id: programId } : {}),
    },
    orderBy: {
      track_key: "asc",
    },
  });
}

export async function listProgressTracksByIds(trackIds: string[]) {
  if (trackIds.length === 0) {
    return [];
  }

  return prisma.progressTrack.findMany({
    where: {
      id: {
        in: trackIds,
      },
    },
    select: {
      id: true,
      current_state: true,
      status: true,
      last_progression_at: true,
      progression_count: true,
      exposure_count: true,
      success_count: true,
      failure_count: true,
      last_exposure_at: true,
      last_success_at: true,
      last_failure_at: true,
    },
  });
}

type EnsureProgressTrackSeed = {
  user_id: string;
  program_id?: string | null;
  track_key: string;
  name: string;
  sport_type:
    | "strength"
    | "hypertrophy"
    | "running"
    | "swimming"
    | "racket"
    | "functional"
    | "mixed";
  progression_family: "strict_load" | "threshold" | "exposure" | "performance" | "autoregulated";
  progression_policy_type: string;
  progression_policy_config: Prisma.InputJsonValue;
  current_state: Prisma.InputJsonValue;
  status?: "active" | "paused" | "reset" | "completed";
  notes?: string | null;
};

export async function ensureProgressTrackByKey(seed: EnsureProgressTrackSeed) {
  return ensureProgressTrackByKeyWithTx(seed);
}

export async function ensureProgressTrackByKeyWithTx(
  seed: EnsureProgressTrackSeed,
  tx?: Prisma.TransactionClient,
) {
  return getDbClient(tx).progressTrack.upsert({
    where: {
      user_id_track_key: {
        user_id: seed.user_id,
        track_key: seed.track_key,
      },
    },
    update: {
      program_id: seed.program_id ?? undefined,
      name: seed.name,
      sport_type: seed.sport_type,
      progression_family: seed.progression_family,
      progression_policy_type: seed.progression_policy_type,
      progression_policy_config: seed.progression_policy_config,
      notes: seed.notes ?? undefined,
    },
    create: {
      user_id: seed.user_id,
      program_id: seed.program_id ?? undefined,
      track_key: seed.track_key,
      name: seed.name,
      sport_type: seed.sport_type,
      progression_family: seed.progression_family,
      progression_policy_type: seed.progression_policy_type,
      progression_policy_config: seed.progression_policy_config,
      current_state: seed.current_state,
      exposure_count: 0,
      success_count: 0,
      failure_count: 0,
      progression_count: 0,
      status: seed.status ?? "active",
      notes: seed.notes ?? undefined,
    },
  });
}

type ProgressTrackGenerationUpdate = {
  id: string;
  current_state: Prisma.InputJsonValue;
  progression_count_increment: number;
  last_progression_at: Date;
};

export async function applyProgressTrackGenerationUpdates(
  updates: ProgressTrackGenerationUpdate[],
) {
  if (updates.length === 0) {
    return { updatedCount: 0 };
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.progressTrack.update({
        where: {
          id: update.id,
        },
        data: {
          current_state: update.current_state,
          last_progression_at: update.last_progression_at,
          progression_count: {
            increment: update.progression_count_increment,
          },
        },
      }),
    ),
  );

  return {
    updatedCount: updates.length,
  };
}

type ProgressTrackOutcomeUpdate = {
  id: string;
  current_state: Prisma.InputJsonValue;
  exposure_delta: number;
  success_delta: number;
  failure_delta: number;
  last_exposure_at: Date | null;
  last_success_at: Date | null;
  last_failure_at: Date | null;
};

export async function applyProgressTrackOutcomeUpdates(
  updates: ProgressTrackOutcomeUpdate[],
) {
  if (updates.length === 0) {
    return { updatedCount: 0 };
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.progressTrack.update({
        where: {
          id: update.id,
        },
        data: {
          current_state: update.current_state,
          exposure_count: {
            increment: update.exposure_delta,
          },
          success_count: {
            increment: update.success_delta,
          },
          failure_count: {
            increment: update.failure_delta,
          },
          last_exposure_at: update.last_exposure_at ?? undefined,
          last_success_at: update.last_success_at ?? undefined,
          last_failure_at: update.last_failure_at ?? undefined,
        },
      }),
    ),
  );

  return {
    updatedCount: updates.length,
  };
}
