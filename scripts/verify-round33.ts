import { Prisma, ProgressTrack, ProgressTrackStatus } from "@prisma/client";

import { buildProgressTrackOutcomeDelta, classifyTrackOutcomeFromExecution } from "@/server/services/progression/progression-track-outcome.service";
import { buildMinimalPlannedSessions } from "@/server/services/sessions/planned-session-builder.service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createTrack(args: {
  id: string;
  trackKey: string;
  policyType: string;
  progressionFamily: "strict_load" | "threshold" | "exposure" | "performance" | "autoregulated";
  lastProgressionAt: Date | null;
  successCount: number;
  exposureCount: number;
  progressionCount: number;
  currentState: Prisma.JsonValue;
  status?: ProgressTrackStatus;
}) {
  return {
    id: args.id,
    user_id: "00000000-0000-0000-0000-000000000001",
    program_id: "00000000-0000-0000-0000-000000000010",
    track_key: args.trackKey,
    name: args.trackKey,
    sport_type: "strength",
    progression_family: args.progressionFamily,
    progression_policy_type: args.policyType,
    progression_policy_config: {},
    current_state: args.currentState,
    exposure_count: args.exposureCount,
    success_count: args.successCount,
    failure_count: 0,
    progression_count: args.progressionCount,
    last_exposure_at: null,
    last_success_at: new Date("2026-04-06T00:00:00.000Z"),
    last_failure_at: null,
    last_progression_at: args.lastProgressionAt,
    status: args.status ?? "active",
    notes: null,
    created_at: new Date("2026-04-01T00:00:00.000Z"),
    updated_at: new Date("2026-04-01T00:00:00.000Z"),
  } satisfies ProgressTrack;
}

async function verifyPeriodizationAndScriptedCycle() {
  const tracks = [
    createTrack({
      id: "00000000-0000-0000-0000-000000000101",
      trackKey: "periodization_track",
      policyType: "linear_periodization_step",
      progressionFamily: "strict_load",
      lastProgressionAt: new Date("2026-04-01T00:00:00.000Z"),
      successCount: 3,
      exposureCount: 4,
      progressionCount: 1,
      currentState: {
        current_load: 60,
        current_sets: 3,
        current_reps: 5,
        extra_state: { phase_index: 0 },
      },
    }),
    createTrack({
      id: "00000000-0000-0000-0000-000000000102",
      trackKey: "scripted_track",
      policyType: "scripted_cycle",
      progressionFamily: "performance",
      lastProgressionAt: new Date("2026-04-01T00:00:00.000Z"),
      successCount: 3,
      exposureCount: 4,
      progressionCount: 1,
      currentState: {
        current_load: 40,
        current_sets: 3,
        current_reps: 8,
        cycle_index: 0,
        extra_state: { cycle_step_index: 0 },
      },
    }),
  ];

  const { plannedSessionSeeds } = buildMinimalPlannedSessions({
    programId: "00000000-0000-0000-0000-000000000010",
    userId: "00000000-0000-0000-0000-000000000001",
    startDate: new Date("2026-04-07"),
    sessionCount: 1,
    startSequenceIndex: 0,
    generationReason: "initial_generation",
    rotationQuota: 1,
    activeConstraints: [],
    progressTracks: tracks,
    templates: [
      {
        id: "00000000-0000-0000-0000-000000000201",
        block_id: "00000000-0000-0000-0000-000000000020",
        expected_duration_min: 75,
        objective_summary: "Round33 verify",
        training_unit_templates: [
          {
            id: "00000000-0000-0000-0000-000000000301",
            sequence_no: 1,
            name: "主项A",
            display_name: "主项A",
            optional: false,
            sport_type: "strength",
            unit_role: "main",
            progress_track_key: "periodization_track",
            progression_family: "strict_load",
            progression_policy_type: "linear_periodization_step",
            progression_policy_config: {
              advance_on: "success",
              phases: [
                { phase_name: "phase_1", target: { current_load: 60, current_sets: 3, current_reps: 5 } },
                { phase_name: "phase_2", target: { current_load: 62.5, current_sets: 3, current_reps: 5 } },
              ],
            },
            adjustment_policy_type: "always",
            adjustment_policy_config: {},
            success_criteria: { min_success_count: 1 },
            prescription_type: "sets_reps",
            prescription_payload: { sets: 3, reps: 5, load_value: 60, load_model: "external" },
            movement_pattern_tags: [],
            contraindication_tags: [],
            fatigue_tags: [],
          },
          {
            id: "00000000-0000-0000-0000-000000000302",
            sequence_no: 2,
            name: "主项B",
            display_name: "主项B",
            optional: false,
            sport_type: "strength",
            unit_role: "main",
            progress_track_key: "scripted_track",
            progression_family: "performance",
            progression_policy_type: "scripted_cycle",
            progression_policy_config: {
              advance_on: "success",
              cycle_mode: "loop",
              steps: [
                { step_name: "step_1", target: { current_load: 40, current_sets: 3, current_reps: 8 } },
                { step_name: "step_2", target: { current_load: 42.5, current_sets: 3, current_reps: 6 } },
              ],
            },
            adjustment_policy_type: "always",
            adjustment_policy_config: {},
            success_criteria: { min_success_count: 1 },
            prescription_type: "sets_reps",
            prescription_payload: { sets: 3, reps: 8, load_value: 40, load_model: "external" },
            movement_pattern_tags: [],
            contraindication_tags: [],
            fatigue_tags: [],
          },
        ],
      },
    ],
  });

  const units = plannedSessionSeeds[0]?.planned_units ?? [];
  assert(units.length === 2, "应生成两个 planned unit");

  const periodizationSnapshot = units[0].progression_snapshot as Record<string, unknown>;
  const scriptedSnapshot = units[1].progression_snapshot as Record<string, unknown>;
  const pMeta = (periodizationSnapshot.meta ?? {}) as Record<string, unknown>;
  const sMeta = (scriptedSnapshot.meta ?? {}) as Record<string, unknown>;

  assert(pMeta.switch_event === "phase_advance", "linear_periodization_step 应写入 phase_advance");
  assert(pMeta.stage_index_after === 1, "linear_periodization_step 阶段应推进到 1");
  assert(sMeta.switch_event === "cycle_advance", "scripted_cycle 应写入 cycle_advance");
  assert(sMeta.cycle_step_after === 1, "scripted_cycle 应推进到 step 1");
}

