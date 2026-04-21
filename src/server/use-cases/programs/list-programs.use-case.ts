import { z } from "zod";

import { listProgramsByUser } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const ListProgramsInputSchema = z.object({
  userId: UuidLikeSchema,
});

export type ListProgramsInput = z.input<typeof ListProgramsInputSchema>;

export async function listProgramsUseCase(rawInput: ListProgramsInput) {
  const input = ListProgramsInputSchema.parse(rawInput);
  const programs = await listProgramsByUser(input.userId);

  return programs.map((program) => {
    const sessionTemplates = program.blocks.flatMap((block) => block.session_templates);
    const enabledSessionTemplates = sessionTemplates.filter((sessionTemplate) => sessionTemplate.enabled);
    const enabledSessionTemplatesWithUnits = enabledSessionTemplates.filter(
      (sessionTemplate) =>
        sessionTemplate.training_unit_templates.some((unitTemplate) => unitTemplate.is_key_unit),
    );

    return {
      id: program.id,
      name: program.name,
      sport_type: program.sport_type,
      status: program.status,
      start_date: program.start_date,
      end_date: program.end_date,
      weekly_frequency_target: program.weekly_frequency_target,
      created_at: program.created_at,
      block_count: program.blocks.length,
      session_template_count: sessionTemplates.length,
      enabled_session_template_count: enabledSessionTemplates.length,
      enabled_session_template_with_units_count: enabledSessionTemplatesWithUnits.length,
      planning_ready: enabledSessionTemplatesWithUnits.length > 0,
    };
  });
}
