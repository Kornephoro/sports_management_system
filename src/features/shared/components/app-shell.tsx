"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TrainingSessionOverlay } from "@/features/shared/components/training-session-overlay";

type AppShellProps = {
  children: ReactNode;
};

type NavItem = {
  label: string;
  icon?: string;
  href?: string;
  disabled?: boolean;
};

const MOBILE_NAV_ITEMS: NavItem[] = [
  { label: "首页", icon: "🏠", href: "/" },
  { label: "训练", icon: "💪", href: "/training" },
  { label: "身体", icon: "🫀", href: "/observations" },
  { label: "我的", icon: "👤", href: "/me" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/training") {
      return (
        pathname === "/training" ||
        pathname.startsWith("/training/") ||
        pathname === "/programs" ||
        pathname.startsWith("/programs/") ||
        pathname.startsWith("/executions/") ||
        pathname.startsWith("/progression-matrix") ||
        pathname.startsWith("/progression-highlights") ||
        pathname.startsWith("/template-library") ||
        pathname.startsWith("/exercise-library")
    );
  }
  if (href === "/me") {
    return pathname === "/me" || pathname.startsWith("/me/") || pathname === "/assets" || pathname.startsWith("/assets/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() || "/";
  // The execute route is very focused, we might want different shell behavior there
  const isExecutionWorkbenchRoute = /^\/programs\/[^/]+\/planned-sessions\/[^/]+\/execute$/.test(pathname);
  
  // Define if the current page should show a back button
  // Top-level pages: /, /training, /assets, /observations, /me
  const isTopLevelPage = pathname === "/" || pathname === "/training" || pathname === "/observations" || pathname === "/me";

  return (
    <div className="min-h-screen bg-white text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-50">
      {/* Mobile Top Header */}
      {!isExecutionWorkbenchRoute && (
        <header className="fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-[480px] border-b border-zinc-100 bg-white/80 px-4 py-3 backdrop-blur-xl dark:border-zinc-900/50 dark:bg-zinc-950/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {!isTopLevelPage && (
                 <button 
                   onClick={() => window.history.back()}
                   className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 active:scale-90 dark:bg-zinc-900"
                 >
                   <span className="text-sm">←</span>
                 </button>
              )}
              <h1 className="text-sm font-black tracking-tight">训练系统</h1>
            </div>
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col">
        <main className={`flex-1 ${!isExecutionWorkbenchRoute ? "pt-14 pb-28" : ""}`}>
          {children}
        </main>
      </div>

      {/* Bottom Navigation */}
      {!isExecutionWorkbenchRoute ? (
        <nav className="fixed inset-x-0 bottom-6 z-40 mx-auto w-[92%] max-w-[400px] rounded-[2rem] border border-zinc-200/50 bg-white/80 p-2 shadow-2xl shadow-blue-900/5 backdrop-blur-2xl transition-all dark:border-zinc-800/50 dark:bg-zinc-950/80 dark:shadow-[0_0_40px_rgba(0,0,0,0.8)]">
          <div className="grid grid-cols-4 gap-1">
            {MOBILE_NAV_ITEMS.map((item) => {
              if (!item.href || item.disabled) {
                return (
                  <span
                    key={item.label}
                    className="flex flex-col items-center justify-center gap-1 opacity-50"
                  >
                    <span className="text-xl filter grayscale opacity-40">{item.icon}</span>
                    <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-600">{item.label}</span>
                  </span>
                );
              }
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center justify-center gap-1 rounded-[1.5rem] py-1.5 transition-all active:scale-95 ${
                    active 
                      ? "bg-blue-50/80 shadow-sm dark:bg-blue-900/30" 
                      : "opacity-70 hover:opacity-100 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  }`}
                >
                  <span className={`text-xl transition-transform ${active ? "scale-110 drop-shadow-md" : "scale-100 filter grayscale opacity-80"}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[10px] ${active ? "font-black text-blue-700 dark:text-blue-400" : "font-bold text-zinc-900 dark:text-zinc-100"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      <TrainingSessionOverlay />
    </div>
  );
}
