import type { ReactNode } from "react";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: PageContainerProps) {
  // Use a constrained width (max-w-[480px]) and mx-auto to simulate a mobile app viewport on desktop.
  // Combine it with light/dark adaptive text colors.
  return <div className={cn("mx-auto w-full max-w-[480px] space-y-6 px-4 py-8 lg:px-6 dark:text-zinc-100", className)}>{children}</div>;
}

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p> : null}
    </header>
  );
}

type SectionBlockProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function SectionBlock({ title, description, children, className }: SectionBlockProps) {
  return (
    <section className={cn("space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900", className)}>
      {title ? (
        <header className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          {description ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

type AppCardProps = {
  children: ReactNode;
  className?: string;
  emphasis?: "default" | "soft" | "warn";
};

export function AppCard({ children, className, emphasis = "default" }: AppCardProps) {
  const emphasisClass =
    emphasis === "warn"
      ? "border-orange-200 bg-orange-50/80 shadow-sm dark:border-orange-800/60 dark:bg-orange-950/40"
      : emphasis === "soft"
        ? "border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-950/50"
        : "border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
  return <article className={cn("rounded-2xl border p-4 backdrop-blur-3xl", emphasisClass, className)}>{children}</article>;
}

type InlineAlertProps = {
  children: ReactNode;
  tone?: "info" | "success" | "warn" | "error";
  className?: string;
};

export function InlineAlert({ children, tone = "info", className }: InlineAlertProps) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
        : tone === "error"
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-300"
          : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300";
  return <div className={cn("rounded-xl border px-4 py-3 text-sm font-medium", toneClass, className)}>{children}</div>;
}

type EmptyStateProps = {
  title: string;
  hint?: string;
  actions?: ReactNode;
};

export function EmptyState({ title, hint, actions }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
      <p className="font-semibold text-zinc-900 dark:text-zinc-200">{title}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
      {actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

type SkeletonRowsProps = {
  rows?: number;
};

export function SkeletonRows({ rows = 3 }: SkeletonRowsProps) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-3 w-full rounded-full bg-zinc-200/80 dark:bg-zinc-800/80" />
      ))}
    </div>
  );
}

type StepperProps = {
  value: number | string;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  disabled?: boolean;
};

export function Stepper({
  value,
  onValueChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  label,
  disabled
}: StepperProps) {
  const numValue = typeof value === "number" ? value : parseFloat(value) || 0;

  const handleDecrement = () => {
    if (disabled) return;
    const next = Math.max(min, numValue - step);
    onValueChange(next);
  };

  const handleIncrement = () => {
    if (disabled) return;
    const next = Math.min(max, numValue + step);
    onValueChange(next);
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
          {label} {unit ? `(${unit})` : ""}
        </label>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled || numValue <= min}
          onClick={handleDecrement}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg font-bold shadow-sm active:bg-zinc-100 disabled:opacity-30 dark:border-zinc-800 dark:bg-zinc-950 dark:active:bg-zinc-900"
        >
          -
        </button>
        <div className="flex-1">
          <input
            type="number"
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(parseFloat(e.target.value) || 0)}
            className="h-10 w-full rounded-xl border-zinc-200 bg-zinc-50 px-2 py-0 text-center text-sm font-black focus:border-blue-500 focus:ring-0 dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>
        <button
          type="button"
          disabled={disabled || numValue >= max}
          onClick={handleIncrement}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg font-bold shadow-sm active:bg-zinc-100 disabled:opacity-30 dark:border-zinc-800 dark:bg-zinc-950 dark:active:bg-zinc-900"
        >
          +
        </button>
      </div>
    </div>
  );
}

