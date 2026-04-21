"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type Side = "left" | "right";

type Position = {
  side: Side;
  top: number;
};

type DragState = {
  left: number;
  top: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
};

type Options = {
  storageKey: string;
  enabled: boolean;
  edgeOffset?: number;
  minTop?: number;
  defaultSide?: Side;
  defaultBottomOffset?: number;
  estimatedWidth?: number;
  estimatedHeight?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readStoredPosition(storageKey: string): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if ((parsed.side === "left" || parsed.side === "right") && typeof parsed.top === "number") {
      return { side: parsed.side, top: parsed.top };
    }
  } catch {}
  return null;
}

function writeStoredPosition(storageKey: string, position: Position) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(position));
  } catch {}
}

export function useEdgeSnapBubble({
  storageKey,
  enabled,
  edgeOffset = 12,
  minTop = 80,
  defaultSide = "right",
  defaultBottomOffset = 120,
  estimatedWidth = 80,
  estimatedHeight = 80,
}: Options) {
  const bubbleRef = useRef<HTMLElement | null>(null);
  const draggedRef = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const stored = readStoredPosition(storageKey);
    if (stored) {
      setPosition(stored);
      return;
    }
    const viewportHeight = window.innerHeight;
    const top = Math.max(minTop, viewportHeight - defaultBottomOffset - estimatedHeight);
    setPosition({ side: defaultSide, top });
  }, [defaultBottomOffset, defaultSide, enabled, estimatedHeight, minTop, storageKey]);

  useEffect(() => {
    if (!enabled || !dragState) return;

    const onPointerMove = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current) return current;
        const maxLeft = Math.max(edgeOffset, window.innerWidth - current.width - edgeOffset);
        const maxTop = Math.max(minTop, window.innerHeight - current.height - edgeOffset);
        const nextLeft = clamp(event.clientX - current.offsetX, edgeOffset, maxLeft);
        const nextTop = clamp(event.clientY - current.offsetY, minTop, maxTop);
        const moved =
          current.moved ||
          Math.abs(nextLeft - current.left) > 4 ||
          Math.abs(nextTop - current.top) > 4;
        draggedRef.current = moved;
        return { ...current, left: nextLeft, top: nextTop, moved };
      });
    };

    const finishDrag = () => {
      setDragState((current) => {
        if (!current) return current;
        const snapSide: Side = current.left + current.width / 2 < window.innerWidth / 2 ? "left" : "right";
        const maxTop = Math.max(minTop, window.innerHeight - current.height - edgeOffset);
        const nextPosition = {
          side: snapSide,
          top: clamp(current.top, minTop, maxTop),
        };
        setPosition(nextPosition);
        writeStoredPosition(storageKey, nextPosition);
        return null;
      });
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [dragState, edgeOffset, enabled, minTop, storageKey]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const element = bubbleRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      draggedRef.current = false;
      setDragState({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false,
      });
    },
    [enabled],
  );

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!draggedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = false;
  }, []);

  const style: CSSProperties = dragState
    ? {
        left: dragState.left,
        top: dragState.top,
        right: "auto",
        bottom: "auto",
        touchAction: "none",
      }
    : position
      ? position.side === "left"
        ? {
            left: edgeOffset,
            right: "auto",
            top: position.top,
            bottom: "auto",
            touchAction: "none",
          }
        : {
            right: edgeOffset,
            left: "auto",
            top: position.top,
            bottom: "auto",
            touchAction: "none",
          }
      : {
          touchAction: "none",
        };

  return {
    bubbleRef,
    bubbleStyle: style,
    bubbleDragging: Boolean(dragState),
    bubbleBind: {
      onPointerDown,
      onClickCapture,
    },
  };
}
