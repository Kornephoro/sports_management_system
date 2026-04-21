import {
  SessionExecutionCompletionStatus,
  SessionState,
  UnitExecutionCompletionStatus,
  UnitState,
} from "@prisma/client";

export function mapExecutionCompletionToSessionState(
  status: SessionExecutionCompletionStatus,
): SessionState | null {
  if (status === "completed") {
    return "completed";
  }
  if (status === "partial" || status === "aborted" || status === "extra") {
    return "partial";
  }
  if (status === "skipped") {
    return "skipped";
  }
  return null;
}

export function mapUnitExecutionCompletionToUnitState(
  status: UnitExecutionCompletionStatus,
): UnitState {
  if (status === "completed") {
    return "completed";
  }
  if (status === "partial") {
    return "partial";
  }
  if (status === "skipped") {
    return "skipped";
  }
  if (status === "failed") {
    return "failed";
  }
  return "replaced";
}

export function derivePlannedSessionStateFromPlannedUnits(unitStates: UnitState[]): SessionState {
  if (unitStates.length === 0) {
    return "planned";
  }

  const everyCompleted = unitStates.every((status) => status === "completed");
  if (everyCompleted) {
    return "completed";
  }

  const everySkipped = unitStates.every((status) => status === "skipped");
  if (everySkipped) {
    return "skipped";
  }

  const everyPlanned = unitStates.every((status) => status === "planned");
  if (everyPlanned) {
    return "planned";
  }

  return "partial";
}

export function deriveSessionExecutionStatusFromUnitExecutions(
  completionStatuses: UnitExecutionCompletionStatus[],
): SessionExecutionCompletionStatus {
  if (completionStatuses.length === 0) {
    return "partial";
  }

  const everyCompleted = completionStatuses.every((status) => status === "completed");
  if (everyCompleted) {
    return "completed";
  }

  const everySkipped = completionStatuses.every((status) => status === "skipped");
  if (everySkipped) {
    return "skipped";
  }

  return "partial";
}
