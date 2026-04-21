"use client";

import { fetchJson } from "@/features/shared/http-client";
import { ActionEntryAnchorSummary } from "@/lib/action-entry-anchor";
import { TrainingUnitSet } from "@/lib/training-set-standards";

export type TrainingCalendarBootstrapResponse = {
  month: string;
  monthStart: string;
  monthEnd: string;
  rangeStart: string;
  rangeEnd: string;
  todayDateKey: string;
  todayTraining: {
    state: "not_started" | "in_progress" | "completed";
    actionLabel: string;
    actionHref: string;
    plannedEntry: {
      mode: "next" | "recent";
      plannedSession: {
        id: string;
        program_id: string;
        sequence_index: number;
        session_date: string;
        status: string;
      };
      program: {
        id: string;
        name: string;
      } | null;
    } | null;
    activeExecution: {
      id: string;
      completion_status: string;
      performed_at: string;
      unit_execution_count: number;
      is_active: boolean;
    } | null;
    latestExecution: {
      id: string;
      completion_status: string;
      performed_at: string;
      unit_execution_count: number;
      is_active: boolean;
    } | null;
  };
  scheduleSummary: {
    overdueCount: number;
    upcomingCountInRange: number;
  };
  upcomingSessions: Array<{
    id: string;
    dateKey: string;
    sequenceIndex: number;
    status: string;
    title: string;
    unitSummary?: string | null;
    program: {
      id: string;
      name: string;
    } | null;
  }>;
  recentExecutions: Array<{
    id: string;
    dateKey: string;
    completionStatus: string;
    durationMin: number | null;
    plannedSessionId: string | null;
    sequenceIndex: number | null;
    title: string;
    subtitle: string | null;
    program: {
      id: string;
      name: string;
    } | null;
  }>;
  restDateKeys: string[];
  moduleEntrypoints: {
    progressionMatrixHref: string;
    templateLibraryHref: string;
    exerciseLibraryHref: string;
    programsHref: string;
  };
  cycleSummary: {
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
    candidatePackages: Array<{
      id: string;
      name: string;
      linkedProgramId: string | null;
      trainSlotCount: number;
      microcycleSlotCount: number;
      slotPreview: string;
    }>;
    archivedCount: number;
    markers: Array<{
      dateKey: string;
      label: string;
      tone: "mesocycle" | "microcycle" | "deload";
    }>;
  };
  generatedAt: string;
};

export type TrainingProgressBootstrapResponse = {
  overview: {
    completionRate: number;
    planHitRate: number;
    skipRate: number;
    averageRpe: number | null;
    recentMainLiftPr: Array<{
      exerciseName: string;
      e1rm: number;
      weight: number;
      reps: number;
      performedAt: string;
    }>;
  };
  trend: {
    bodyweight: Array<{
      dateKey: string;
      value: number;
      unit: string;
      trainingQuality: number | null;
    }>;
    waistCircumference: Array<{
      dateKey: string;
      value: number;
      unit: string;
      trainingQuality: number | null;
    }>;
    restingHeartRate: Array<{
      dateKey: string;
      value: number;
      unit: string;
      trainingQuality: number | null;
    }>;
    trainingQuality: Array<{
      dateKey: string;
      score: number;
    }>;
  };
  trackTrends: Array<{
    key: string;
    label: string;
    movementPatterns: string[];
    primaryMuscles: string[];
    direction: "up" | "flat" | "mixed";
    directionLabel: string;
    points: Array<{
      sequenceIndex: number;
      dateKey: string;
      outcome: string | null;
      planScore: number;
      outcomeScore: number;
      coreWeight: number | null;
      coreReps: number | null;
      averageRpe: number | null;
    }>;
    latest: {
      sequenceIndex: number;
      dateKey: string;
      outcome: string | null;
      planScore: number;
      outcomeScore: number;
      coreWeight: number | null;
      coreReps: number | null;
      averageRpe: number | null;
    } | null;
    weightDelta: number | null;
    repsDelta: number | null;
    averageRpe: number | null;
    warningFlags: Array<"stagnation" | "regression" | "recovery_risk">;
  }>;
  warnings: Array<{
    type: "stagnation" | "regression" | "recovery_risk";
    severity: "medium" | "high";
    trackKey: string;
    label: string;
    message: string;
    matrixHref: string;
  }>;
  generatedAt: string;
};

