import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ids = {
  user: "00000000-0000-0000-0000-000000000001",
  goal: "10000000-0000-0000-0000-000000000001",
  program: "20000000-0000-0000-0000-000000000001",
  block: "30000000-0000-0000-0000-000000000001",
  sessionA: "40000000-0000-0000-0000-000000000001",
  sessionB: "40000000-0000-0000-0000-000000000002",
  sessionC: "40000000-0000-0000-0000-000000000003",
  progressStrength: "50000000-0000-0000-0000-000000000001",
  progressCore: "50000000-0000-0000-0000-000000000002",
};

async function seedGoalToBlock() {
  await prisma.goal.upsert({
    where: { id: ids.goal },
    update: {
      name: "一分化训练目标（当前录入版）",
      status: "active",
      target_payload: {
        objective: "single_split_day3_ready",
      },
      success_metrics: {
        day3_ready: true,
      },
      constraints: {
        avoid_tags: [],
      },
      notes: "仅录入一分化计划 DAY3",
    },
    create: {
      id: ids.goal,
      user_id: ids.user,
      name: "一分化训练目标（当前录入版）",
      goal_type: "performance",
      primary_sport: "strength",
      status: "active",
      priority: 1,
      start_date: new Date("2026-04-01"),
      target_date: new Date("2026-12-31"),
      target_payload: {
        objective: "single_split_day3_ready",
      },
      success_metrics: {
        day3_ready: true,
      },
      constraints: {
        avoid_tags: [],
      },
      notes: "仅录入一分化计划 DAY3",
    },
  });

  await prisma.program.upsert({
    where: { id: ids.program },
    update: {
      name: "一分化训练计划（当前录入版）",
      sport_type: "strength",
      status: "active",
      duration_weeks: 36,
      weekly_frequency_target: 1,
      weekly_exposure_mix: {
        strength: 1,
      },
      default_recovery_policy_config: {
        max_reschedule_days: 2,
      },
      default_adaptation_policy_config: {
        deload_trigger: "manual_review",
      },
      notes: "仅录入 DAY3，支持生成安排与执行记录",
    },
    create: {
      id: ids.program,
      user_id: ids.user,
      goal_id: ids.goal,
      name: "一分化训练计划（当前录入版）",
      sport_type: "strength",
      program_type: "training_cycle",
      status: "active",
      version: 1,
      start_date: new Date("2026-04-01"),
      end_date: new Date("2026-12-31"),
      duration_weeks: 36,
      weekly_frequency_target: 1,
      weekly_exposure_mix: {
        strength: 1,
      },
      default_recovery_policy_type: "preserve_order",
      default_recovery_policy_config: {
        max_reschedule_days: 2,
      },
      default_adaptation_policy_config: {
        deload_trigger: "manual_review",
      },
      constraint_aware_planning: true,
      source: "manual",
      notes: "仅录入 DAY3，支持生成安排与执行记录",
    },
  });

  await prisma.block.upsert({
    where: {
      program_id_sequence_no: {
        program_id: ids.program,
        sequence_no: 1,
      },
    },
    update: {
      name: "第1微周期（当前录入）",
      objective_summary: "一分化计划当前训练日：DAY3",
      volume_target: {
        day3_focus: "compound_push_pull_leg_core",
      },
      intensity_target: {
        strength_rpe_cap: 10,
      },
      progression_focus: {
        primary: "manual_tuning",
        secondary: "execution_ready",
      },
      notes: "仅包含一个启用训练日模板：DAY3",
    },
    create: {
      id: ids.block,
      program_id: ids.program,
      sequence_no: 1,
      name: "第1微周期（当前录入）",
      block_type: "base",
      start_date: new Date("2026-04-01"),
      end_date: new Date("2026-12-31"),
      objective_summary: "一分化计划当前训练日：DAY3",
      volume_target: {
        day3_focus: "compound_push_pull_leg_core",
      },
      intensity_target: {
        strength_rpe_cap: 10,
      },
      progression_focus: {
        primary: "manual_tuning",
        secondary: "execution_ready",
      },
      entry_criteria: {
        planning_ready: true,
      },
      exit_criteria: {
        day3_confirmed: true,
      },
      recovery_overrides: {
        manual_reschedule_allowed: true,
      },
      notes: "仅包含一个启用训练日模板：DAY3",
    },
  });
}

