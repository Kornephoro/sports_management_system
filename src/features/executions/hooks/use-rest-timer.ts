"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RestTimerState = "idle" | "running" | "paused";

export function useRestTimer() {
  const [state, setState] = useState<RestTimerState>("idle");
  const [initialSeconds, setInitialSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (state !== "running") {
      clear();
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          clear();
          setState("idle");
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return clear;
  }, [clear, state]);

  useEffect(() => clear, [clear]);

  const start = useCallback((seconds: number) => {
    const normalized = Math.max(0, Math.floor(seconds));
    if (normalized <= 0) {
      setInitialSeconds(0);
      setRemainingSeconds(0);
      setState("idle");
      return;
    }
    setInitialSeconds(normalized);
    setRemainingSeconds(normalized);
    setState("running");
  }, []);

  const stop = useCallback(() => {
    setRemainingSeconds(0);
    setState("idle");
  }, []);

  const pause = useCallback(() => {
    setState((current) => (current === "running" ? "paused" : current));
  }, []);

  const resume = useCallback(() => {
    setState((current) => (current === "paused" ? "running" : current));
  }, []);

  const reset = useCallback(() => {
    if (initialSeconds <= 0) {
      setRemainingSeconds(0);
      setState("idle");
      return;
    }
    setRemainingSeconds(initialSeconds);
    setState("running");
  }, [initialSeconds]);

  const adjustBy = useCallback((deltaSeconds: number) => {
    const delta = Math.trunc(deltaSeconds);
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }
    setRemainingSeconds((current) => {
      const next = Math.max(0, current + delta);
      if (next === 0) {
        setState("idle");
        return 0;
      }
      if (state === "idle") {
        setState("running");
      }
      return next;
    });
    setInitialSeconds((current) => Math.max(0, current + delta));
  }, [state]);

  const isRunning = state === "running";

  const formatted = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingSeconds]);

  return {
    state,
    initialSeconds,
    remainingSeconds,
    formatted,
    isRunning,
    start,
    stop,
    pause,
    resume,
    reset,
    adjustBy,
  };
}