export type TrainingProgressMatrixV2Response = {
  axis: "calendar" | "exposure";
  rowAxis: "track" | "session_type";
  columns: Array<{
    id: string;
    label: string;
    subLabel: string;
    sequenceIndex?: number;
    dateKey?: string;
    exposureIndex?: number;
  }>;
  rows: Array<{
    key: string;
    label: string;
    sessionTemplateId: string | null;
    movementPatterns: string[];
    primaryMuscles: string[];
    cells: Array<{
      columnId: string;
      exposureIndex?: number;
      sessionId: string;
      sessionDate: string;
      sequenceIndex: number;
      unitId: string;
      unitSequenceNo: number;
      exerciseName: string;
      progressTrackId: string | null;
      progressionSnapshot: Record<string, unknown> | null;
      matrixCellPayload: Record<string, unknown>;
    }>;
  }>;
  filters: {
    sessionTypeOptions: Array<{ id: string; label: string; count: number }>;
    movementPatternOptions: Array<{ value: string; count: number }>;
    primaryMuscleOptions: Array<{ value: string; count: number }>;
  };
  generatedAt: string;
};

export async function getTrainingCalendarBootstrap(userId: string, month?: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  if (month) {
    searchParams.set("month", month);
  }

  return fetchJson<TrainingCalendarBootstrapResponse>(
    `/api/training/calendar-bootstrap?${searchParams.toString()}`,
  );
}

