export type CursorDraft = {
  plannedUnitId: string;
  setId: string;
};

export type ExecutionDraftScope = {
  userId: string;
  plannedSessionId: string;
  sessionExecutionId: string;
};

export type WorkbenchDraftPhase = "set_active" | "rest_active" | "session_done";

export type ExecutionSetDraft = {
  actualWeightInput: string;
  actualRpeInput: string;
  actualRepsInput: string;
  updatedAt: number;
};

export type RestPresentation = "card" | "bubble";

export type ExecutionRestDraft = {
  pendingNextCursor: CursorDraft | null;
  restTargetTimestamp: number;
  autoAdvanceEnabled?: boolean;
  presentation?: RestPresentation;
  sourceSetId?: string;
  restStartedAtMs?: number;
  accumulatedMs?: number;
  runningFromMs?: number | null;
  updatedAt: number;
};

export type ExecutionWorkbenchDraft = {
  phase: WorkbenchDraftPhase;
  activeCursor: CursorDraft | null;
  pendingNextCursor: CursorDraft | null;
  updatedAt: number;
};

export type ExecutionWorkbenchUiState = {
  userId: string;
  programId: string;
  plannedSessionId: string;
  sessionExecutionId: string;
  executePath: string;
  lastRoute: string;
  focusMode: boolean;
  isMinimized: boolean;
  lastKnownCursor: CursorDraft | null;
  currentExerciseName?: string | null;
  currentSetIndex?: number | null;
  restSnapshot?: {
    phase: WorkbenchDraftPhase;
    remainingSeconds: number;
    targetTimestamp: number;
  } | null;
  updatedAt: number;
};

export type ExecutionWorkbenchUiStateSnapshot = {
  draft: ExecutionWorkbenchUiState | null;
  isStale: boolean;
};

type ExecutionLocalDraftState = {
  version: 2;
  updatedAt: number;
  setDrafts: Record<string, ExecutionSetDraft>;
  restDraft: ExecutionRestDraft | null;
  workbenchDraft: ExecutionWorkbenchDraft | null;
};

export type ExecutionLocalDraftSnapshot = {
  updatedAt: number;
  isStale: boolean;
  setDrafts: Record<string, ExecutionSetDraft>;
  restDraft: ExecutionRestDraft | null;
  workbenchDraft: ExecutionWorkbenchDraft | null;
};

const STORAGE_PREFIX = "sms.workbench.localdraft.v2";
const WORKBENCH_UI_STATE_KEY = "sms.workbench.ui.v1";
const STALE_MS = 24 * 60 * 60 * 1000;
const WORKBENCH_UI_STATE_EVENT = "sms:workbench-ui-state";

function getStorageKey(scope: ExecutionDraftScope) {
  return `${STORAGE_PREFIX}:${scope.userId}:${scope.plannedSessionId}:${scope.sessionExecutionId}`;
}

function getNow() {
  return Date.now();
}

function createEmptyState(): ExecutionLocalDraftState {
  return {
    version: 2,
    updatedAt: getNow(),
    setDrafts: {},
    restDraft: null,
    workbenchDraft: null,
  };
}

function toCursorDraft(value: unknown): CursorDraft | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const cursor = value as Record<string, unknown>;
  if (typeof cursor.plannedUnitId !== "string" || typeof cursor.setId !== "string") {
    return null;
  }
  return {
    plannedUnitId: cursor.plannedUnitId,
    setId: cursor.setId,
  };
}

function toWorkbenchPhase(value: unknown): WorkbenchDraftPhase | null {
  if (value === "set_active" || value === "rest_active" || value === "session_done") {
    return value;
  }
  return null;
}

function toRestPresentation(value: unknown): RestPresentation {
  return value === "bubble" ? "bubble" : "card";
}

