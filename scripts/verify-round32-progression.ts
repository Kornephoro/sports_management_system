import { Prisma, ProgressTrack, ProgressTrackStatus } from "@prisma/client";

import { buildMinimalPlannedSessions } from "@/server/services/sessions/planned-session-builder.service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createTrack(args: {
  id: string;
  trackKey: string;
  lastProgressionAt: Date | null;
  successCount: number;
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
    progression_family: "threshold",
    progression_policy_type: "add_set_then_load",
    progression_policy_config: {},
    current_state: args.currentState,
    exposure_count: 0,
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

async function main() {
  const tracks = [
    createTrack({
      id: "00000000-0000-0000-0000-000000000101",
      trackKey: "main_track",
      lastProgressionAt: new Date("2026-04-01T00:00:00.000Z"),
      successCount: 2,
      progressionCount: 1,
      currentState: {
        current_load: 60,
        current_sets: 3,
        current_reps: 5,
      },
    }),
    createTrack({
      id: "00000000-0000-0000-0000-000000000102",
      trackKey: "acc_track_old",
      lastProgressionAt: new Date("2026-03-01T00:00:00.000Z"),
      successCount: 2,
      progressionCount: 1,
      currentState: {
        current_load: 20,
        current_sets: 3,
        current_reps: 10,
      },
    }),
    createTrack({
      id: "00000000-0000-0000-0000-000000000103",
      trackKey: "acc_track_new",
      lastProgressionAt: new Date("2026-04-05T00:00:00.000Z"),
      successCount: 2,
      progressionCount: 1,
      currentState: {
        current_load: 22.5,
        current_sets: 3,
        current_reps: 10,
      },
    }),
  ];

  const { plannedSessionSeeds, progressTrackUpdates } = buildMinimalPlannedSessions({
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
        objective_summary: "Round32 verify",
        training_unit_templates: [
          {
            id: "00000000-0000-0000-0000-000000000301",
            sequence_no: 1,
            name: "主项深蹲",
            display_name: "主项深蹲",
            optional: false,
            sport_type: "strength",
            unit_role: "main",
            progress_track_key: "main_track",
            progression_family: "strict_load",
            progression_policy_type: "linear_load_step",
            progression_policy_config: { load_increment: 2.5 },
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
            name: "辅项划船A",
            display_name: "辅项划船A",
            optional: false,
            sport_type: "strength",
            unit_role: "accessory",
            progress_track_key: "acc_track_old",
            progression_family: "threshold",
            progression_policy_type: "add_set_then_load",
            progression_policy_config: { base_sets: 3, advanced_sets: 4, load_increment: 2.5 },
            adjustment_policy_type: "rotating_pool",
            adjustment_policy_config: {},
            success_criteria: { min_success_count: 1 },
            prescription_type: "sets_reps",
            prescription_payload: { sets: 3, reps: 10, load_value: 20, load_model: "external" },
            movement_pattern_tags: [],
            contraindication_tags: [],
            fatigue_tags: [],
          },
          {
            id: "00000000-0000-0000-0000-000000000303",
            sequence_no: 3,
            name: "辅项划船B",
            display_name: "辅项划船B",
            optional: false,
            sport_type: "strength",
            unit_role: "accessory",
            progress_track_key: "acc_track_new",
            progression_family: "threshold",
            progression_policy_type: "add_set_then_load",
            progression_policy_config: { base_sets: 3, advanced_sets: 4, load_increment: 2.5 },
            adjustment_policy_type: "rotating_pool",
            adjustment_policy_config: {},
            success_criteria: { min_success_count: 1 },
            prescription_type: "sets_reps",
            prescription_payload: { sets: 3, reps: 10, load_value: 22.5, load_model: "external" },
            movement_pattern_tags: [],
            contraindication_tags: [],
            fatigue_tags: [],
          },
        ],
      },
    ],
  });

  assert(plannedSessionSeeds.length === 1, "应生成 1 条 planned session");
  const units = plannedSessionSeeds[0].planned_units;
  assert(units.length === 3, "应生成 3 条 planned units");

  const mainUnit = units[0];
  const accessoryOld = units[1];
  const accessoryNew = units[2];

  const mainSnapshot = mainUnit.progression_snapshot as Record<string, unknown>;
  const oldSnapshot = accessoryOld.progression_snapshot as Record<string, unknown>;
  const newSnapshot = accessoryNew.progression_snapshot as Record<string, unknown>;

  assert(
    Array.isArray(mainSnapshot.changed_fields) && (mainSnapshot.changed_fields as unknown[]).length > 0,
    "主项应在本轮策略下产生变化",
  );
  assert(
    oldSnapshot.change_reason === "normal_progression" ||
      oldSnapshot.change_reason === "threshold_reached",
    "最久未进步的 accessory 应被轮转选中并产生变化",
  );
  assert(
    newSnapshot.change_reason === "not_selected_in_rotation",
    "未入选 accessory 应输出 not selected 原因",
  );
  assert(progressTrackUpdates.length >= 2, "应至少写回主项和一个 accessory 的 track 状态");

  console.log("[round32] progression minimal runtime checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
