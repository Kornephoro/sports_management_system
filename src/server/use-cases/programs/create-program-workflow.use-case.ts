import {
  BlockType,
  GoalType,
  ProgramStatus,
  SessionCategory,
  SportType,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  createBlock,
  createGoal,
  createProgram,
  createSessionTemplate,
} from "@/server/repositories";
import { buildProgramCreateDataWithDefaults } from "@/server/services/programs/program-defaults.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { applyTemplateLibraryItemToSessionTemplateWithTx } from "@/server/use-cases/template-library/apply-template-library-item-to-session-template.use-case";

const ProgramWorkflowStructureSchema = z.enum(["weekly_1_day"]);

const CreateProgramWorkflowInputSchema = z.object({
  userId: UuidLikeSchema,
  programName: z.string().trim().min(1).max(120),
  structure: ProgramWorkflowStructureSchema.default("weekly_1_day"),
  sportType: z.nativeEnum(SportType).default("strength"),
  startDate: z.coerce.date().optional(),
  templateLibraryItemId: UuidLikeSchema.optional(),
});

export type CreateProgramWorkflowInput = z.input<typeof CreateProgramWorkflowInputSchema>;

function mapGoalType(sportType: SportType): GoalType {
  if (sportType === "hypertrophy") {
    return "hypertrophy";
  }
  if (sportType === "running" || sportType === "swimming" || sportType === "racket") {
    return "performance";
  }
  return "strength";
}

function mapSessionCategory(sportType: SportType): SessionCategory {
  if (sportType === "hypertrophy") {
    return "hypertrophy";
  }
  if (sportType === "running" || sportType === "swimming") {
    return "endurance";
  }
  return "strength";
}

function mapBlockType(sportType: SportType): BlockType {
  if (sportType === "running" || sportType === "swimming") {
    return "base";
  }
  return "accumulation";
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function createProgramWorkflowUseCase(rawInput: CreateProgramWorkflowInput) {
  const input = CreateProgramWorkflowInputSchema.parse(rawInput);
  const startDate = input.startDate ?? startOfToday();

  return prisma.$transaction(async (tx) => {
    const goal = await createGoal(
      {
        user_id: input.userId,
        name: `${input.programName}目标`,
        goal_type: mapGoalType(input.sportType),
        primary_sport: input.sportType,
        status: ProgramStatus.active,
        priority: 1,
        start_date: startDate,
        target_payload: {},
        success_metrics: {},
        constraints: {},
        notes: "自动创建：用于从空系统快速开始训练主链。",
      },
      tx,
    );

    const program = await createProgram(
      buildProgramCreateDataWithDefaults({
        name: input.programName,
        userId: input.userId,
        goalId: goal.id,
        sportType: input.sportType,
        status: ProgramStatus.active,
        startDate,
        durationWeeks: input.structure === "weekly_1_day" ? 1 : undefined,
        weeklyFrequencyTarget: 1,
        constraintAwarePlanning: true,
        source: "manual",
        notes: "自动创建：可在详情页继续添加动作与模板。",
      }),
      tx,
    );

    const block = await createBlock(
      {
        program_id: program.id,
        sequence_no: 1,
        name: "第1训练阶段",
        block_type: mapBlockType(input.sportType),
        start_date: startDate,
        volume_target: {},
        intensity_target: {},
        progression_focus: {},
        notes: "自动创建：用于最小可用排期与执行链路。",
      },
      tx,
    );

    const sessionTemplate = await createSessionTemplate(
      {
        block_id: block.id,
        code: "DAY1",
        name: "训练日 1",
        sequence_in_microcycle: 1,
        microcycle_anchor: "ordered_rotation",
        preferred_weekday: null,
        sport_type: input.sportType,
        session_category: mapSessionCategory(input.sportType),
        theme_tags: [],
        objective_summary: "默认训练日，请按需添加动作。",
        expected_duration_min: 60,
        fatigue_cost: "medium",
        priority: 1,
        scheduling_policy_type: "ordered_rotation",
        scheduling_policy_config: {},
        enabled: true,
        notes: "自动创建：支持动作库与模板库导入。",
      },
      tx,
    );

    if (input.templateLibraryItemId) {
      await applyTemplateLibraryItemToSessionTemplateWithTx(
        {
          userId: input.userId,
          templateLibraryItemId: input.templateLibraryItemId,
          sessionTemplateId: sessionTemplate.id,
          mode: "replace",
        },
        tx,
      );
    }

    return {
      goalId: goal.id,
      programId: program.id,
      blockId: block.id,
      sessionTemplateId: sessionTemplate.id,
      program,
    };
  });
}