function readState(scope: ExecutionDraftScope): ExecutionLocalDraftState {
  if (typeof window === "undefined") return createEmptyState();
  try {
    const raw = window.localStorage.getItem(getStorageKey(scope));
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw) as Partial<ExecutionLocalDraftState>;
    const restDraftCandidate =
      parsed.restDraft && typeof parsed.restDraft === "object"
        ? (parsed.restDraft as Record<string, unknown>)
        : null;
    const restDraft =
      restDraftCandidate && typeof restDraftCandidate.restTargetTimestamp === "number"
        ? {
            pendingNextCursor: toCursorDraft(restDraftCandidate.pendingNextCursor),
            restTargetTimestamp: restDraftCandidate.restTargetTimestamp,
            autoAdvanceEnabled:
              typeof restDraftCandidate.autoAdvanceEnabled === "boolean"
                ? restDraftCandidate.autoAdvanceEnabled
                : undefined,
            presentation: toRestPresentation(restDraftCandidate.presentation),
            sourceSetId:
              typeof restDraftCandidate.sourceSetId === "string"
                ? restDraftCandidate.sourceSetId
                : undefined,
            restStartedAtMs:
              typeof restDraftCandidate.restStartedAtMs === "number"
                ? restDraftCandidate.restStartedAtMs
                : undefined,
            accumulatedMs:
              typeof restDraftCandidate.accumulatedMs === "number"
                ? restDraftCandidate.accumulatedMs
                : undefined,
            runningFromMs:
              typeof restDraftCandidate.runningFromMs === "number"
                ? restDraftCandidate.runningFromMs
                : restDraftCandidate.runningFromMs === null
                  ? null
                  : undefined,
            updatedAt:
              typeof restDraftCandidate.updatedAt === "number"
                ? restDraftCandidate.updatedAt
                : getNow(),
          }
        : null;

    const workbenchCandidate =
      parsed.workbenchDraft && typeof parsed.workbenchDraft === "object"
        ? (parsed.workbenchDraft as Record<string, unknown>)
        : null;
    const phase = toWorkbenchPhase(workbenchCandidate?.phase);
    const workbenchDraft =
      workbenchCandidate && phase
        ? {
            phase,
            activeCursor: toCursorDraft(workbenchCandidate.activeCursor),
            pendingNextCursor: toCursorDraft(workbenchCandidate.pendingNextCursor),
            updatedAt:
              typeof workbenchCandidate.updatedAt === "number"
                ? workbenchCandidate.updatedAt
                : getNow(),
          }
        : null;

    return {
      version: 2,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : getNow(),
      setDrafts: typeof parsed.setDrafts === "object" && parsed.setDrafts ? parsed.setDrafts : {},
      restDraft,
      workbenchDraft,
    };
  } catch {
    return createEmptyState();
  }
}

function writeState(scope: ExecutionDraftScope, state: ExecutionLocalDraftState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(scope), JSON.stringify(state));
}

function emitWorkbenchUiStateChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WORKBENCH_UI_STATE_EVENT));
}

export function getExecutionLocalDraftSnapshot(scope: ExecutionDraftScope): ExecutionLocalDraftSnapshot {
  const state = readState(scope);
  return {
    updatedAt: state.updatedAt,
    isStale: state.updatedAt < getNow() - STALE_MS,
    setDrafts: state.setDrafts,
    restDraft: state.restDraft,
    workbenchDraft: state.workbenchDraft,
  };
}

export function getAllExecutionSetDrafts(scope: ExecutionDraftScope) {
  return readState(scope).setDrafts;
}

export function getExecutionSetDraft(scope: ExecutionDraftScope, setId: string) {
  return readState(scope).setDrafts[setId] ?? null;
}

export function saveExecutionSetDraft(
  scope: ExecutionDraftScope,
  setId: string,
  draft: Omit<ExecutionSetDraft, "updatedAt">,
) {
  const current = readState(scope);
  const next: ExecutionLocalDraftState = {
    ...current,
    updatedAt: getNow(),
    setDrafts: {
      ...current.setDrafts,
      [setId]: {
        ...draft,
        updatedAt: getNow(),
      },
    },
  };
  writeState(scope, next);
}

export function removeExecutionSetDraft(scope: ExecutionDraftScope, setId: string) {
  const current = readState(scope);
  if (!(setId in current.setDrafts)) return;
  const { [setId]: _, ...rest } = current.setDrafts;
  writeState(scope, {
    ...current,
    setDrafts: rest,
    updatedAt: getNow(),
  });
}

export function getExecutionRestDraft(scope: ExecutionDraftScope) {
  return readState(scope).restDraft;
}

export function saveExecutionRestDraft(
  scope: ExecutionDraftScope,
  restDraft: Omit<ExecutionRestDraft, "updatedAt">,
) {
  const current = readState(scope);
  writeState(scope, {
    ...current,
    updatedAt: getNow(),
    restDraft: {
      ...restDraft,
      updatedAt: getNow(),
    },
  });
}