async function seedSessionTemplates() {
  const managedSessionTemplateIds = [ids.sessionA, ids.sessionB, ids.sessionC];
  const sessionTemplates = [
    {
      id: ids.sessionA,
      code: "DAY1_RESERVED",
      name: "未启用保留模板 1",
      sequence_in_microcycle: 1,
      sport_type: "strength",
      session_category: "strength",
      expected_duration_min: 60,
      fatigue_cost: "low",
      theme_tags: ["reserved"],
      enabled: false,
      objective_summary: "预留未启用模板",
      notes: "保留但不启用",
    },
    {
      id: ids.sessionB,
      code: "DAY2_RESERVED",
      name: "未启用保留模板 2",
      sequence_in_microcycle: 2,
      sport_type: "strength",
      session_category: "strength",
      expected_duration_min: 60,
      fatigue_cost: "low",
      theme_tags: ["reserved"],
      enabled: false,
      objective_summary: "预留未启用模板",
      notes: "保留但不启用",
    },
    {
      id: ids.sessionC,
      code: "DAY3",
      name: "第3天",
      sequence_in_microcycle: 3,
      sport_type: "strength",
      session_category: "mixed",
      expected_duration_min: 80,
      fatigue_cost: "high",
      theme_tags: ["day3", "一分化", "mc1"],
      enabled: true,
      objective_summary: "第1微周期 DAY3（当前可执行训练日）",
      notes: "当前仅启用 DAY3",
    },
  ];

  for (const session of sessionTemplates) {
    await prisma.sessionTemplate.upsert({
      where: {
        block_id_sequence_in_microcycle: {
          block_id: ids.block,
          sequence_in_microcycle: session.sequence_in_microcycle,
        },
      },
      update: {
        code: session.code,
        name: session.name,
        sequence_in_microcycle: session.sequence_in_microcycle,
        session_category: session.session_category,
        theme_tags: session.theme_tags,
        objective_summary: session.objective_summary,
        expected_duration_min: session.expected_duration_min,
        fatigue_cost: session.fatigue_cost,
        enabled: session.enabled,
        notes: session.notes,
      },
      create: {
        id: session.id,
        block_id: ids.block,
        code: session.code,
        name: session.name,
        sequence_in_microcycle: session.sequence_in_microcycle,
        microcycle_anchor: "ordered_rotation",
        preferred_weekday: null,
        sport_type: session.sport_type,
        session_category: session.session_category,
        theme_tags: session.theme_tags,
        objective_summary: session.objective_summary,
        expected_duration_min: session.expected_duration_min,
        fatigue_cost: session.fatigue_cost,
        priority: 1,
        scheduling_policy_type: "ordered_rotation",
        scheduling_policy_config: {
          window_days: 2,
        },
        enabled: session.enabled,
        notes: session.notes,
      },
    });
  }

  await prisma.sessionTemplate.updateMany({
    where: {
      block_id: ids.block,
      id: {
        notIn: managedSessionTemplateIds,
      },
    },
    data: {
      enabled: false,
      notes: "历史残留训练日模板（已停用）",
    },
  });
}

