import {
  getActiveMesocycleByUser,
  listRecentExecutionSetSignalsByUser,
  listRecentSessionExecutionsByUser,
  listMesocyclesByUser,
  listObservationsByMetric,
  TemplatePackageListItem,
} from "@/server/repositories";

type CycleCandidatePackage = {
  id: string;
  name: string;
  linkedProgramId: string | null;
  trainSlotCount: number;
  microcycleSlotCount: number;
  slotPreview: string;
};

type CycleMarker = {
  dateKey: string;
  label: string;
  tone: "mesocycle" | "microcycle" | "deload";
};

type CycleSummary = {
  activeMesocycle: null | {
    id: string;
    name: string;
    startedAt: string;
    primaryPackageId: string | null;
    primaryPackageName: string | null;
    programId: string | null;
    startSequenceIndex: number | null;
    weeksElapsed: number;
    activeDeload: boolean;
    deloadCount: number;
    currentRunIndex: number | null;
    currentRunDay: number | null;
    currentRunSize: number | null;
    completedRunCount: number;
    suggestedAction: "none" | "deload" | "end";
    suggestionLabel: string | null;
    suggestionReason: string | null;
    latestFatigueScore: number | null;
    rollingFatigueAverage: number | null;
    fatigueState: "stable" | "watch" | "high";
    stressSignals: string[];
  };
  candidatePackages: CycleCandidatePackage[];
  archivedCount: number;
  markers: CycleMarker[];
};

type SessionLike = {
  dateKey: string;
  sequenceIndex: number | null;
  programId: string | null;
};

type BuildTrainingCycleSummaryArgs = {
  userId: string;
  packages: TemplatePackageListItem[];
  relevantProgramIds: string[];
  upcomingSessions: SessionLike[];
  recentExecutions: SessionLike[];
  todaySequenceIndex: number | null;
  todayProgramId: string | null;
  rangeStartKey: string;
  rangeEndKey: string;
  now?: Date;
};

function toDateKey(value: string) {
  return value.slice(0, 10);
}

function daysBetween(startIso: string, end: Date) {
  const start = new Date(startIso);
  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toString" in (value as object)) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function formatSignalLabel(signal: string) {
  if (signal === "subjective_fatigue_high") return "主观疲劳偏高";
  if (signal === "subjective_fatigue_rising") return "疲劳持续偏高";
  if (signal === "completion_drop") return "完成质量下降";
  if (signal === "rpe_saturated") return "RPE 持续偏高";
  if (signal === "output_drop") return "组输出下降";
  return signal;
}

