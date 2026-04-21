"use client";

import dynamic from "next/dynamic";

const ThemeSwitcher = dynamic(
  () => import("@/features/shared/components/theme-switcher").then((mod) => mod.ThemeSwitcher),
  { ssr: false },
);

export function ThemeSwitcherClientOnly() {
  return <ThemeSwitcher />;
}
