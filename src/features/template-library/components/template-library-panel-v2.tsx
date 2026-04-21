"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import {
  createTemplateLibraryFolder,
  createTemplateLibraryItem,
  deleteTemplateLibraryFolder,
  listTemplateLibraryFolders,
  listTemplateLibraryItems,
  listTemplateLibrarySplitTypes,
  setTemplateLibraryItemEnabled,
  TemplateLibraryFolderItem,
  TemplateLibraryItem,
  TemplateLibrarySplitTypeItem,
  updateTemplateLibraryFolder,
  updateTemplateLibraryItem,
} from "@/features/template-library/template-library-api";
import { AppCard, EmptyState, InlineAlert } from "@/features/shared/components/ui-primitives";
import { getTemplateSplitTypeLabel } from "@/lib/template-library-standards";

type TemplateLibraryPanelClientProps = {
  userId: string;
};

type FolderFilterValue = "all" | "uncategorized" | string;
type LibraryCue = "all" | "recent" | "referenced" | "unused";

const LIBRARY_CUE_LABEL_MAP: Record<LibraryCue, string> = {
  all: "全部模板",
  recent: "最近使用",
  referenced: "计划引用",
  unused: "未使用",
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "未使用";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未使用";
  }

  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function buildSummaryCountLabel(count: number, noun: string) {
  return `${count} 个${noun}`;
}

function getReferenceCount(item: TemplateLibraryItem) {
  return item.referenceProgramCount ?? 0;
}

function getTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortByTemplateName(a: TemplateLibraryItem, b: TemplateLibraryItem) {
  return a.name.localeCompare(b.name, "zh-CN");
}

function buildUnitPreview(item: TemplateLibraryItem) {
  return item.units
    .slice()
    .sort((a, b) => a.sequenceNo - b.sequenceNo)
    .slice(0, 3)
    .map((unit) => <span key={unit.exerciseNameSnapshot || Math.random().toString()} className="inline-block px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-[10px] font-bold text-zinc-600 dark:text-zinc-400">{unit.exerciseNameSnapshot}</span>);
}

function FilterChip({
  active,
  onClick,
  children,
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border text-[11px] font-black tracking-tight transition-all active:scale-95",
        compact ? "px-3 py-1.5" : "px-4 py-2",
        active
          ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
          : "border-zinc-200 bg-white text-zinc-500 hover:border-indigo-200 hover:text-indigo-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400",
      )}
    >
      {children}
    </button>
  );
}

function DiscoveryButton({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative min-h-[64px] overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.98]",
        active
          ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-500/20 dark:border-indigo-500 dark:bg-indigo-600 dark:shadow-none"
          : "border-zinc-200/50 bg-white/50 text-zinc-900 backdrop-blur-xl hover:border-indigo-200 dark:border-zinc-800/50 dark:bg-zinc-900/50 dark:text-zinc-100",
      )}
    >
      {active && (
        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/20 blur-2xl transition-transform group-hover:scale-110" />
      )}
      <span className="relative z-10 block text-[14px] font-black tracking-tight">{label}</span>
      <span
        className={cn(
          "relative z-10 mt-1 block text-[10px] font-bold uppercase tracking-widest",
          active ? "text-indigo-100" : "text-zinc-500",
        )}
      >
        {meta}
      </span>
    </button>
  );
}

