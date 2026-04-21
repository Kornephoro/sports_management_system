import { z } from "zod";

import {
  countOverdueUnresolvedPlannedSessionsByUser,
  getProgramFirstPlannedSessionByUser,
  listRecentSessionExecutionsByUser,
  listTemplatePackagesByUser,
  listUpcomingPlannedSessionsByUser,
} from "@/server/repositories";
import { getTodayBootstrapUseCase } from "@/server/use-cases/today/get-today-bootstrap.use-case";
import { buildTrainingCycleSummary } from "@/server/use-cases/training/training-cycle-summary";
import { UuidLikeSchema } from "@/server/use-cases/shared/schemas";

const GetTrainingCalendarBootstrapInputSchema = z.object({
  userId: UuidLikeSchema,
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export type GetTrainingCalendarBootstrapInput = z.input<
  typeof GetTrainingCalendarBootstrapInputSchema
>;

function getMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(month?: string) {
  if (!month) {
    return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  }
  const [rawYear, rawMonth] = month.split("-");
  const year = Number(rawYear);
  const monthIndex = Number(rawMonth) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  }
  return new Date(Date.UTC(year, monthIndex, 1));
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getDayDiffFromAnchor(anchor: Date, target: Date) {
  const diffMs = startOfUtcDay(target).getTime() - startOfUtcDay(anchor).getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

type TemplatePackageSlot = {
  slot_index: number;
  type: "train" | "rest";
  day_code: string | null;
};

function collectRestDateKeysFromSlots(
  firstTrainDate: Date,
  slots: TemplatePackageSlot[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  if (slots.length === 0) {
    return [] as string[];
  }
  const ordered = [...slots].sort((a, b) => a.slot_index - b.slot_index);
  const firstTrainSlotIndex = ordered.findIndex((slot) => slot.type === "train");
  if (firstTrainSlotIndex < 0) {
    return [] as string[];
  }

  const from = startOfUtcDay(
    firstTrainDate > rangeStart ? firstTrainDate : rangeStart,
  );
  const to = startOfUtcDay(rangeEnd);
  const restDates: string[] = [];

  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    const offset = getDayDiffFromAnchor(firstTrainDate, cursor);
    if (offset < 0) continue;
    const slot = ordered[(firstTrainSlotIndex + offset) % ordered.length];
    if (slot.type === "rest") {
      restDates.push(toDateKey(cursor));
    }
  }

  return restDates;
}

function resolveTrainingState(todayBootstrap: Awaited<ReturnType<typeof getTodayBootstrapUseCase>>) {
  if (todayBootstrap.plannedEntryActiveExecution) {
    return "in_progress" as const;
  }
  if (
    todayBootstrap.plannedEntryLatestExecution &&
    todayBootstrap.plannedEntryLatestExecution.unit_execution_count > 0
  ) {
    return "completed" as const;
  }
  return "not_started" as const;
}

function resolveTrainingAction(
  state: "not_started" | "in_progress" | "completed",
  plannedEntry: Awaited<ReturnType<typeof getTodayBootstrapUseCase>>["plannedEntry"],
  latestExecution: Awaited<ReturnType<typeof getTodayBootstrapUseCase>>["plannedEntryLatestExecution"],
) {
  if (!plannedEntry) {
    return {
      actionLabel: "去创建训练计划",
      actionHref: "/programs",
    };
  }
  if (state === "completed") {
    return {
      actionLabel: "查看训练结果",
      actionHref: latestExecution ? `/executions/${latestExecution.id}` : "/training?view=calendar",
    };
  }
  if (state === "in_progress") {
    return {
      actionLabel: "继续训练",
      actionHref: `/programs/${plannedEntry.program?.id ?? plannedEntry.plannedSession.program_id}/planned-sessions/${plannedEntry.plannedSession.id}/execute?returnTo=training&from=training`,
    };
  }
  return {
    actionLabel: "开始训练",
    actionHref: `/programs/${plannedEntry.program?.id ?? plannedEntry.plannedSession.program_id}/planned-sessions/${plannedEntry.plannedSession.id}/execute?returnTo=training&from=training`,
  };
}

function summarizeUnitNames(
  units: Array<{
    selected_exercise_name: string | null;
  }>,
) {
  const names = units
    .map((unit) => unit.selected_exercise_name?.trim())
    .filter((value): value is string => Boolean(value));
  return names.slice(0, 2).join(" · ");
}

const OBJECTIVE_SUMMARY_PLACEHOLDERS = new Set([
  "默认训练日",
  "默认训练日，请按需添加动作",
  "默认训练日，请按需添加动作。",
]);

function normalizeObjectiveSummary(value: string | null | undefined) {
  const summary = value?.trim();
  if (!summary) return null;
  if (OBJECTIVE_SUMMARY_PLACEHOLDERS.has(summary)) {
    return null;
  }
  return summary;
}

function resolveDisplayText(args: {
  templateName?: string | null;
  objectiveSummary?: string | null;
  unitSummary?: string | null;
  programName?: string | null;
  fallbackTitle: string;
}) {
  const templateName = args.templateName?.trim() || null;
  const objectiveSummary = normalizeObjectiveSummary(args.objectiveSummary);
  const unitSummary = args.unitSummary?.trim() || null;
  const programName = args.programName?.trim() || null;

  if (templateName) {
    return {
      title: templateName,
      subtitle:
        unitSummary && unitSummary !== templateName
          ? unitSummary
          : objectiveSummary && objectiveSummary !== templateName
            ? objectiveSummary
            : programName && programName !== templateName
              ? programName
              : null,
    };
  }

  if (objectiveSummary) {
    return {
      title: objectiveSummary,
      subtitle:
        unitSummary && unitSummary !== objectiveSummary
          ? unitSummary
          : programName && programName !== objectiveSummary
            ? programName
            : null,
    };
  }

  if (unitSummary) {
    return {
      title: unitSummary,
      subtitle: programName && programName !== unitSummary ? programName : null,
    };
  }

  if (programName) {
    return {
      title: programName,
      subtitle: null,
    };
  }

  return {
    title: args.fallbackTitle,
    subtitle: null,
  };
}

export async function getTrainingCalendarBootstrapUseCase(
  rawInput: GetTrainingCalendarBootstrapInput,
) {
  const input = GetTrainingCalendarBootstrapInputSchema.parse(rawInput);
  const monthStart = parseMonth(input.month);
  const monthEnd = endOfMonth(monthStart);
  const rangeStart = addDays(monthStart, -14);
  const rangeEnd = addDays(monthEnd, 14);
  const todayDate = new Date();
  const todayDateKey = toDateKey(todayDate);

  const [todayBootstrap, upcomingSessions, overdueCount, recentExecutions] = await Promise.all([
    getTodayBootstrapUseCase({ userId: input.userId }),
    listUpcomingPlannedSessionsByUser(input.userId, rangeStart, rangeEnd, 200),
    countOverdueUnresolvedPlannedSessionsByUser(input.userId, todayDate),
    listRecentSessionExecutionsByUser(input.userId, 160, "summary"),
  ]);

  const trainingState = resolveTrainingState(todayBootstrap);
  const action = resolveTrainingAction(
    trainingState,
    todayBootstrap.plannedEntry,
    todayBootstrap.plannedEntryLatestExecution,
  );
  const rangeStartKey = toDateKey(rangeStart);
  const rangeEndKey = toDateKey(rangeEnd);

  const executionEntries = recentExecutions
    .filter((execution) => execution.planned_session?.session_date)
    .map((execution) => {
      const dateKey = execution.planned_session
        ? toDateKey(execution.planned_session.session_date)
        : null;
      const unitSummary = execution.planned_session
        ? summarizeUnitNames(execution.planned_session.planned_units)
        : null;
      const fallbackTitle = execution.planned_session?.sequence_index
        ? `训练 #${execution.planned_session.sequence_index}`
        : "训练记录";
      const display = resolveDisplayText({
        templateName: execution.planned_session?.session_template?.name,
        objectiveSummary: execution.planned_session?.objective_summary,
        unitSummary,
        programName: execution.program?.name,
        fallbackTitle,
      });
      return {
        id: execution.id,
        dateKey,
        completionStatus: execution.completion_status,
        durationMin: execution.actual_duration_min,
        plannedSessionId: execution.planned_session?.id ?? null,
        sequenceIndex: execution.planned_session?.sequence_index ?? null,
        title: display.title,
        subtitle: display.subtitle,
        program: execution.program
          ? {
              id: execution.program.id,
              name: execution.program.name,
            }
          : null,
      };
    })
    .filter(
      (execution): execution is NonNullable<typeof execution> & { dateKey: string } =>
        execution.dateKey !== null &&
        execution.dateKey >= rangeStartKey &&
        execution.dateKey <= rangeEndKey,
    );

  const candidateProgramIds = new Set<string>();
  for (const session of upcomingSessions) {
    if (session.program?.id) {
      candidateProgramIds.add(session.program.id);
    }
  }
  for (const execution of recentExecutions) {
    if (execution.program?.id) {
      candidateProgramIds.add(execution.program.id);
    }
  }
  if (todayBootstrap.plannedEntry?.plannedSession.program_id) {
    candidateProgramIds.add(todayBootstrap.plannedEntry.plannedSession.program_id);
  }

  const allPackages = await listTemplatePackagesByUser(input.userId);
  const linkedPackages = allPackages.filter(
    (item) =>
      item.linked_program_id !== null &&
      candidateProgramIds.has(item.linked_program_id) &&
      item.microcycle_slots.length > 0,
  );
  const firstSessionByProgram = await Promise.all(
    linkedPackages.map(async (item) => ({
      programId: item.linked_program_id as string,
      firstSession: await getProgramFirstPlannedSessionByUser(
        item.linked_program_id as string,
        input.userId,
      ),
      slots: item.microcycle_slots,
    })),
  );

  const restDateKeySet = new Set<string>();
  for (const entry of firstSessionByProgram) {
    if (!entry.firstSession) continue;
    for (const dateKey of collectRestDateKeysFromSlots(
      entry.firstSession.session_date,
      entry.slots,
      rangeStart,
      rangeEnd,
    )) {
      restDateKeySet.add(dateKey);
    }
  }

  for (const session of upcomingSessions) {
    restDateKeySet.delete(toDateKey(session.session_date));
  }
  for (const execution of executionEntries) {
    restDateKeySet.delete(execution.dateKey);
  }

  const cycleSummary = await buildTrainingCycleSummary({
    userId: input.userId,
    packages: allPackages,
    relevantProgramIds: Array.from(candidateProgramIds),
    upcomingSessions: upcomingSessions.map((session) => ({
      dateKey: toDateKey(session.session_date),
      sequenceIndex: session.sequence_index,
      programId: session.program?.id ?? null,
    })),
    recentExecutions: executionEntries.map((execution) => ({
      dateKey: execution.dateKey,
      sequenceIndex: execution.sequenceIndex,
      programId: execution.program?.id ?? null,
    })),
    todaySequenceIndex: todayBootstrap.plannedEntry?.plannedSession.sequence_index ?? null,
    todayProgramId: todayBootstrap.plannedEntry?.plannedSession.program_id ?? null,
    rangeStartKey,
    rangeEndKey,
  });

  return {
    month: getMonthKey(monthStart),
    monthStart: toDateKey(monthStart),
    monthEnd: toDateKey(monthEnd),
    rangeStart: toDateKey(rangeStart),
    rangeEnd: toDateKey(rangeEnd),
    todayDateKey,
    todayTraining: {
      state: trainingState,
      actionLabel: action.actionLabel,
      actionHref: action.actionHref,
      plannedEntry: todayBootstrap.plannedEntry,
      activeExecution: todayBootstrap.plannedEntryActiveExecution,
      latestExecution: todayBootstrap.plannedEntryLatestExecution,
    },
    scheduleSummary: {
      overdueCount,
      upcomingCountInRange: upcomingSessions.length,
    },
    upcomingSessions: upcomingSessions.map((session) => {
      const unitSummary = summarizeUnitNames(session.planned_units) || null;
      const display = resolveDisplayText({
        templateName: session.session_template?.name,
        objectiveSummary: session.objective_summary,
        unitSummary,
        programName: session.program?.name,
        fallbackTitle: `训练 #${session.sequence_index}`,
      });
      return {
        id: session.id,
        dateKey: toDateKey(session.session_date),
        sequenceIndex: session.sequence_index,
        status: session.status,
        title: display.title,
        unitSummary: display.subtitle,
        program: session.program
          ? {
              id: session.program.id,
              name: session.program.name,
            }
          : null,
      };
    }),
    recentExecutions: executionEntries,
    restDateKeys: Array.from(restDateKeySet).sort((a, b) => a.localeCompare(b)),
    moduleEntrypoints: {
      progressionMatrixHref: "/training?view=progression&tab=matrix",
      templateLibraryHref: "/template-library",
      exerciseLibraryHref: "/exercise-library",
      programsHref: "/programs",
    },
    cycleSummary,
    generatedAt: new Date().toISOString(),
  };
}