export async function buildTrainingCycleSummary(
  args: BuildTrainingCycleSummaryArgs,
): Promise<CycleSummary> {
  const now = args.now ?? new Date();
  const [activeMesocycle, allMesocycles, fatigueRows, recentExecutionRows, setSignals] = await Promise.all([
    getActiveMesocycleByUser(args.userId),
    listMesocyclesByUser(args.userId),
    listObservationsByMetric(args.userId, "fatigue_score", 7),
    listRecentSessionExecutionsByUser(args.userId, 10, "summary"),
    listRecentExecutionSetSignalsByUser(args.userId, 160),
  ]);

  const candidatePackages = args.packages
    .filter(
      (item) =>
        item.enabled &&
        item.microcycle_slots.length > 0,
    )
    .map((item) => {
      const trainSlotCount =
        item.microcycle_slots.filter((slot) => slot.type === "train").length || item.day_count;
      return {
        id: item.id,
        name: item.name,
        linkedProgramId: item.linked_program_id,
        trainSlotCount,
        microcycleSlotCount: item.microcycle_slots.length,
        slotPreview:
          item.microcycle_slots
            .map((slot) => (slot.type === "rest" ? "休" : slot.day_code ?? "训"))
            .join(" / ") || `${trainSlotCount} 练`,
        _isRelevant: item.linked_program_id !== null && args.relevantProgramIds.includes(item.linked_program_id),
      };
    })
    .sort((a, b) => {
      if (a._isRelevant !== b._isRelevant) {
        return a._isRelevant ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    })
    .map(({ _isRelevant, ...item }) => item);

  if (!activeMesocycle) {
    return {
      activeMesocycle: null,
      candidatePackages,
      archivedCount: allMesocycles.filter((item) => item.status === "closed").length,
      markers: [],
    };
  }

  const linkedPackage =
    candidatePackages.find((item) => item.id === activeMesocycle.primary_package_id) ??
    null;
  const trainSlotCount = linkedPackage?.trainSlotCount ?? null;
  const startSequenceIndex = activeMesocycle.start_sequence_index;
  const relevantExecutions = args.recentExecutions
    .filter(
      (item) =>
        item.programId === activeMesocycle.program_id &&
        item.sequenceIndex !== null &&
        (startSequenceIndex === null || item.sequenceIndex >= startSequenceIndex),
    )
    .sort((a, b) => (b.sequenceIndex ?? 0) - (a.sequenceIndex ?? 0));
  const relevantUpcoming = args.upcomingSessions
    .filter(
      (item) =>
        item.programId === activeMesocycle.program_id &&
        item.sequenceIndex !== null &&
        (startSequenceIndex === null || item.sequenceIndex >= startSequenceIndex),
    )
    .sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0));

  const latestExecutedSequence = relevantExecutions[0]?.sequenceIndex ?? null;
  const currentSequenceIndex =
    args.todayProgramId === activeMesocycle.program_id && args.todaySequenceIndex !== null
      ? args.todaySequenceIndex
      : relevantUpcoming[0]?.sequenceIndex ?? latestExecutedSequence;

  let currentRunIndex: number | null = null;
  let currentRunDay: number | null = null;
  let completedRunCount = 0;

  if (trainSlotCount && startSequenceIndex && currentSequenceIndex && currentSequenceIndex >= startSequenceIndex) {
    const delta = currentSequenceIndex - startSequenceIndex;
    currentRunIndex = Math.floor(delta / trainSlotCount) + 1;
    currentRunDay = (delta % trainSlotCount) + 1;
  }

  if (trainSlotCount && startSequenceIndex && latestExecutedSequence && latestExecutedSequence >= startSequenceIndex) {
    completedRunCount = Math.floor((latestExecutedSequence - startSequenceIndex + 1) / trainSlotCount);
  }

  const latestFatigueScore = toNumber(fatigueRows[0]?.value_numeric);
  const fatigueValues = fatigueRows
    .slice(0, 3)
    .map((row) => toNumber(row.value_numeric))
    .filter((value): value is number => value !== null);
  const rollingFatigueAverage =
    fatigueValues.length > 0
      ? Number((fatigueValues.reduce((sum, value) => sum + value, 0) / fatigueValues.length).toFixed(2))
      : null;

  const activeDeload = activeMesocycle.deload_events.some((item) => item.status === "active");
  const weeksElapsed = Math.max(1, Math.ceil((daysBetween(activeMesocycle.started_at, now) + 1) / 7));

  const recentProgramExecutions = recentExecutionRows
    .filter((item) =>
      activeMesocycle.program_id
        ? item.program?.id === activeMesocycle.program_id
        : true,
    )
    .slice(0, 6);
  const completionIssueRate =
    recentProgramExecutions.length > 0
      ? Number(
          (
            recentProgramExecutions.filter(
              (item) =>
                item.completion_status === "partial" ||
                item.completion_status === "skipped",
            ).length / recentProgramExecutions.length
          ).toFixed(2),
        )
      : null;

  const recentSignalRows = setSignals.slice(0, 48);
  const completedSignalRows = recentSignalRows.filter((item) => item.status === "completed");
  const rpeValues = completedSignalRows
    .map((item) => toNumber(item.actual_rpe))
    .filter((value): value is number => value !== null);
  const highRpeRate =
    rpeValues.length > 0
      ? Number((rpeValues.filter((value) => value >= 9).length / rpeValues.length).toFixed(2))
      : null;
  const outputComparableRows = completedSignalRows.filter(
    (item) => item.planned_reps !== null && item.actual_reps !== null,
  );
  const outputDropRate =
    outputComparableRows.length > 0
      ? Number(
          (
            outputComparableRows.filter((item) => (item.actual_reps ?? 0) < (item.planned_reps ?? 0))
              .length / outputComparableRows.length
          ).toFixed(2),
        )
      : null;

  const stressSignals: string[] = [];
  if ((latestFatigueScore ?? 0) >= 8) {
    stressSignals.push("subjective_fatigue_high");
  } else if ((rollingFatigueAverage ?? 0) >= 7) {
    stressSignals.push("subjective_fatigue_rising");
  }
  if ((completionIssueRate ?? 0) >= 0.34 && recentProgramExecutions.length >= 3) {
    stressSignals.push("completion_drop");
  }
  if ((highRpeRate ?? 0) >= 0.4 && rpeValues.length >= 6) {
    stressSignals.push("rpe_saturated");
  }
  if ((outputDropRate ?? 0) >= 0.3 && outputComparableRows.length >= 6) {
    stressSignals.push("output_drop");
  }

  const fatigueState: "stable" | "watch" | "high" =
    stressSignals.length >= 2 || (latestFatigueScore ?? 0) >= 8
      ? "high"
      : stressSignals.length === 1 || (rollingFatigueAverage ?? 0) >= 6
        ? "watch"
        : "stable";

  let suggestedAction: "none" | "deload" | "end" = "none";
  let suggestionLabel: string | null = null;
  let suggestionReason: string | null = null;

  if (
    !activeDeload &&
    (
      fatigueState === "high" ||
      ((latestFatigueScore ?? 0) >= 7 && (highRpeRate ?? 0) >= 0.4) ||
      ((completionIssueRate ?? 0) >= 0.34 && (highRpeRate ?? 0) >= 0.34)
    )
  ) {
    suggestedAction = "deload";
    suggestionLabel = "建议减载";
    const signalLabels = stressSignals.slice(0, 2).map(formatSignalLabel);
    suggestionReason =
      signalLabels.length > 0
        ? `近期 ${signalLabels.join("、")}，建议短期控量恢复。`
        : "近期恢复压力偏高，建议短期控量恢复。";
  } else if (
    weeksElapsed >= 8 ||
    (activeDeload && weeksElapsed >= 5) ||
    (weeksElapsed >= 6 && (activeMesocycle.deload_events.length > 0 || fatigueState !== "stable"))
  ) {
    suggestedAction = "end";
    suggestionLabel = "建议收周期";
    suggestionReason =
      fatigueState !== "stable"
        ? `当前中周期已持续 ${weeksElapsed} 周，且恢复压力仍在，建议收尾并开启下一阶段。`
        : `当前中周期已持续 ${weeksElapsed} 周，可考虑收尾并开启下一阶段。`;
  }

  const markers: CycleMarker[] = [];
  const mesocycleStartDateKey = toDateKey(activeMesocycle.started_at);
  if (mesocycleStartDateKey >= args.rangeStartKey && mesocycleStartDateKey <= args.rangeEndKey) {
    markers.push({
      dateKey: mesocycleStartDateKey,
      label: "中",
      tone: "mesocycle",
    });
  }

  for (const event of activeMesocycle.deload_events) {
    const dateKey = toDateKey(event.started_at);
    if (dateKey >= args.rangeStartKey && dateKey <= args.rangeEndKey) {
      markers.push({
        dateKey,
        label: "减",
        tone: "deload",
      });
    }
  }

  if (trainSlotCount && startSequenceIndex) {
    const seen = new Set<string>();
    const sequenceSources = [...relevantExecutions, ...relevantUpcoming]
      .filter((item) => item.sequenceIndex !== null)
      .sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0));

    for (const item of sequenceSources) {
      if (!item.sequenceIndex || item.sequenceIndex < startSequenceIndex) continue;
      const offset = item.sequenceIndex - startSequenceIndex;
      if (offset % trainSlotCount !== 0) continue;
      if (item.dateKey < args.rangeStartKey || item.dateKey > args.rangeEndKey) continue;
      if (seen.has(item.dateKey)) continue;
      seen.add(item.dateKey);
      markers.push({
        dateKey: item.dateKey,
        label: `小${Math.floor(offset / trainSlotCount) + 1}`,
        tone: "microcycle",
      });
    }
  }

  markers.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    activeMesocycle: {
      id: activeMesocycle.id,
      name: activeMesocycle.name,
      startedAt: activeMesocycle.started_at,
      primaryPackageId: activeMesocycle.primary_package_id,
      primaryPackageName:
        linkedPackage?.name ?? activeMesocycle.primary_package_name ?? null,
      programId: activeMesocycle.program_id,
      startSequenceIndex: activeMesocycle.start_sequence_index,
      weeksElapsed,
      activeDeload,
      deloadCount: activeMesocycle.deload_events.length,
      currentRunIndex,
      currentRunDay,
      currentRunSize: trainSlotCount,
      completedRunCount,
      suggestedAction,
      suggestionLabel,
      suggestionReason,
      latestFatigueScore,
      rollingFatigueAverage,
      fatigueState,
      stressSignals: stressSignals.map(formatSignalLabel),
    },
    candidatePackages,
    archivedCount: allMesocycles.filter((item) => item.status === "closed").length,
    markers,
  };
}

export type TrainingCycleSummary = Awaited<ReturnType<typeof buildTrainingCycleSummary>>;