function BottomSheet({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/60 shadow-inner backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[540px] px-4 pb-4">
        <div className="max-h-[85dvh] overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/90 shadow-2xl backdrop-blur-2xl dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
            <div className="space-y-1">
              <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h2>
              {description && (
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-all hover:bg-zinc-200 active:scale-90 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(85dvh-92px)] overflow-y-auto px-6 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function TemplateLibraryPanelV2({ userId }: TemplateLibraryPanelClientProps) {
  const router = useRouter();

  const [items, setItems] = useState<TemplateLibraryItem[]>([]);
  const [splitTypes, setSplitTypes] = useState<TemplateLibrarySplitTypeItem[]>([]);
  const [folders, setFolders] = useState<TemplateLibraryFolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [splitFilter, setSplitFilter] = useState<"all" | string>("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "true" | "false">("all");
  const [folderFilter, setFolderFilter] = useState<FolderFilterValue>("all");
  const [libraryCue, setLibraryCue] = useState<LibraryCue>("all");
  const [showFilters, setShowFilters] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSplitType, setCreateSplitType] = useState<string>("custom");

  const openCreateSheet = useCallback(() => {
    setIsCreateOpen(true);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listTemplateLibraryItems(userId, {
        query: query.trim() || undefined,
        enabled: enabledFilter,
        splitType: splitFilter,
        folderKey: folderFilter,
      });
      setItems(next);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabledFilter, folderFilter, query, splitFilter, userId]);

  const loadMetadata = useCallback(async () => {
    try {
      const [nextSplitTypes, nextFolders] = await Promise.all([
        listTemplateLibrarySplitTypes(userId),
        listTemplateLibraryFolders(userId),
      ]);
      setSplitTypes(nextSplitTypes);
      setFolders(nextFolders);
    } catch {}
  }, [userId]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadMetadata(); }, [loadMetadata]);

  const cueStats = useMemo(() => ({
    all: items.length,
    recent: items.filter(i => getTimestamp(i.lastUsedAt) > 0).length,
    referenced: items.filter(i => getReferenceCount(i) > 0).length,
    unused: items.filter(i => getTimestamp(i.lastUsedAt) === 0 && getReferenceCount(i) === 0).length,
  }), [items]);

  const displayItems = useMemo(() => {
    let base = items;
    if (libraryCue === "recent") base = items.filter(i => getTimestamp(i.lastUsedAt) > 0);
    else if (libraryCue === "referenced") base = items.filter(i => getReferenceCount(i) > 0);
    else if (libraryCue === "unused") base = items.filter(i => getTimestamp(i.lastUsedAt) === 0 && getReferenceCount(i) === 0);
    return base.slice().sort(sortByTemplateName);
  }, [items, libraryCue]);

  const visibleStats = useMemo(() => ({
    visibleCount: displayItems.length,
    activeCount: displayItems.filter(i => i.enabled).length,
  }), [displayItems]);

  return (
    <div className="relative space-y-8 pb-32">
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-[600px] w-[600px] rounded-full bg-blue-100/20 blur-[120px] dark:bg-indigo-950/10" />
        <div className="absolute -right-1/4 bottom-0 h-[500px] w-[500px] rounded-full bg-indigo-100/10 blur-[100px] dark:bg-blue-950/10" />
      </div>

      <header className="relative space-y-6 rounded-[2.8rem] bg-zinc-900 p-8 shadow-2xl dark:bg-zinc-900/60 dark:backdrop-blur-3xl overflow-hidden border border-white/5">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/30 blur-[70px] dark:bg-indigo-600/20" />
        <div className="absolute -left-20 -bottom-20 h-72 w-72 rounded-full bg-indigo-600/20 blur-[70px] dark:bg-blue-600/10" />
        
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter text-white">计划库</h1>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-blue-200 border border-white/5 backdrop-blur-md">
                {buildSummaryCountLabel(visibleStats.visibleCount, "模板")}
              </span>
              <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-indigo-300 border border-indigo-400/20 backdrop-blur-md">
                启用 {visibleStats.activeCount}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreateSheet}
            className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-indigo-500 to-blue-700 px-6 text-sm font-black text-white shadow-xl transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
            新建模板
          </button>
        </div>

        <div className="relative z-10 mt-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索意图、动作、部位或模板描述"
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 text-sm font-bold text-white placeholder:text-white/30 transition-all focus:bg-white/10 focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </header>

      <AppCard className="space-y-5 rounded-[2.5rem] p-6 shadow-xl backdrop-blur-2xl border-zinc-200/50 dark:border-zinc-800/50 dark:bg-zinc-950/40" emphasis="soft">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">浏览线索</p>
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{LIBRARY_CUE_LABEL_MAP[libraryCue]}</p>
          </div>
          {libraryCue !== "all" && <button onClick={() => setLibraryCue("all")} className="text-xs font-black text-indigo-600 dark:text-indigo-400">重置</button>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DiscoveryButton active={libraryCue === "all"} label="全部模板" meta={buildSummaryCountLabel(cueStats.all, "模板")} onClick={() => setLibraryCue("all")} />
          <DiscoveryButton active={libraryCue === "recent"} label="最近使用" meta={buildSummaryCountLabel(cueStats.recent, "模板")} onClick={() => setLibraryCue("recent")} />
          <DiscoveryButton active={libraryCue === "referenced"} label="计划引用" meta={buildSummaryCountLabel(cueStats.referenced, "模板")} onClick={() => setLibraryCue("referenced")} />
          <DiscoveryButton active={libraryCue === "unused"} label="未使用过" meta={buildSummaryCountLabel(cueStats.unused, "模板")} onClick={() => setLibraryCue("unused")} />
        </div>
      </AppCard>

      <div className="space-y-4">
        <div className="px-2 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
           <span>{LIBRARY_CUE_LABEL_MAP[libraryCue]}</span>
           <span>{displayItems.length} 个结果</span>
        </div>
        {displayItems.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => router.push(`/template-library/${item.id}`)}
            className="w-full text-left"
          >
            <AppCard className="group relative cursor-pointer overflow-hidden rounded-[2.2rem] border-zinc-200/50 p-6 shadow-md transition-all hover:border-indigo-300 hover:bg-white dark:hover:border-indigo-900/50 dark:hover:bg-zinc-900">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2.5">
                 <div className="flex items-center gap-2">
                   <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                     {getTemplateSplitTypeLabel(item.splitType)}
                   </span>
                 </div>
                 <h2 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 group-hover:text-indigo-600 transition-colors">{item.name}</h2>
                 <div className="flex flex-wrap gap-2">{buildUnitPreview(item)}</div>
              </div>
              <ChevronDown className="-rotate-90 h-5 w-5 text-zinc-300" />
            </div>
            </AppCard>
          </button>
        ))}
      </div>
      {isCreateOpen && <BottomSheet open={isCreateOpen} title="新建计划模板" onClose={() => setIsCreateOpen(false)}>暂不支持该操作于测试组件</BottomSheet>}
    </div>
  );
}
