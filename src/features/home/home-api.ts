"use client";

import { fetchJson } from "@/features/shared/http-client";

export type HomePlannedSessionEntry = {
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
  };
} | null;

export type HomeDailyMetricKey = "bodyweight" | "waist_circumference" | "resting_heart_rate";

export type HomeTodayTrainingState = "not_started" | "in_progress" | "completed";

export type HomeDashboardBootstrapResponse = {
  appDateKey: string;
  todayTraining: {
    state: HomeTodayTrainingState;
    actionLabel: string;
    actionHref: string;
    plannedEntry: HomePlannedSessionEntry;
    activeExecution: {
      id: string;
      completion_status: string;
      performed_at: string;
      unit_execution_count: number;
    } | null;
    latestExecution: {
      id: string;
      completion_status: string;
      performed_at: string;
      unit_execution_count: number;
    } | null;
  };
  dailyVitals: {
    metrics: Array<{
      metricKey: HomeDailyMetricKey;
      unit: string;
      todayValue: number | null;
      previousValue: number | null;
      deltaFromPrevious: number | null;
      observedAt: string | null;
      missingToday: boolean;
    }>;
    completion: {
      filledCount: number;
      totalCount: number;
      allFilled: boolean;
    };
  };
  scheduleSummary: {
    overdueCount: number;
    upcomingCount7d: number;
    nextSession: HomePlannedSessionEntry;
  };
  recentMainLiftPr: Array<{
    exerciseName: string;
    e1rm: number;
    reps: number;
    weight: number;
    performedAt: string;
  }>;
  bodyweightTrend: Array<{
    date: string;
    value: number;
    unit: string;
  }>;
  generatedAt: string;
};

export type DailyCheckinPayload = {
  userId: string;
  date: string;
  bodyweight?: number;
  bodyweightUnit?: "kg" | "lbs";
  waistCircumference?: number;
  restingHeartRate?: number;
};

export async function getHomeDashboardBootstrap(userId: string) {
  return fetchJson<HomeDashboardBootstrapResponse>(
    `/api/home/dashboard-bootstrap?userId=${encodeURIComponent(userId)}`,
  );
}

export async function submitDailyCheckin(payload: DailyCheckinPayload) {
  return fetchJson<{ createdCount: number; observedAt: string }>("/api/observations/daily-checkin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type OverduePlannedSessionItem = {
  id: string;
  program_id: string;
  sequence_index: number;
  session_date: string;
  status: string;
  planned_duration_min: number | null;
  objective_summary: string | null;
  notes: string | null;
  program: {
    id: string;
    name: string;
  } | null;
  planned_units: Array<{
    id: string;
    sequence_no: number;
    selected_exercise_name: string | null;
    status: string;
    required: boolean;
  }>;
  is_actionable: boolean;
  waiting_for_session_id: string | null;
  waiting_reason: string | null;
};

export type ResolveOverdueTodaySessionPayload =
  | {
      userId: string;
      action: "today_makeup";
    }
  | {
      userId: string;
      action: "overdue_ignore";
    }
  | {
      userId: string;
      action: "reschedule_cascade";
      sessionDate: string;
      shiftFollowing: boolean;
      previewOnly?: boolean;
    };

export async function listTodayOverduePlannedSessions(userId: string, limit = 5) {
  return fetchJson<OverduePlannedSessionItem[]>(
    `/api/planned-sessions/overdue?userId=${encodeURIComponent(userId)}&limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function resolveOverdueTodaySession(
  plannedSessionId: string,
  payload: ResolveOverdueTodaySessionPayload,
) {
  const body =
    payload.action === "reschedule_cascade"
      ? {
          userId: payload.userId,
          action: payload.action,
          sessionDate: payload.sessionDate,
          shiftFollowing: payload.shiftFollowing,
          previewOnly: payload.previewOnly ?? false,
        }
      : {
          userId: payload.userId,
          action: payload.action,
        };

  return fetchJson<{
    action: "today_makeup" | "overdue_ignore" | "reschedule_cascade";
    previewOnly?: boolean;
    shiftedCount: number;
    nextStatus: string;
    plannedSessionId: string;
    targetDate?: string | Date;
    preview?: Array<{
      sequenceIndex: number;
      fromDate: string;
      toDate: string;
    }>;
  }>(
    `/api/planned-sessions/${encodeURIComponent(plannedSessionId)}/overdue-resolution`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}