function verifyOutcomeDeltas() {
  const unmet = classifyTrackOutcomeFromExecution({
    completionStatus: "completed",
    resultFlags: { checkoff_v1: { deviation_tags: ["less_reps"] } },
  });
  assert(unmet === "success_unmet", "completed + less_reps 应判定 success_unmet");

  const deltaPartial = buildProgressTrackOutcomeDelta({
    previousOutcome: "success_met",
    nextOutcome: "partial",
    recoveryPolicy: "preserve_order",
    unitRole: "main",
    currentState: {
      current_phase: "baseline",
      pending_retry: false,
      extra_state: { skipped_count: 0 },
    },
    now: new Date("2026-04-07T00:00:00.000Z"),
  });
  assert(deltaPartial.successDelta === -1, "success_met -> partial 应回退 success 计数");
  assert(deltaPartial.failureDelta === 1, "success_met -> partial 应增加 failure 计数");
  assert(deltaPartial.nextState.pending_retry === true, "preserve_order 下 partial 应进入 pending_retry");

  const deltaSkipped = buildProgressTrackOutcomeDelta({
    previousOutcome: null,
    nextOutcome: "skipped",
    recoveryPolicy: "preserve_calendar",
    unitRole: "accessory",
    currentState: {
      current_phase: "baseline",
      pending_retry: false,
      extra_state: { skipped_count: 2 },
    },
    now: new Date("2026-04-07T00:00:00.000Z"),
  });
  assert(deltaSkipped.exposureDelta === 0, "skipped 不应消耗 exposure");
  const skippedCount = ((deltaSkipped.nextState.extra_state ?? {}) as Record<string, unknown>).skipped_count;
  assert(skippedCount === 3, "skipped 应增加 skipped_count");
}

async function main() {
  await verifyPeriodizationAndScriptedCycle();
  verifyOutcomeDeltas();
  console.log("[round33] progression periodization + exception handling checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
