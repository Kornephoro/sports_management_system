import { PlannedSessionGenerationReason, Prisma } from "@prisma/client";
import { z } from "zod";

import {
  applyProgressTrackGenerationUpdates,
  createPlannedSessionsWithUnits,
  deleteFutureUnexecutedPlannedSessions,
  ensureProgressTrackByKey,
  getProgramDetailWithStructure,
  getProgramMaxPlannedSequenceIndex,
  listActiveConstraintProfilesByUser,
  listProgressTracksByUser,
} from "@/server/repositories";
import { buildInitialProgressTrackState } from "@/server/services/progression/progression-config.service";
import { buildMinimalPlannedSessions } from "@/server/services/sessions/planned-session-builder.service";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";

const GeneratePlannedSessionsInputSchema = z.object({
  userId: UuidLikeSchema,
  programId: UuidLikeSchema,
  startDate: z.coerce.date(),
  sessionCount: z.number().int().positive().max(90).default(7),
  rotationQuota: z.number().int().min(1).max(5).optional(),
  schedulingMode: z.enum(["ordered_daily", "smart_elastic"]).default("ordered_daily"),
  replaceFutureUnexecuted: z.boolean().default(true),
  generationReason: z.nativeEnum(PlannedSessionGenerationReason).default("initial_generation"),
  sessionTemplateCodeSequence: z.array(z.string().trim().min(1)).optional(),
  sessionDateSequence: z.array(z.coerce.date()).optional(),
});

export type GeneratePlannedSessionsInput = z.infer<typeof GeneratePlannedSessionsInputSchema>;
export type GeneratePlannedSessionsInputPayload = z.input<typeof GeneratePlannedSessionsInputSchema>;

function asPayloadObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function generatePlannedSessionsUseCase(rawInput: GeneratePlannedSessionsInputPayload) {
  const input = GeneratePlannedSessionsInputSchema.parse(rawInput);
  if (
    input.sessionTemplateCodeSequence &&
    input.sessionTemplateCodeSequence.length !== input.sessionCount
  ) {
    throw badRequestError("sessionTemplateCodeSequence length must match sessionCount");
  }
  if (input.sessionDateSequence && input.sessionDateSequence.length !== input.sessionCount) {
    throw badRequestError("sessionDateSequence length must match sessionCount");
  }

  const program = await getProgramDetailWithStructure(input.programId, input.userId);
  if (!program) {
    throw notFoundError("Program not found");
  }

  const allSessionTemplates = program.blocks.flatMap((block) =>
    block.session_templates.map((template) => ({
      blockId: block.id,
      template,
    })),
  );

  const enabledTemplates = allSessionTemplates.filter(({ template }) => template.enabled);
  const enabledTemplatesWithUnits = enabledTemplates.filter(
    ({ template }) => template.training_unit_templates.some((unit) => unit.is_key_unit),
  );

  const templates = enabledTemplatesWithUnits.map(({ blockId, template }) => ({
    id: template.id,
    code: template.code,
    block_id: blockId,
    expected_duration_min: template.expected_duration_min,
    objective_summary: template.objective_summary,
    training_unit_templates: template.training_unit_templates
      .filter((unit) => unit.is_key_unit)
      .map((unit) => ({
      id: unit.id,
      sequence_no: unit.sequence_no,
      name: unit.name,
      display_name: unit.display_name,
      optional: unit.optional,
      sport_type: unit.sport_type,
      unit_role: unit.unit_role,
      progress_track_key: unit.progress_track_key,
      progression_family: unit.progression_family,
      progression_policy_type: unit.progression_policy_type,
      progression_policy_config: unit.progression_policy_config,
      adjustment_policy_type: unit.adjustment_policy_type,
      adjustment_policy_config: unit.adjustment_policy_config,
      success_criteria: unit.success_criteria,
      prescription_type: unit.prescription_type,
      prescription_payload: unit.prescription_payload,
      movement_pattern_tags: unit.movement_pattern_tags,
      contraindication_tags: unit.contraindication_tags,
      fatigue_tags: unit.fatigue_tags,
    })),
  }));

  if (templates.length === 0) {
    if (allSessionTemplates.length === 0) {
      throw badRequestError(
        "Program has no session templates. Please choose a demo-ready program with SessionTemplate data first.",
      );
    }

    if (enabledTemplates.length === 0) {
      throw badRequestError(
        "No enabled session templates found under this program. Please enable at least one SessionTemplate.",
      );
    }

    throw badRequestError(
      "Enabled session templates found, but no TrainingUnitTemplate is attached. Please add at least one unit template.",
    );
  }

  const activeConstraints = program.constraint_aware_planning
    ? await listActiveConstraintProfilesByUser(input.userId, 100)
    : [];

  const uniqueTrackSeedMap = new Map<
    string,
    {
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
      progression_policy_config: unknown;
      prescription_type: string;
      prescription_payload: unknown;
    }
  >();

  for (const template of templates) {
    for (const unit of template.training_unit_templates) {
      if (!uniqueTrackSeedMap.has(unit.progress_track_key)) {
        uniqueTrackSeedMap.set(unit.progress_track_key, {
          track_key: unit.progress_track_key,
          name: unit.display_name ?? unit.name,
          sport_type: unit.sport_type,
          progression_family: unit.progression_family,
          progression_policy_type: unit.progression_policy_type,
          progression_policy_config: unit.progression_policy_config,
          prescription_type: unit.prescription_type,
          prescription_payload: unit.prescription_payload,
        });
      }
    }
  }

  await Promise.all(
    Array.from(uniqueTrackSeedMap.values()).map((trackSeed) =>
      ensureProgressTrackByKey({
        user_id: input.userId,
        program_id: input.programId,
        track_key: trackSeed.track_key,
        name: trackSeed.name,
        sport_type: trackSeed.sport_type,
        progression_family: trackSeed.progression_family,
        progression_policy_type: trackSeed.progression_policy_type,
        progression_policy_config: trackSeed.progression_policy_config as Prisma.InputJsonValue,
        current_state: buildInitialProgressTrackState({
          prescriptionType: trackSeed.prescription_type,
          payload: asPayloadObject(trackSeed.prescription_payload),
        }) as Prisma.InputJsonValue,
      }),
    ),
  );

  if (input.replaceFutureUnexecuted) {
    await deleteFutureUnexecutedPlannedSessions(input.programId, input.userId, input.startDate);
  }

  const maxSequenceIndex = await getProgramMaxPlannedSequenceIndex(input.programId);

  const { plannedSessionSeeds, progressTrackUpdates } = buildMinimalPlannedSessions({
    programId: input.programId,
    userId: input.userId,
    startDate: input.startDate,
    sessionCount: input.sessionCount,
    startSequenceIndex: maxSequenceIndex,
    generationReason: input.generationReason,
    schedulingMode: input.schedulingMode,
    templates,
    progressTracks: await listProgressTracksByUser(input.userId, input.programId),
    activeConstraints,
    rotationQuota: input.rotationQuota,
    sessionTemplateCodeSequence: input.sessionTemplateCodeSequence,
    sessionDateSequence: input.sessionDateSequence,
  });

  const sessions = await createPlannedSessionsWithUnits(plannedSessionSeeds);

  if (progressTrackUpdates.length > 0) {
    await applyProgressTrackGenerationUpdates(progressTrackUpdates);
  }

  return sessions;
}
