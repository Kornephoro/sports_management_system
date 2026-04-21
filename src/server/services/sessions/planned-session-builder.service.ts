import {
  PlannedSessionGenerationReason,
  ProgressTrack,
  ProgressTrackStatus,
  Prisma,
} from "@prisma/client";
import { ProgressTrackState } from "@/lib/progression-types";
import { applyProgressionStateToTargetPayload, buildProgressionSnapshot } from "@/server/services/progression/progression-apply.service";
import { buildInitialProgressTrackState } from "@/server/services/progression/progression-config.service";
import { runProgressionPolicy } from "@/server/services/progression/progression-policy-runner.service";
import { selectRotationTrackKeys } from "@/server/services/progression/progression-selector.service";

type SessionTemplateWithUnits = {
  id: string;
  code?: string;
  block_id: string;
  expected_duration_min: number | null;
  objective_summary: string | null;
  training_unit_templates: Array<{
    id: string;
    sequence_no: number;
    name: string;
    display_name: string | null;
    optional: boolean;
    sport_type:
      | "strength"
      | "hypertrophy"
      | "running"
      | "swimming"
      | "racket"
      | "functional"
      | "mixed";
    unit_role:
      | "main"
      | "secondary"
      | "accessory"
      | "skill"
      | "conditioning"
      | "warmup"
      | "cooldown"
      | "mobility"
      | "prehab";
    progress_track_key: string;
    progression_family: "strict_load" | "threshold" | "exposure" | "performance" | "autoregulated";
    progression_policy_type: string;
    progression_policy_config: Prisma.JsonValue;
    adjustment_policy_type: "always" | "rotating_pool" | "gated" | "manual";
    adjustment_policy_config: Prisma.JsonValue;
    success_criteria: Prisma.JsonValue;
    prescription_type: string;
    prescription_payload: Prisma.JsonValue;
    movement_pattern_tags: Prisma.JsonValue;
    contraindication_tags: Prisma.JsonValue;
    fatigue_tags: Prisma.JsonValue;
  }>;
};

type ActiveConstraint = {
  id: string;
  title: string;
  domain: string;
  severity: string;
  movement_tags: Prisma.JsonValue;
  body_region_tags: Prisma.JsonValue;
  restriction_rules: Prisma.JsonValue;
};

type BuildMinimalPlannedSessionsParams = {
  programId: string;
  userId: string;
  startDate: Date;
  sessionCount: number;
  schedulingMode?: "ordered_daily" | "smart_elastic";
  startSequenceIndex: number;
  generationReason: PlannedSessionGenerationReason;
  templates: SessionTemplateWithUnits[];
  progressTracks: ProgressTrack[];
  activeConstraints: ActiveConstraint[];
  rotationQuota?: number;
  sessionTemplateCodeSequence?: string[];
  sessionDateSequence?: Date[];
};

type PlannedSessionSeed = {
  program_id: string;
  user_id: string;
  block_id?: string;
  session_template_id?: string;
  sequence_index: number;
  session_date: Date;
  generation_reason: PlannedSessionGenerationReason;
  planned_duration_min?: number;
  objective_summary?: string;
  adaptation_snapshot?: Prisma.InputJsonValue;
  planned_units: Array<{
    unit_template_id?: string;
    sequence_no: number;
    selected_exercise_name?: string;
    progress_track_id?: string;
    target_payload: Prisma.InputJsonValue;
    progression_snapshot?: Prisma.InputJsonValue;
    constraint_snapshot?: Prisma.InputJsonValue;
    required: boolean;
  }>;
};

export type ProgressTrackGenerationUpdate = {
  id: string;
  current_state: Prisma.InputJsonValue;
  progression_count_increment: number;
  last_progression_at: Date;
};

type RuntimeTrack = {
  id: string | null;
  trackKey: string;
  status: ProgressTrackStatus;
  currentState: ProgressTrackState;
  progressionCount: number;
  progressionCountIncrement: number;
  exposureCount: number;
  successCount: number;
  failureCount: number;
  lastProgressionAt: Date | null;
  lastSuccessAt: Date | null;
};