export function clearExecutionRestDraft(scope: ExecutionDraftScope) {
  const current = readState(scope);
  if (!current.restDraft) return;
  writeState(scope, {
    ...current,
    updatedAt: getNow(),
    restDraft: null,
  });
}

export function saveExecutionWorkbenchDraft(
  scope: ExecutionDraftScope,
  workbenchDraft: Omit<ExecutionWorkbenchDraft, "updatedAt">,
) {
  const current = readState(scope);
  writeState(scope, {
    ...current,
    updatedAt: getNow(),
    workbenchDraft: {
      ...workbenchDraft,
      updatedAt: getNow(),
    },
  });
}

export function clearExecutionWorkbenchDraft(scope: ExecutionDraftScope) {
  const current = readState(scope);
  if (!current.workbenchDraft) return;
  writeState(scope, {
    ...current,
    updatedAt: getNow(),
    workbenchDraft: null,
  });
}

export function clearExecutionLocalDraft(scope: ExecutionDraftScope) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getStorageKey(scope));
}

function parseExecutionWorkbenchUiState(raw: string | null): ExecutionWorkbenchUiState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ExecutionWorkbenchUiState>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.programId !== "string" ||
      typeof parsed.plannedSessionId !== "string" ||
      typeof parsed.sessionExecutionId !== "string" ||
      typeof parsed.executePath !== "string" ||
      typeof parsed.lastRoute !== "string"
    ) {
      return null;
    }
    return {
      userId: parsed.userId,
      programId: parsed.programId,
      plannedSessionId: parsed.plannedSessionId,
      sessionExecutionId: parsed.sessionExecutionId,
      executePath: parsed.executePath,
      lastRoute: parsed.lastRoute,
      focusMode: Boolean(parsed.focusMode),
      isMinimized: Boolean(parsed.isMinimized),
      lastKnownCursor: toCursorDraft(parsed.lastKnownCursor),
      currentExerciseName:
        typeof parsed.currentExerciseName === "string" ? parsed.currentExerciseName : null,
      currentSetIndex:
        typeof parsed.currentSetIndex === "number" ? parsed.currentSetIndex : null,
      restSnapshot:
        parsed.restSnapshot &&
        typeof parsed.restSnapshot === "object" &&
        !Array.isArray(parsed.restSnapshot) &&
        toWorkbenchPhase((parsed.restSnapshot as Record<string, unknown>).phase) &&
        typeof (parsed.restSnapshot as Record<string, unknown>).remainingSeconds === "number" &&
        typeof (parsed.restSnapshot as Record<string, unknown>).targetTimestamp === "number"
          ? {
              phase: toWorkbenchPhase(
                (parsed.restSnapshot as Record<string, unknown>).phase,
              ) as WorkbenchDraftPhase,
              remainingSeconds: Number(
                (parsed.restSnapshot as Record<string, unknown>).remainingSeconds,
              ),
              targetTimestamp: Number(
                (parsed.restSnapshot as Record<string, unknown>).targetTimestamp,
              ),
            }
          : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : getNow(),
    };
  } catch {
    return null;
  }
}

export function getExecutionWorkbenchUiStateSnapshot(): ExecutionWorkbenchUiStateSnapshot {
  if (typeof window === "undefined") {
    return { draft: null, isStale: true };
  }
  const draft = parseExecutionWorkbenchUiState(
    window.localStorage.getItem(WORKBENCH_UI_STATE_KEY),
  );
  if (!draft) {
    return { draft: null, isStale: true };
  }
  return {
    draft,
    isStale: draft.updatedAt < getNow() - STALE_MS,
  };
}

export function saveExecutionWorkbenchUiState(
  draft: Omit<ExecutionWorkbenchUiState, "updatedAt">,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    WORKBENCH_UI_STATE_KEY,
    JSON.stringify({
      ...draft,
      updatedAt: getNow(),
    }),
  );
  emitWorkbenchUiStateChanged();
}

export function clearExecutionWorkbenchUiState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WORKBENCH_UI_STATE_KEY);
  emitWorkbenchUiStateChanged();
}

export function onExecutionWorkbenchUiStateChange(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const wrapped = () => listener();
  window.addEventListener(WORKBENCH_UI_STATE_EVENT, wrapped);
  return () => window.removeEventListener(WORKBENCH_UI_STATE_EVENT, wrapped);
}
