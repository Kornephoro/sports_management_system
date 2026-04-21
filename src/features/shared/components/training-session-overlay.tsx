"use client";

import { usePathname, useRouter } from "next/navigation";
import type { RefObject } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  clearExecutionWorkbenchUiState,
  ExecutionWorkbenchUiState,
  getExecutionWorkbenchUiStateSnapshot,
  onExecutionWorkbenchUiStateChange,
  saveExecutionWorkbenchUiState,
} from "@/features/executions/hooks/execution-local-draft";
import { useEdgeSnapBubble } from "@/features/shared/hooks/use-edge-snap-bubble";

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TrainingSessionOverlay() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const isExecutionWorkbenchRoute = /^\/programs\/[^/]+\/planned-sessions\/[^/]+\/execute$/.test(pathname);
  const [workbenchUiState, setWorkbenchUiState] = useState<ExecutionWorkbenchUiState | null>(null);
  const [uiStateStale, setUiStateStale] = useState(true);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const syncUiState = () => {
      const snapshot = getExecutionWorkbenchUiStateSnapshot();
      if (snapshot.isStale && snapshot.draft) {
        clearExecutionWorkbenchUiState();
        setWorkbenchUiState(null);
        setUiStateStale(true);
        return;
      }
      setWorkbenchUiState(snapshot.draft);
      setUiStateStale(snapshot.isStale);
    };

    syncUiState();
    const offChange = onExecutionWorkbenchUiStateChange(syncUiState);
    const onStorage = (event: StorageEvent) => {
      if (event.key && !event.key.includes("sms.workbench.ui")) return;
      syncUiState();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      offChange();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (isExecutionWorkbenchRoute) return;
    if (!workbenchUiState || uiStateStale) return;
    if (!workbenchUiState.focusMode) return;
    router.replace(workbenchUiState.executePath);
  }, [isExecutionWorkbenchRoute, router, uiStateStale, workbenchUiState]);

  const showFloatingTrainingBubble = Boolean(
    !isExecutionWorkbenchRoute &&
      !uiStateStale &&
      workbenchUiState &&
      workbenchUiState.isMinimized &&
      workbenchUiState.executePath,
  );

  useEffect(() => {
    if (!showFloatingTrainingBubble) return;
    if (!workbenchUiState?.restSnapshot) return;
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showFloatingTrainingBubble, workbenchUiState?.restSnapshot]);

  const floatingRestSeconds = useMemo(() => {
    if (!workbenchUiState?.restSnapshot) return null;
    return Math.max(0, Math.ceil((workbenchUiState.restSnapshot.targetTimestamp - nowTs) / 1000));
  }, [nowTs, workbenchUiState?.restSnapshot]);
  const { bubbleRef, bubbleStyle, bubbleBind } = useEdgeSnapBubble({
    storageKey: "sms.training-floating-bubble.position.v1",
    enabled: showFloatingTrainingBubble,
    defaultSide: "right",
    defaultBottomOffset: 104,
    estimatedWidth: 208,
    estimatedHeight: 74,
  });

  const restoreTraining = () => {
    if (!workbenchUiState) return;
    saveExecutionWorkbenchUiState({
      ...workbenchUiState,
      isMinimized: false,
      lastRoute: pathname,
    });
    router.push(workbenchUiState.executePath);
  };

  if (!showFloatingTrainingBubble || !workbenchUiState) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={restoreTraining}
      ref={bubbleRef as RefObject<HTMLButtonElement>}
      style={bubbleStyle}
      {...bubbleBind}
      className="fixed z-[60] min-h-11 rounded-full border border-blue-300 bg-white px-4 py-2 text-left shadow-lg"
      aria-label="恢复当前训练"
    >
      <p className="text-[11px] font-medium text-blue-700">训练进行中</p>
      <p className="max-w-[180px] truncate text-xs font-semibold text-zinc-900">
        {workbenchUiState.currentExerciseName ?? "返回当前组"}
        {workbenchUiState.currentSetIndex ? ` · 第${workbenchUiState.currentSetIndex}组` : ""}
      </p>
      {workbenchUiState.restSnapshot ? (
        <p className="text-[11px] text-zinc-600">
          休息剩余 {formatClock(floatingRestSeconds ?? workbenchUiState.restSnapshot.remainingSeconds)}
        </p>
      ) : (
        <p className="text-[11px] text-zinc-600">点击恢复训练</p>
      )}
    </button>
  );
}