type SupersetMeta = {
  groupId: string;
  orderIndex: number;
  totalUnits: number;
  progressionBudgetPerExposure: number;
  selectionMode: "auto_rotation" | "fixed_order" | "manual";
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveSessionDate(
  startDate: Date,
  index: number,
  templateCount: number,
  schedulingMode: "ordered_daily" | "smart_elastic",
) {
  if (schedulingMode === "ordered_daily") {
    return addDays(startDate, index);
  }

  const safeTemplateCount = Math.max(1, templateCount);
  const cycleWeek = Math.floor(index / safeTemplateCount);
  const positionInWeek = index % safeTemplateCount;
  const spacedOffset = Math.floor((positionInWeek * 7) / safeTemplateCount);
  return addDays(startDate, cycleWeek * 7 + spacedOffset);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeConstraintRuleTags(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  return [
    ...normalizeStringArray(record.avoid_patterns),
    ...normalizeStringArray(record.limit_fatigue_tags),
  ];
}

function normalizeRotationQuota(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(Math.max(Math.trunc(value), 1), 5);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.max(Math.trunc(parsed), 1), 5);
    }
  }
  return null;
}

function normalizeDiversifyDimensions(value: unknown) {
  const fallback: Array<"primary_muscle" | "movement_pattern"> = [
    "primary_muscle",
    "movement_pattern",
  ];

  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(
      (item): item is "primary_muscle" | "movement_pattern" =>
        item === "primary_muscle" || item === "movement_pattern",
    );

  const unique = Array.from(new Set(normalized));
  return unique.length > 0 ? unique : fallback;
}

function resolveRotationPoolConfig(
  units: SessionTemplateWithUnits["training_unit_templates"],
  rotationQuotaOverride: number | undefined,
) {
  const override = normalizeRotationQuota(rotationQuotaOverride);
  const rotationUnits = units.filter(
    (unit) =>
      unit.unit_role === "accessory" ||
      (unit.unit_role === "secondary" &&
        (unit.adjustment_policy_type === "rotating_pool" ||
          asRecord(unit.progression_policy_config).enable_rotation === true ||
          asRecord(unit.adjustment_policy_config).enable_rotation === true)),
  );

  const templateConfigs = rotationUnits.map((unit) => asRecord(unit.adjustment_policy_config));
  const templateQuota =
    templateConfigs
      .map((config) =>
        normalizeRotationQuota(config.rotation_quota ?? config.rotationQuota ?? config.quota),
      )
      .find((value): value is number => value !== null) ?? 2;

  const templateDiversify =
    templateConfigs
      .map((config) =>
        normalizeDiversifyDimensions(
          config.diversify_dimensions ?? config.diversifyDimensions ?? config.diversity_dimensions,
        ),
      )
      .find((value) => value.length > 0) ?? ["primary_muscle", "movement_pattern"];

  return {
    rotationQuota: override ?? templateQuota,
    diversifyDimensions: templateDiversify,
  };
}