async function seedTrainingUnitTemplates() {
  const units = [
    {
      sequence_no: 1,
      name: "杠铃深蹲",
      unit_role: "main",
      unit_category: "exercise",
      progress_track_key: "barbell_back_squat_primary",
      progression_family: "strict_load",
      progression_policy_type: "linear_double_progression",
      prescription_type: "sets_reps",
      prescription_payload: {
        sets: 3,
        reps: 6,
        target_reps_range: [3, 8],
        default_load: { value: 60, unit: "kg" },
        rpe_range: [5, 8],
        movement_pattern: "蹲类动作",
        movement_type: "复合动作",
        primary_muscle: "股四头肌",
        secondary_muscle: "臀大肌",
        additional_stress: "竖脊肌（下背）",
      },
      movement_pattern_tags: ["squat"],
      muscle_tags: ["股四头肌", "臀大肌"],
      priority_score_base: 10.0,
      notes: "一分化 DAY3 动作 1",
    },
    {
      sequence_no: 2,
      name: "罗马尼亚硬拉",
      unit_role: "secondary",
      unit_category: "exercise",
      progress_track_key: "hinge_volume_secondary",
      progression_family: "strict_load",
      progression_policy_type: "step_load",
      prescription_type: "sets_reps",
      prescription_payload: {
        sets: 3,
        reps: 6,
        target_reps_range: [3, 8],
        default_load: { value: 70, unit: "kg" },
        rpe_range: [5, 8],
        movement_pattern: "髋铰链动作",
        movement_type: "复合动作",
        primary_muscle: "腘绳肌",
        secondary_muscle: "臀大肌",
        additional_stress: "竖脊肌（下背）",
      },
      movement_pattern_tags: ["hip_hinge"],
      muscle_tags: ["腘绳肌", "臀大肌"],
      priority_score_base: 8.5,
      notes: "一分化 DAY3 动作 2",
    },
    {
      sequence_no: 3,
      name: "杠铃平板卧推",
      unit_role: "main",
      unit_category: "exercise",
      progress_track_key: "barbell_bench_press_primary",
      progression_family: "strict_load",
      progression_policy_type: "linear_double_progression",
      prescription_type: "sets_reps",
      prescription_payload: {
        sets: 3,
        reps: 8,
        target_reps_range: [3, 12],
        default_load: { value: 40, unit: "kg" },
        rpe_range: [6, 9],
        movement_pattern: "水平推类动作",
        movement_type: "复合动作",
        primary_muscle: "胸肌",
        secondary_muscle: "肱三头肌",
        additional_stress: "三角肌前束",
      },
      movement_pattern_tags: ["horizontal_push"],
      muscle_tags: ["胸肌", "肱三头肌"],
      priority_score_base: 9.0,
      notes: "一分化 DAY3 动作 3",
    },
    {
      sequence_no: 4,
      name: "俯卧撑",
      unit_role: "secondary",
      unit_category: "exercise",
      progress_track_key: "pushup_volume_accessory",
      progression_family: "autoregulated",
      progression_policy_type: "rep_progression",
      prescription_type: "sets_reps",
      prescription_payload: {
        sets: 3,
        reps: 8,
        target_reps_range: [8, 20],
        default_load: { value: "自重", unit: "bodyweight" },
        rpe_range: [7, 10],
        movement_pattern: "水平推类动作",
        movement_type: "复合动作",
        primary_muscle: "胸肌",
        secondary_muscle: "肱三头肌",
        additional_stress: "腹肌 / 核心",
      },
      movement_pattern_tags: ["horizontal_push"],
      muscle_tags: ["胸肌", "肱三头肌", "核心"],
      priority_score_base: 7.0,
      notes: "一分化 DAY3 动作 4",
    },
    {
      sequence_no: 5,
      name: "高位下拉",
      unit_role: "secondary",
      unit_category: "exercise",
      progress_track_key: "lat_pulldown_primary",
      progression_family: "strict_load",
      progression_policy_type: "double_progression",
      prescription_type: "sets_reps",
      prescription_payload: {
        sets: 3,
        reps: 8,
        target_reps_range: [6, 15],
        default_load: { value: 80, unit: "lbs" },
        rpe_range: [6, 10],
        movement_pattern: "垂直拉类动作",
        movement_type: "复合动作",
        primary_muscle: "背阔肌",
        secondary_muscle: "肱二头肌",
        additional_stress: "三角肌后束",
      },
      movement_pattern_tags: ["vertical_pull"],
      muscle_tags: ["背阔肌", "肱二头肌"],
      priority_score_base: 7.0,
      notes: "一分化 DAY3 动作 5",
    },
    {
      sequence_no: 6,
      name: "坐姿划船",
      unit_role: "accessory",
      unit_category: "exercise",
      progress_track_key: "seated_row_secondary",
      progression_family: "strict_load",
      progression_policy_type: "double_progression",
      prescription_type: "sets_reps",
      prescription_payload: {
        sets: 2,
        reps: 8,
        target_reps_range: [6, 15],
        default_load: { value: 110, unit: "lbs" },
        rpe_range: [6, 10],
        movement_pattern: "水平拉类动作",
        movement_type: "复合动作",
        primary_muscle: "背阔肌",
        secondary_muscle: "肱二头肌",
        additional_stress: "三角肌后束",
      },
      movement_pattern_tags: ["horizontal_pull"],
      muscle_tags: ["背阔肌", "肱二头肌"],
      priority_score_base: 6.5,
      notes: "一分化 DAY3 动作 6",
    },
    {
      sequence_no: 7,
      name: "平板支撑",
      unit_role: "accessory",
      unit_category: "stability",
      progress_track_key: "plank_hold_core",
      progression_family: "exposure",
      progression_policy_type: "time_progression",
      prescription_type: "sets_time",
      prescription_payload: {
        sets: 2,
        duration_seconds: 65,
        default_load: { value: "自重", unit: "bodyweight" },
        tracking_rule: "按静力时长记录",
        reps_applicable: false,
        rpe_applicable: false,
        movement_pattern: "全身动作",
        movement_type: "静力动作",
        primary_muscle: "腹肌 / 核心",
      },
      movement_pattern_tags: ["core_stability"],
      muscle_tags: ["腹肌", "核心"],
      priority_score_base: 6.0,
      notes: "一分化 DAY3 动作 7（按时长记录）",
    },
  ];

  const supportedSequenceNos = units.map((unit) => unit.sequence_no);

  await prisma.trainingUnitTemplate.deleteMany({
    where: {
      session_template_id: ids.sessionC,
      sequence_no: {
        notIn: supportedSequenceNos,
      },
      planned_units: {
        none: {},
      },
      unit_executions: {
        none: {},
      },
    },
  });

  await prisma.trainingUnitTemplate.updateMany({
    where: {
      session_template_id: ids.sessionC,
      sequence_no: {
        notIn: supportedSequenceNos,
      },
    },
    data: {
      is_key_unit: false,
      optional: true,
      notes: "历史残留训练单元模板（已停用）",
    },
  });

  for (const unit of units) {
    await prisma.trainingUnitTemplate.upsert({
      where: {
        session_template_id_sequence_no: {
          session_template_id: ids.sessionC,
          sequence_no: unit.sequence_no,
        },
      },
      update: {
        name: unit.name,
        display_name: unit.name,
        sport_type: "strength",
        unit_role: unit.unit_role,
        unit_category: unit.unit_category,
        movement_pattern_tags: unit.movement_pattern_tags,
        muscle_tags: unit.muscle_tags,
        capability_tags: [],
        function_support_tags: [],
        fatigue_tags: [],
        conflict_tags: [],
        contraindication_tags: [],
        prerequisite_function_tags: [],
        is_key_unit: true,
        optional: false,
        priority_score_base: unit.priority_score_base,
        progress_track_key: unit.progress_track_key,
        progression_family: unit.progression_family,
        progression_policy_type: unit.progression_policy_type,
        progression_policy_config: {},
        adjustment_policy_type: "always",
        adjustment_policy_config: {},
        prescription_type: unit.prescription_type,
        prescription_payload: unit.prescription_payload,
        success_criteria: {
          complete_all_sets: true,
        },
        min_spacing_sessions: null,
        adjustment_cooldown_exposures: null,
        notes: unit.notes,
      },
      create: {
        session_template_id: ids.sessionC,
        sequence_no: unit.sequence_no,
        name: unit.name,
        display_name: unit.name,
        sport_type: "strength",
        unit_role: unit.unit_role,
        unit_category: unit.unit_category,
        movement_pattern_tags: unit.movement_pattern_tags,
        muscle_tags: unit.muscle_tags,
        capability_tags: [],
        function_support_tags: [],
        fatigue_tags: [],
        conflict_tags: [],
        contraindication_tags: [],
        prerequisite_function_tags: [],
        is_key_unit: true,
        optional: false,
        priority_score_base: unit.priority_score_base,
        progress_track_key: unit.progress_track_key,
        progression_family: unit.progression_family,
        progression_policy_type: unit.progression_policy_type,
        progression_policy_config: {},
        adjustment_policy_type: "always",
        adjustment_policy_config: {},
        prescription_type: unit.prescription_type,
        prescription_payload: unit.prescription_payload,
        success_criteria: {
          complete_all_sets: true,
        },
        min_spacing_sessions: null,
        adjustment_cooldown_exposures: null,
        notes: unit.notes,
      },
    });
  }
}

