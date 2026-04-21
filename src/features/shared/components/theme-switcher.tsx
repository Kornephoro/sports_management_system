"use client";

import { useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "sms-theme-mode";

function getSystemTheme() {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === "system" ? getSystemTheme() : mode;
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark", "dark");
  if (resolved === "dark") {
    root.classList.add("theme-dark", "dark");
  } else {
    root.classList.add("theme-light");
  }
  root.setAttribute("data-theme-mode", mode);
}

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (mode === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [mode]);

  const modeLabel = useMemo(() => {
    if (mode === "light") {
      return "浅色";
    }
    if (mode === "dark") {
      return "深色";
    }
    return "跟随系统";
  }, [mode]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-600">主题：{modeLabel}</span>
      <select
        value={mode}
        onChange={(event) => {
          const nextMode = event.target.value as ThemeMode;
          setMode(nextMode);
          localStorage.setItem(STORAGE_KEY, nextMode);
          applyTheme(nextMode);
        }}
        className="rounded-xl border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-800 transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:text-zinc-200 dark:focus:border-blue-400"
        aria-label="主题模式切换"
      >
        <option value="light">浅色模式</option>
        <option value="dark">深色模式</option>
        <option value="system">跟随系统</option>
      </select>
    </div>
  );
}