function asRecord(value: Prisma.JsonValue | Prisma.InputJsonValue | unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function cloneState(state: ProgressTrackState): ProgressTrackState {
  return {
    ...state,
    extra_state:
      state.extra_state && typeof state.extra_state === "object"
        ? { ...state.extra_state }
        : {},
  };
}

function mergeTrackState(
  baseline: ProgressTrackState,
  currentState: Prisma.JsonValue | null | undefined,
): ProgressTrackState {
  if (typeof currentState === "object" && currentState !== null && !Array.isArray(currentState)) {
    return {
      ...baseline,
      ...(currentState as Record<string, unknown>),
    } as ProgressTrackState;
  }
  return baseline;
}

function buildConstraintSnapshotForUnit(
  unit: SessionTemplateWithUnits["training_unit_templates"][number],
  activeConstraints: ActiveConstraint[],
) {
  if (activeConstraints.length === 0) {
    return undefined;
  }

  const unitTags = new Set(
    [
      unit.progress_track_key,
      ...normalizeStringArray(unit.movement_pattern_tags),
      ...normalizeStringArray(unit.contraindication_tags),
      ...normalizeStringArray(unit.fatigue_tags),
    ].map((item) => item.toLowerCase()),
  );

  const matchedConstraints = activeConstraints
    .filter((constraint) => {
      const constraintTags = [
        ...normalizeStringArray(constraint.movement_tags),
        ...normalizeStringArray(constraint.body_region_tags),
        ...normalizeConstraintRuleTags(constraint.restriction_rules),
      ].map((item) => item.toLowerCase());

      return constraintTags.some((tag) => unitTags.has(tag));
    })
    .map((constraint) => ({
      id: constraint.id,
      title: constraint.title,
      domain: constraint.domain,
      severity: constraint.severity,
    }));

  return {
    active_constraint_count: activeConstraints.length,
    affected: matchedConstraints.length > 0,
    warning: matchedConstraints.length > 0 ? "constraint_affected_unit" : null,
    matched_constraints: matchedConstraints,
  } as Prisma.InputJsonObject;
}

function buildRuntimeTrackMap(
  progressTracks: ProgressTrack[],
  templates: SessionTemplateWithUnits[],
) {
  const runtimeMap = new Map<string, RuntimeTrack>();

  for (const track of progressTracks) {
    const currentState = mergeTrackState(
      {
        current_phase: "baseline",
        current_load: null,
        current_sets: null,
        current_reps: null,
        current_duration_seconds: null,
        pending_retry: false,
        cooldown_until: null,
        last_change_reason: null,
        cycle_index: 0,
        extra_state: {},
      },
      track.current_state,
    );

    runtimeMap.set(track.track_key, {
      id: track.id,
      trackKey: track.track_key,
      status: track.status,
      currentState,
      progressionCount: track.progression_count,
      progressionCountIncrement: 0,
      exposureCount: track.exposure_count,
      successCount: track.success_count,
      failureCount: track.failure_count,
      lastProgressionAt: track.last_progression_at,
      lastSuccessAt: track.last_success_at,
    });
  }

  for (const template of templates) {
    for (const unit of template.training_unit_templates) {
      if (runtimeMap.has(unit.progress_track_key)) {
        continue;
      }

      const baselineState = buildInitialProgressTrackState({
        prescriptionType: unit.prescription_type,
        payload: asRecord(unit.prescription_payload),
      });

      runtimeMap.set(unit.progress_track_key, {
        id: null,
        trackKey: unit.progress_track_key,
        status: "active",
        currentState: baselineState,
        progressionCount: 0,
        progressionCountIncrement: 0,
        exposureCount: 0,
        successCount: 0,
        failureCount: 0,
        lastProgressionAt: null,
        lastSuccessAt: null,
      });
    }
  }

  return runtimeMap;
}

function parseSupersetMeta(value: Prisma.JsonValue) {
  const payload = asRecord(value);
  const superset = asRecord(payload.superset);
  const groupId =
    typeof superset.group_id === "string" && superset.group_id.trim().length > 0
      ? superset.group_id.trim()
      : null;
  if (!groupId) {
    return null;
  }

  const orderIndexRaw =
    typeof superset.order_index === "number"
      ? superset.order_index
      : Number(superset.order_index);
  const totalUnitsRaw =
    typeof superset.total_units === "number"
      ? superset.total_units
      : Number(superset.total_units);
  const budgetRaw =
    typeof superset.progression_budget_per_exposure === "number"
      ? superset.progression_budget_per_exposure
      : Number(superset.progression_budget_per_exposure);
  const selectionMode =
    superset.selection_mode === "fixed_order" ||
    superset.selection_mode === "manual" ||
    superset.selection_mode === "auto_rotation"
      ? superset.selection_mode
      : "auto_rotation";

  return {
    groupId,
    orderIndex:
      Number.isFinite(orderIndexRaw) && orderIndexRaw > 0 ? Math.trunc(orderIndexRaw) : 1,
    totalUnits:
      Number.isFinite(totalUnitsRaw) && totalUnitsRaw > 1 ? Math.trunc(totalUnitsRaw) : 2,
    progressionBudgetPerExposure:
      Number.isFinite(budgetRaw) && budgetRaw > 0 ? Math.trunc(budgetRaw) : 1,
    selectionMode,
  } satisfies SupersetMeta;
}

function selectSupersetBudgetTrackKeys(
  units: SessionTemplateWithUnits["training_unit_templates"],
  runtimeTrackMap: Map<string, RuntimeTrack>,
) {
  const groups = new Map<
    string,
    Array<{
      unit: SessionTemplateWithUnits["training_unit_templates"][number];
      meta: SupersetMeta;
      runtime: RuntimeTrack | undefined;
    }>
  >();

  for (const unit of units) {
    const meta = parseSupersetMeta(unit.prescription_payload);
    if (!meta) {
      continue;
    }
    if (!groups.has(meta.groupId)) {
      groups.set(meta.groupId, []);
    }
    groups.get(meta.groupId)!.push({
      unit,
      meta,
      runtime: runtimeTrackMap.get(unit.progress_track_key),
    });
  }

  const selected = new Set<string>();
  for (const members of groups.values()) {
    if (members.length === 0) {
      continue;
    }

    const budget = Math.min(
      Math.max(members[0]?.meta.progressionBudgetPerExposure ?? 1, 1),
      members.length,
    );
    const sorted = [...members].sort((left, right) => {
      if (left.meta.selectionMode === "fixed_order") {
        return left.meta.orderIndex - right.meta.orderIndex;
      }

      const leftTime = left.runtime?.lastProgressionAt?.getTime() ?? 0;
      const rightTime = right.runtime?.lastProgressionAt?.getTime() ?? 0;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      const leftCount = left.runtime?.progressionCount ?? 0;
      const rightCount = right.runtime?.progressionCount ?? 0;
      if (leftCount !== rightCount) {
        return leftCount - rightCount;
      }
      return left.meta.orderIndex - right.meta.orderIndex;
    });

    for (const member of sorted.slice(0, budget)) {
      selected.add(member.unit.progress_track_key);
    }
  }

  return selected;
}

export function buildMinimalPlannedSessions({
  programId,
  userId,
  startDate,
  sessionCount,
  schedulingMode = "ordered_daily",
  startSequenceIndex,
  generationReason,
  templates,
  progressTracks,
  activeConstraints,
  rotationQuota,
  sessionTemplateCodeSequence,
  sessionDateSequence,
}: BuildMinimalPlannedSessionsParams): {
  plannedSessionSeeds: PlannedSessionSeed[];
  progressTrackUpdates: ProgressTrackGenerationUpdate[];
} {
  const runtimeTrackMap = buildRuntimeTrackMap(progressTracks, templates);
  const now = new Date();
  const templateByCode = new Map(
    templates
      .filter((template) => typeof template.code === "string" && template.code.trim().length > 0)
      .map((template) => [template.code!.toUpperCase(), template]),
  );

  const plannedSessionSeeds = Array.from({ length: sessionCount }, (_, index) => {
    const templateCode = sessionTemplateCodeSequence?.[index]?.trim().toUpperCase();
    const template =
      (templateCode ? templateByCode.get(templateCode) : null) ??
      templates[index % templates.length];
    const sequenceIndex = startSequenceIndex + index + 1;
    const sessionDate =
      sessionDateSequence?.[index] ??
      resolveSessionDate(startDate, index, templates.length, schedulingMode);

    const rotationPoolConfig = resolveRotationPoolConfig(
      template.training_unit_templates,
      rotationQuota,
    );

    const selectedRotationTrackKeys = selectRotationTrackKeys({
      units: template.training_unit_templates.map((unit) => ({
        progressTrackKey: unit.progress_track_key,
        unitRole: unit.unit_role,
        progressionPolicyType: unit.progression_policy_type,
        progressionPolicyConfig: asRecord(unit.progression_policy_config),
        adjustmentPolicyType: unit.adjustment_policy_type,
        adjustmentPolicyConfig: asRecord(unit.adjustment_policy_config),
        movementPatterns: normalizeStringArray(unit.movement_pattern_tags),
        primaryMuscles: normalizeStringArray(unit.fatigue_tags),
      })),
      tracksByKey: new Map(
        Array.from(runtimeTrackMap.entries()).map(([trackKey, runtime]) => [
          trackKey,
          {
            status: runtime.status,
            lastProgressionAt: runtime.lastProgressionAt,
            currentState: runtime.currentState,
          },
        ]),
      ),
      now,
      rotationQuota: rotationPoolConfig.rotationQuota,
      diversifyDimensions: rotationPoolConfig.diversifyDimensions,
    });
    const selectedSupersetTrackKeys = selectSupersetBudgetTrackKeys(
      template.training_unit_templates,
      runtimeTrackMap,
    );

    return {
      program_id: programId,
      user_id: userId,
      block_id: template.block_id,
      session_template_id: template.id,
      sequence_index: sequenceIndex,
      session_date: sessionDate,
      generation_reason: generationReason,
      planned_duration_min: template.expected_duration_min ?? undefined,
      objective_summary: template.objective_summary ?? undefined,
      adaptation_snapshot: {
        planner: "minimal_v1",
        constraint_aware: activeConstraints.length > 0,
        active_constraint_count: activeConstraints.length,
        active_constraint_ids: activeConstraints.map((constraint) => constraint.id),
      },
      planned_units: template.training_unit_templates.map((unit) => {
        const runtimeTrack = runtimeTrackMap.get(unit.progress_track_key);
        const constraintSnapshot = buildConstraintSnapshotForUnit(unit, activeConstraints);
        const baselineState = buildInitialProgressTrackState({
          prescriptionType: unit.prescription_type,
          payload: asRecord(unit.prescription_payload),
        });
        const currentState = runtimeTrack
          ? mergeTrackState(baselineState, runtimeTrack.currentState as unknown as Prisma.JsonValue)
          : baselineState;

        const policyRun = runProgressionPolicy({
          unitRole: unit.unit_role,
          policyType: unit.progression_policy_type,
          policyConfig: asRecord(unit.progression_policy_config),
          successCriteria: asRecord(unit.success_criteria),
          selectedInRotationPool: selectedRotationTrackKeys.has(unit.progress_track_key),
          selectedInSupersetBudget:
            !parseSupersetMeta(unit.prescription_payload) ||
            selectedSupersetTrackKeys.has(unit.progress_track_key),
          trackStatus: runtimeTrack?.status ?? "active",
          trackCounts: {
            exposureCount: runtimeTrack?.exposureCount ?? 0,
            successCount: runtimeTrack?.successCount ?? 0,
            failureCount: runtimeTrack?.failureCount ?? 0,
            progressionCount: runtimeTrack?.progressionCount ?? 0,
            lastSuccessAt: runtimeTrack?.lastSuccessAt ?? null,
            lastProgressionAt: runtimeTrack?.lastProgressionAt ?? null,
          },
          currentState,
          baselineState,
          now,
        });

        const targetPayload = applyProgressionStateToTargetPayload({
          originalTargetPayload: unit.prescription_payload,
          afterState: policyRun.afterState,
          prescriptionType: unit.prescription_type,
        });

        const progressionSnapshot = buildProgressionSnapshot({
          beforeState: policyRun.beforeState,
          afterState: policyRun.afterState,
          changedFields: policyRun.changedFields,
          changeReason: policyRun.changeReason,
          changeType: policyRun.changeType,
          outcome: policyRun.outcome,
          policyType: unit.progression_policy_type,
          progressionFamily: unit.progression_family,
          trackKey: unit.progress_track_key,
          meta: policyRun.meta,
        });

        if (runtimeTrack && runtimeTrack.id && policyRun.changedFields.length > 0) {
          runtimeTrack.currentState = cloneState(policyRun.afterState);
          runtimeTrack.lastProgressionAt = now;
          runtimeTrack.progressionCount += 1;
          runtimeTrack.progressionCountIncrement += 1;
        }

        return {
          unit_template_id: unit.id,
          sequence_no: unit.sequence_no,
          selected_exercise_name: unit.display_name ?? unit.name,
          progress_track_id: runtimeTrack?.id ?? undefined,
          target_payload: targetPayload,
          progression_snapshot: progressionSnapshot as Prisma.InputJsonValue,
          constraint_snapshot: constraintSnapshot,
          required: !unit.optional,
        };
      }),
    };
  });

  const progressTrackUpdates: ProgressTrackGenerationUpdate[] = Array.from(runtimeTrackMap.values())
    .filter((runtime) => runtime.id && runtime.progressionCountIncrement > 0)
    .map((runtime) => ({
      id: runtime.id as string,
      current_state: runtime.currentState as Prisma.InputJsonValue,
      progression_count_increment: runtime.progressionCountIncrement,
      last_progression_at: now,
    }));

  return {
    plannedSessionSeeds,
    progressTrackUpdates,
  };
}
