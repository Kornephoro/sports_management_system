import { z } from "zod";

import { TemplateSplitType } from "@/lib/template-library-standards";
import { getTemplatePackageByIdForUser, updateTemplatePackageById } from "@/server/repositories";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";
import { badRequestError, notFoundError } from "@/server/use-cases/shared/use-case-error";
import { createTemplateLibraryItemUseCase } from "@/server/use-cases/template-library/create-template-library-item.use-case";

import { toTemplatePackageDto } from "./shared";

const CreateAndBindTemplateDayInputSchema = z.object({
  userId: UuidLikeSchema,
  packageId: UuidLikeSchema,
  dayCode: z.string().trim().min(1),
  templateName: z.string().trim().min(1).max(120),
  description: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type CreateAndBindTemplateDayInput = z.input<
  typeof CreateAndBindTemplateDayInputSchema
>;

function mapPackageSplitTypeToTemplateSplitType(
  splitType: string,
): TemplateSplitType {
  if (splitType === "single_day") return "full_body";
  if (splitType === "two_way") return "upper_lower";
  if (splitType === "three_way") return "push_pull_legs";
  return "custom";
}

export async function createAndBindTemplateDayUseCase(
  rawInput: CreateAndBindTemplateDayInput,
) {
  const input = CreateAndBindTemplateDayInputSchema.parse(rawInput);
  const packageItem = await getTemplatePackageByIdForUser(input.packageId, input.userId);
  if (!packageItem) {
    throw notFoundError("Template package not found");
  }

  const normalizedDayCode = input.dayCode.trim().toUpperCase();
  const dayToBind = packageItem.days.find(
    (day) => day.day_code.toUpperCase() === normalizedDayCode,
  );
  if (!dayToBind) {
    throw badRequestError(`模板包中不存在训练日：${normalizedDayCode}`);
  }

  const createdTemplate = await createTemplateLibraryItemUseCase({
    userId: input.userId,
    name: input.templateName.trim(),
    description: input.description?.trim() || undefined,
    splitType: mapPackageSplitTypeToTemplateSplitType(packageItem.split_type),
    aliases: [],
    notes: input.notes?.trim() || undefined,
    units: [],
  });

  const updatedDays = packageItem.days.map((day) => ({
    id: day.id,
    day_code: day.day_code,
    sequence_in_microcycle: day.sequence_in_microcycle,
    template_library_item_id:
      day.id === dayToBind.id ? createdTemplate.id : day.template_library_item_id,
    label: day.label,
    notes: day.notes,
    progression_overrides: day.progression_overrides,
  }));

  const updated = await updateTemplatePackageById(
    packageItem.id,
    input.userId,
    { days: updatedDays },
  );
  if (updated.count === 0) {
    throw badRequestError("模板包更新失败，请重试");
  }

  const latest = await getTemplatePackageByIdForUser(packageItem.id, input.userId);
  if (!latest) {
    throw notFoundError("Template package not found");
  }

  return {
    createdTemplate,
    templatePackage: toTemplatePackageDto(latest),
    boundDayCode: normalizedDayCode,
  };
}