async function seedProgressTracks() {
  await prisma.progressTrack.upsert({
    where: { id: ids.progressStrength },
    update: {
      name: "杠铃深蹲主项进展",
      progression_policy_config: { increment_kg: 2.5 },
      current_state: { load_kg: 60, sets: 3, reps: 6 },
      status: "active",
      notes: "DAY3 进展轨道",
    },
    create: {
      id: ids.progressStrength,
      user_id: ids.user,
      program_id: ids.program,
      track_key: "barbell_back_squat_primary",
      name: "杠铃深蹲主项进展",
      sport_type: "strength",
      progression_family: "strict_load",
      progression_policy_type: "linear_double_progression",
      progression_policy_config: { increment_kg: 2.5 },
      current_state: { load_kg: 60, sets: 3, reps: 6 },
      exposure_count: 0,
      success_count: 0,
      failure_count: 0,
      progression_count: 0,
      status: "active",
      notes: "DAY3 进展轨道",
    },
  });

  await prisma.progressTrack.upsert({
    where: { id: ids.progressCore },
    update: {
      name: "平板支撑时长进展",
      progression_policy_config: { increment_seconds: 5 },
      current_state: { duration_seconds: 65, sets: 2 },
      status: "active",
      notes: "DAY3 核心静力动作轨道",
    },
    create: {
      id: ids.progressCore,
      user_id: ids.user,
      program_id: ids.program,
      track_key: "plank_hold_core",
      name: "平板支撑时长进展",
      sport_type: "strength",
      progression_family: "exposure",
      progression_policy_type: "time_progression",
      progression_policy_config: { increment_seconds: 5 },
      current_state: { duration_seconds: 65, sets: 2 },
      exposure_count: 0,
      success_count: 0,
      failure_count: 0,
      progression_count: 0,
      status: "active",
      notes: "DAY3 核心静力动作轨道",
    },
  });
}

async function main() {
  await seedGoalToBlock();
  await seedSessionTemplates();
  await seedTrainingUnitTemplates();
  await seedProgressTracks();

  const sessionTemplateCount = await prisma.sessionTemplate.count({
    where: { block_id: ids.block },
  });
  const enabledSessionTemplateCount = await prisma.sessionTemplate.count({
    where: { block_id: ids.block, enabled: true },
  });
  const unitTemplateCount = await prisma.trainingUnitTemplate.count({
    where: { session_template: { id: ids.sessionC } },
  });

  console.log("Seed completed", {
    userId: ids.user,
    programId: ids.program,
    blockId: ids.block,
    sessionTemplateCount,
    enabledSessionTemplateCount,
    unitTemplateCount,
  });
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