export async function createTrainingMesocycle(payload: {
  userId: string;
  name: string;
  primaryPackageId: string;
  programId?: string;
  startSequenceIndex?: number | null;
  notes?: string;
}) {
  return fetchJson<{ id: string }>("/api/training/mesocycle", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTrainingMesocycle(
  mesocycleId: string,
  payload: {
    userId: string;
    action: "start_deload" | "end_deload" | "end_cycle";
    reason?:
      | "recovery_risk"
      | "subjective_fatigue"
      | "planned"
      | "manual"
      | "other"
      | "manual_complete"
      | "fatigue_management"
      | "goal_switch"
      | "injury_or_constraint"
      | "schedule_change";
    note?: string;
  },
) {
  return fetchJson<{ count: number }>(`/api/training/mesocycle/${encodeURIComponent(mesocycleId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getTrainingProgressBootstrap(userId: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  return fetchJson<TrainingProgressBootstrapResponse>(
    `/api/training/progress-bootstrap?${searchParams.toString()}`,
  );
}

export type GetTrainingProgressMatrixV2Options = {
  window?: 7 | 10 | 14;
  includeRecent?: boolean;
  recentCount?: number;
  axis?: "calendar" | "exposure";
  rowAxis?: "track" | "session_type";
  sessionType?: string;
  movementPattern?: string;
  primaryMuscle?: string;
  onlyAbnormal?: boolean;
};

export type TemplatePackageSplitType =
  | "single_day"
  | "two_way"
  | "three_way"
  | "four_way"
  | "irregular"
  | "custom";

export type TemplatePackageUnitOverride = {
  unitSequenceNo: number;
  unitRole?: string | null;
  progressionFamily?: string | null;
  progressionPolicyType?: string | null;
  progressionPolicyConfig?: Record<string, unknown>;
  adjustmentPolicyType?: string | null;
  adjustmentPolicyConfig?: Record<string, unknown>;
  successCriteria?: Record<string, unknown>;
  progressTrackKey?: string | null;
};

export type TemplatePackageDay = {
  id: string;
  dayCode: string;
  sequenceInMicrocycle: number;
  templateLibraryItemId: string;
  label: string | null;
  notes: string | null;
  progressionOverrides: TemplatePackageUnitOverride[];
};

export type TemplatePackageSlot = {
  slotIndex: number;
  type: "train" | "rest";
  dayCode: string | null;
  label: string | null;
};

export type TemplatePackageListItem = {
  id: string;
  userId: string;
  name: string;
  splitType: TemplatePackageSplitType;
  enabled: boolean;
  notes: string | null;
  linkedProgramId: string | null;
  lastUsedAt: string | null;
  dayCount: number;
  microcycleSlots: TemplatePackageSlot[];
  microcycleSummary?: {
    trainCount: number;
    restCount: number;
    slotPreview: string;
    weeklyFrequencyEstimate: number;
  };
  dayPreviews?: Array<{
    dayCode: string;
    label: string;
    templateLibraryItemId: string;
    templateName: string;
    unitCount: number;
    topExercises: string[];
  }>;
  createdAt: string;
  updatedAt: string;
};

export type TemplatePackageDetail = Omit<TemplatePackageListItem, "dayCount"> & {
  days: TemplatePackageDay[];
};

export type UpsertTemplatePackagePayload = {
  userId: string;
  name: string;
  splitType: TemplatePackageSplitType;
  enabled?: boolean;
  notes?: string;
  linkedProgramId?: string | null;
  days: Array<{
    id?: string;
    dayCode: string;
    sequenceInMicrocycle: number;
    templateLibraryItemId: string;
    label?: string;
    notes?: string;
    progressionOverrides?: TemplatePackageUnitOverride[];
  }>;
  microcycleSlots?: Array<{
    slotIndex?: number;
    type: "train" | "rest";
    dayCode?: string | null;
    label?: string;
  }>;
};

export type TrainingPlanningBootstrapResponse = {
  packages: TemplatePackageListItem[];
  selectedPackage:
    | null
    | {
        id: string;
        name: string;
        splitType: TemplatePackageSplitType;
        enabled: boolean;
        notes: string | null;
        linkedProgramId: string | null;
        days: Array<{
          id: string;
          dayCode: string;
          sequenceInMicrocycle: number;
          label: string;
          templateLibraryItemId: string;
          templateLibraryItem: {
            id: string;
            name: string;
            splitType: string;
            unitCount: number;
            updatedAt: string;
          } | null;
          units: Array<{
            sequenceNo: number;
            exerciseLibraryItemId: string;
            exerciseNameSnapshot: string;
            unitRole: string;
            progressTrackKey: string;
            progressionFamily: string;
            progressionPolicyType: string;
            progressionPolicyConfig: Record<string, unknown>;
          adjustmentPolicyType: string;
          adjustmentPolicyConfig: Record<string, unknown>;
          successCriteria: Record<string, unknown>;
          required: boolean;
          recordingMode: string | null;
          recordMode: "sets_reps" | "sets_time";
          loadModel: "external" | "bodyweight_plus_external";
          anchorDraft?: ActionEntryAnchorSummary | null;
        }>;
      }>;
      microcycleSlots: TemplatePackageSlot[];
      microcycleSummary: {
        trainCount: number;
        restCount: number;
        slotPreview: string;
        weeklyFrequencyEstimate: number;
      };
    };
  defaults: {
    durationWeeksPresets: number[];
    schedulingMode: "smart_elastic" | "ordered_daily";
    replaceFutureUnexecuted: boolean;
  };
  generatedAt: string;
};

export type TrainingPlanningAiAnchorCandidate = {
  key: string;
  trigger: "never_used" | "long_gap" | "logic_changed";
  exerciseLibraryItemId: string;
  exerciseName: string;
  recordingMode: string | null;
  movementPattern: string | null;
  primaryRegions: string[];
  secondaryRegions: string[];
  category: string | null;
  actionType: string;
  targets: Array<{
    dayId: string;
    dayCode: string;
    unitSequenceNo: number;
    exerciseName: string;
  }>;
  currentLogic: {
    unitRole: string;
    progressionFamily: string;
    progressionPolicyType: string;
    progressionPolicyConfig: Record<string, unknown>;
    adjustmentPolicyType: string;
    adjustmentPolicyConfig: Record<string, unknown>;
    successCriteria: Record<string, unknown>;
    progressTrackKey: string;
    logicSignature: string;
  };
  history: {
    lastPerformedAt: string | null;
    daysSinceLastPerformed: number | null;
    totalExecutions: number;
    latestKnownLoadValue: number | null;
    latestKnownAdditionalLoadValue: number | null;
    latestKnownReps: number | null;
    latestKnownDurationSeconds: number | null;
    latestPolicyType: string | null;
    latestProgressionFamily: string | null;
  };
  storedAnchor: null | {
    setCount: number | null;
    loadValue: number | null;
    additionalLoadValue: number | null;
    assistWeight: number | null;
    reps: number | null;
    durationSeconds: number | null;
    restSeconds: number | null;
    tempo: [number, number, number, number] | null;
    setStructure: TrainingUnitSet[];
    recommendedRir: number | null;
    logicSignature: string | null;
    source: "ai_confirmed" | "manual_confirmed" | "historical_seed";
    confirmedAt: string;
  };
  templateAnchorDraft: ActionEntryAnchorSummary | null;
};

export type TrainingPlanningAiAnchorCandidatesResponse = {
  packageId: string;
  packageName: string;
  candidates: TrainingPlanningAiAnchorCandidate[];
  generatedAt: string;
};

export type TrainingPlanningAiAnchorFactor = {
  candidateKey: string;
  continuity: "consistent" | "intermittent" | "stopped" | "unknown";
  similarWork: "plenty" | "some" | "none" | "unknown";
  recentFocus: "strength" | "hypertrophy" | "conditioning" | "mixed" | "unknown";
  bodyChange: "better" | "stable" | "worse" | "unknown";
};

export type TrainingPlanningAiAnchorRecommendation = {
  candidateKey: string;
  recommendedSetCount?: number | null;
  recommendedLoadValue?: number | null;
  recommendedAdditionalLoadValue?: number | null;
  recommendedAssistWeight?: number | null;
  recommendedReps?: number | null;
  recommendedDurationSeconds?: number | null;
  recommendedRestSeconds?: number | null;
  recommendedTempo?: [number, number, number, number] | null;
  recommendedRir?: number | null;
  confidence: "low" | "medium" | "high";
  logicSummary: string;
  reasons: string[];
};

export type TrainingPlanningAiAnchorRecommendationsResponse = {
  packageId: string;
  recommendations: TrainingPlanningAiAnchorRecommendation[];
  generatedAt: string;
};

export type TrainingPlanGenerationPayload = {
  userId: string;
  packageId: string;
  startDate: string;
  durationWeeks: number;
  schedulingMode?: "smart_elastic" | "ordered_daily";
  replaceFutureUnexecuted?: boolean;
  overrideScope?: "plan_only" | "package_default";
  progressionOverrides?: Array<
    TemplatePackageUnitOverride & {
      dayId: string;
      unitSequenceNo: number;
    }
  >;
  entryAnchorOverrides?: Array<{
    dayId: string;
    unitSequenceNo: number;
    source: "template_draft" | "stored_anchor" | "ai_recommendation" | "manual";
    candidateKey?: string | null;
    trigger?: "never_used" | "long_gap" | "logic_changed" | null;
    setCount?: number | null;
    loadValue?: number | null;
    additionalLoadValue?: number | null;
    assistWeight?: number | null;
    reps?: number | null;
    durationSeconds?: number | null;
    restSeconds?: number | null;
    tempo?: [number, number, number, number] | null;
    recommendedRir?: number | null;
    confidence?: "low" | "medium" | "high" | null;
    logicSummary?: string | null;
    reasons?: string[];
    logicSignature?: string | null;
    daysSinceLastPerformed?: number | null;
  }>;
};

export type TrainingPlanGenerationResponse = {
  packageId: string;
  programId: string;
  generatedSessionCount: number;
  firstSessionDate: string | null;
  startDate: string;
  durationWeeks: number;
  schedulingMode: "smart_elastic" | "ordered_daily";
  replaceFutureUnexecuted: boolean;
  generatedAt: string;
};

export type CreateAndBindTemplateDayPayload = {
  userId: string;
  templateName: string;
  description?: string;
  notes?: string;
};

export type CreateAndBindTemplateDayResponse = {
  createdTemplate: {
    id: string;
    name: string;
  };
  templatePackage: TemplatePackageDetail;
  boundDayCode: string;
};

export async function getTrainingProgressMatrixV2(
  userId: string,
  options?: GetTrainingProgressMatrixV2Options,
) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  if (options?.window !== undefined) searchParams.set("window", String(options.window));
  if (options?.includeRecent !== undefined) searchParams.set("includeRecent", String(options.includeRecent));
  if (options?.recentCount !== undefined) searchParams.set("recentCount", String(options.recentCount));
  if (options?.axis) searchParams.set("axis", options.axis);
  if (options?.rowAxis) searchParams.set("rowAxis", options.rowAxis);
  if (options?.sessionType) searchParams.set("sessionType", options.sessionType);
  if (options?.movementPattern) searchParams.set("movementPattern", options.movementPattern);
  if (options?.primaryMuscle) searchParams.set("primaryMuscle", options.primaryMuscle);
  if (options?.onlyAbnormal !== undefined) searchParams.set("onlyAbnormal", String(options.onlyAbnormal));

  return fetchJson<TrainingProgressMatrixV2Response>(
    `/api/training/progression-matrix-v2?${searchParams.toString()}`,
  );
}

export async function listTemplatePackages(
  userId: string,
  options?: {
    query?: string;
    enabled?: "true" | "false" | "all";
  },
) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  if (options?.query?.trim()) searchParams.set("query", options.query.trim());
  if (options?.enabled) searchParams.set("enabled", options.enabled);
  return fetchJson<TemplatePackageListItem[]>(`/api/template-packages?${searchParams.toString()}`);
}

export async function getTemplatePackage(packageId: string, userId: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  return fetchJson<TemplatePackageDetail>(
    `/api/template-packages/${encodeURIComponent(packageId)}?${searchParams.toString()}`,
  );
}

export async function createTemplatePackage(payload: UpsertTemplatePackagePayload) {
  return fetchJson<TemplatePackageDetail>("/api/template-packages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTemplatePackage(
  packageId: string,
  payload: Partial<UpsertTemplatePackagePayload> & { userId: string },
) {
  return fetchJson<TemplatePackageDetail>(`/api/template-packages/${encodeURIComponent(packageId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTemplatePackage(packageId: string, userId: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  return fetchJson<{ deleted: boolean; packageId: string }>(
    `/api/template-packages/${encodeURIComponent(packageId)}?${searchParams.toString()}`,
    { method: "DELETE" },
  );
}

export async function getTrainingPlanningBootstrap(
  userId: string,
  packageId?: string,
) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  if (packageId) {
    searchParams.set("packageId", packageId);
  }
  return fetchJson<TrainingPlanningBootstrapResponse>(
    `/api/training/planning/bootstrap?${searchParams.toString()}`,
  );
}

export async function getTrainingPlanningAiAnchorCandidates(userId: string, packageId: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  searchParams.set("packageId", packageId);
  return fetchJson<TrainingPlanningAiAnchorCandidatesResponse>(
    `/api/training/planning/ai-anchor-candidates?${searchParams.toString()}`,
  );
}

export async function generateTrainingPlanningAiAnchorRecommendations(payload: {
  userId: string;
  packageId: string;
  factors: TrainingPlanningAiAnchorFactor[];
}) {
  return fetchJson<TrainingPlanningAiAnchorRecommendationsResponse>(
    "/api/training/planning/ai-anchor-recommendations",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function generateTrainingPlanFromPackage(payload: TrainingPlanGenerationPayload) {
  return fetchJson<TrainingPlanGenerationResponse>("/api/training/planning/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createAndBindTemplateDay(
  packageId: string,
  dayCode: string,
  payload: CreateAndBindTemplateDayPayload,
) {
  return fetchJson<CreateAndBindTemplateDayResponse>(
    `/api/template-packages/${encodeURIComponent(packageId)}/days/${encodeURIComponent(dayCode)}/create-and-bind`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function deletePlannedSession(plannedSessionId: string, userId: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("userId", userId);
  return fetchJson<{ deleted: boolean }>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}?${searchParams.toString()}`,
    { method: "DELETE" },
  );
}
