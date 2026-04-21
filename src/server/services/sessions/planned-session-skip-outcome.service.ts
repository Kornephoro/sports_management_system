import { Prisma, RecoveryPolicyType } from "@prisma/client";

import {
  applyProgressTrackOutcomeUpdates,
  getProgramById,
  listProgressTracksByIds,
  listTrainingUnitTemplateRolesByIds,
  updateAllPlannedUnitsStatus,
  updatePlannedSessionStatus,
} from "@/server/repositories";
import { buildProgressTrackOutcomeDelta } from "@/server/services/progression/progression-track-outcome.service";
import { ProgressTrackState } from "@/lib/progression-types";

type PlannedUnitSkipContext = {
  progress_track_id: string | null;
  unit_template_id: string | null;
};

type ApplyPlannedSessionSkippedOutcomeInput = {
  userId: string;
  plannedSessionId: string;
  programId: string;
  plannedUnits: PlannedUnitSkipContext[];
};

export async function applyPlannedSessionSkippedOutcome(
  input: ApplyPlannedSessionSkippedOutcomeInput,
) {
  await updatePlannedSessionStatus(input.plannedSessionId, input.userId, "skipped");
  await updateAllPlannedUnitsStatus(input.plannedSessionId, "skipped");

  const recoveryPolicyType: RecoveryPolicyType =
    (await getProgramById(input.programId, input.userId))?.default_recovery_policy_type ??
    "preserve_order";

  const trackIds = Array.from(
    new Set(
      input.plannedUnits
        .map((unit) => unit.progress_track_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  if (trackIds.length === 0) {
    return;
  }

  const unitTemplateIds = Array.from(
    new Set(
      input.plannedUnits
        .map((unit) => unit.unit_template_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const [roleRecords, trackRecords] = await Promise.all([
    listTrainingUnitTemplateRolesByIds(unitTemplateIds),
    listProgressTracksByIds(trackIds),
  ]);

  const roleByTemplateId = new Map(roleRecords.map((item) => [item.id, item.unit_role]));
  const trackById = new Map(trackRecords.map((track) => [track.id, track]));

  const runtimeByTrackId = new Map<
    string,
    {
      nextState: ProgressTrackState;
      exposureDelta: number;
      successDelta: number;
      failureDelta: number;
      lastExposureAt: Date | null;
      lastSuccessAt: Date | null;
      lastFailureAt: Date | null;
    }
  >();

  for (const unit of input.plannedUnits) {
    if (!unit.progress_track_id) {
      continue;
    }

    const track = trackById.get(unit.progress_track_id);
    if (!track) {
      continue;
    }

    const runtime = runtimeByTrackId.get(unit.progress_track_id) ?? {
      nextState:
        typeof track.current_state === "object" &&
        track.current_state !== null &&
        !Array.isArray(track.current_state)
          ? (track.current_state as ProgressTrackState)
          : ({} as ProgressTrackState),
      exposureDelta: 0,
      successDelta: 0,
      failureDelta: 0,
      lastExposureAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
    };

    const unitRole = unit.unit_template_id
      ? roleByTemplateId.get(unit.unit_template_id) ?? "accessory"
      : "accessory";

    const delta = buildProgressTrackOutcomeDelta({
      previousOutcome: null,
      nextOutcome: "skipped",
      recoveryPolicy: recoveryPolicyType,
      unitRole,
      currentState: runtime.nextState,
      now: new Date(),
    });

    runtime.nextState = delta.nextState;
    runtime.exposureDelta += delta.exposureDelta;
    runtime.successDelta += delta.successDelta;
    runtime.failureDelta += delta.failureDelta;
    if (delta.lastExposureAt) {
      runtime.lastExposureAt = delta.lastExposureAt;
    }
    if (delta.lastSuccessAt) {
      runtime.lastSuccessAt = delta.lastSuccessAt;
    }
    if (delta.lastFailureAt) {
      runtime.lastFailureAt = delta.lastFailureAt;
    }

    runtimeByTrackId.set(unit.progress_track_id, runtime);
  }

  const outcomeUpdates = Array.from(runtimeByTrackId.entries()).map(([trackId, runtime]) => ({
    id: trackId,
    current_state: runtime.nextState as Prisma.InputJsonValue,
    exposure_delta: runtime.exposureDelta,
    success_delta: runtime.successDelta,
    failure_delta: runtime.failureDelta,
    last_exposure_at: runtime.lastExposureAt,
    last_success_at: runtime.lastSuccessAt,
    last_failure_at: runtime.lastFailureAt,
  }));

  if (outcomeUpdates.length > 0) {
    await applyProgressTrackOutcomeUpdates(outcomeUpdates);
  }
}
