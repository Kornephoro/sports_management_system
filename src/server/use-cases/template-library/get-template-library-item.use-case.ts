import { z } from "zod";

import {
  getTemplateLibraryItemByIdForUser,
  getTemplateLibraryItemDetailAggregate,
} from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { notFoundError } from "@/server/use-cases/shared/use-case-error";

import { toTemplateLibraryItemDto } from "./shared";

const GetTemplateLibraryItemInputSchema = z.object({
  userId: UuidLikeSchema,
  itemId: UuidLikeSchema,
});

export type GetTemplateLibraryItemInput = z.input<typeof GetTemplateLibraryItemInputSchema>;

export async function getTemplateLibraryItemUseCase(rawInput: GetTemplateLibraryItemInput) {
  const input = GetTemplateLibraryItemInputSchema.parse(rawInput);

  const [item, aggregate] = await Promise.all([
    getTemplateLibraryItemByIdForUser(input.itemId, input.userId),
    getTemplateLibraryItemDetailAggregate(input.itemId, input.userId),
  ]);

  if (!item || !aggregate) {
    throw notFoundError("Template library item not found");
  }

  return {
    ...toTemplateLibraryItemDto(item),
    summary: {
      totalTemplateReferences: aggregate.summary.total_template_references,
      totalProgramReferences: aggregate.summary.total_program_references,
      totalPlannedReferences: aggregate.summary.total_planned_references,
      totalPackageReferences: aggregate.summary.total_package_references,
      latestUsedAt: aggregate.summary.latest_used_at,
    },
    references: {
      templates: aggregate.references.templates.map((item) => ({
        unitTemplateId: item.unit_template_id,
        unitName: item.unit_name,
        sessionTemplateId: item.session_template_id,
        sessionTemplateName: item.session_template_name,
        blockId: item.block_id,
        blockName: item.block_name,
        programId: item.program_id,
        programName: item.program_name,
        updatedAt: item.updated_at,
      })),
      planned: aggregate.references.planned.map((item) => ({
        plannedSessionId: item.planned_session_id,
        sessionDate: item.session_date,
        sequenceIndex: item.sequence_index,
        status: item.status,
        programId: item.program_id,
        programName: item.program_name,
      })),
      packages: aggregate.references.packages.map((item) => ({
        packageId: item.package_id,
        packageName: item.package_name,
        dayCode: item.day_code,
        dayLabel: item.day_label,
        updatedAt: item.updated_at,
      })),
    },
    governance: {
      duplicateCandidates: aggregate.governance.duplicate_candidates.map((item) => ({
        id: item.id,
        name: item.name,
      })),
    },
  };
}
