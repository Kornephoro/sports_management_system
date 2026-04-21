import { SchedulingPolicyType } from "@prisma/client";

import { addDaysDateOnlyUtc, normalizeDateOnlyUtc } from "@/server/use-cases/shared/date-only";

type QueueSessionForReorder = {
  id: string;
  sequence_index: number;
  session_date: Date;
  session_template: {
    scheduling_policy_type: SchedulingPolicyType;
    preferred_weekday: number | null;
  } | null;
};

type BuildQueueReschedulePlanInput = {
  queueSessions: QueueSessionForReorder[];
  targetDate: Date;
  occupiedDates: Date[];
  previousSessionDate: Date | null;
};

export type QueueReschedulePlanItem = {
  id: string;
  sequence_index: number;
  from_date: Date;
  to_date: Date;
};

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizePreferredWeekday(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value >= 0 && value <= 6) {
    return value;
  }
  if (value >= 1 && value <= 7) {
    return value % 7;
  }
  return null;
}

function matchesPolicyDay(
  schedulingPolicyType: SchedulingPolicyType | null,
  preferredWeekday: number | null,
  date: Date,
) {
  if (schedulingPolicyType !== "fixed") {
    return true;
  }

  const normalizedWeekday = normalizePreferredWeekday(preferredWeekday);
  if (normalizedWeekday === null) {
    return true;
  }

  return date.getUTCDay() === normalizedWeekday;
}

function resolveNextDateByPolicy(
  minDate: Date,
  schedulingPolicyType: SchedulingPolicyType | null,
  preferredWeekday: number | null,
  occupiedDateKeys: Set<string>,
) {
  let cursor = normalizeDateOnlyUtc(minDate);

  for (let guard = 0; guard < 3700; guard += 1) {
    const key = toDateKey(cursor);
    const isPolicyMatch = matchesPolicyDay(schedulingPolicyType, preferredWeekday, cursor);
    const isOccupied = occupiedDateKeys.has(key);

    if (isPolicyMatch && !isOccupied) {
      return cursor;
    }

    cursor = addDaysDateOnlyUtc(cursor, 1);
  }

  throw new Error("无法在合理范围内分配改期后的训练日期，请检查排程策略。");
}

export function buildQueueReschedulePlan({
  queueSessions,
  targetDate,
  occupiedDates,
  previousSessionDate,
}: BuildQueueReschedulePlanInput): QueueReschedulePlanItem[] {
  if (queueSessions.length === 0) {
    return [];
  }

  const occupiedDateKeys = new Set<string>(occupiedDates.map((date) => toDateKey(normalizeDateOnlyUtc(date))));
  const previousDateFloor = previousSessionDate
    ? addDaysDateOnlyUtc(normalizeDateOnlyUtc(previousSessionDate), 1)
    : null;

  const plan: QueueReschedulePlanItem[] = [];
  let cursor = normalizeDateOnlyUtc(targetDate);
  if (previousDateFloor && cursor < previousDateFloor) {
    cursor = previousDateFloor;
  }

  for (const session of queueSessions) {
    const scheduledDate = resolveNextDateByPolicy(
      cursor,
      session.session_template?.scheduling_policy_type ?? null,
      session.session_template?.preferred_weekday ?? null,
      occupiedDateKeys,
    );

    plan.push({
      id: session.id,
      sequence_index: session.sequence_index,
      from_date: normalizeDateOnlyUtc(session.session_date),
      to_date: scheduledDate,
    });

    occupiedDateKeys.add(toDateKey(scheduledDate));
    cursor = addDaysDateOnlyUtc(scheduledDate, 1);
  }

  return plan;
}

