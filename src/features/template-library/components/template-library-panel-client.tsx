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
    .map((unit) => unit.exerciseNameSnapshot)
    .filter(Boolean)
    .join(" / ");
}

function FilterChip({
  active,
  onClick,
  children,
  tone = "default",
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "accent";
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border text-xs font-bold transition-colors",
        compact ? "px-2.5 py-1" : "px-3 py-1.5",
        active
          ? tone === "accent"
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
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
        "min-h-14 rounded-xl border px-3 py-2 text-left transition-colors",
        active
          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
          : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
      )}
    >
      <span className="block text-sm font-black">{label}</span>
      <span
        className={cn(
          "mt-0.5 block text-[11px] font-bold",
          active ? "text-blue-100" : "text-zinc-500 dark:text-zinc-400",
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
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px] px-3 pb-3">
        <div className="max-h-[82dvh] overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
            <div className="space-y-1">
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50">{title}</h2>
              {description ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[calc(82dvh-84px)] overflow-y-auto px-4 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function TemplateLibraryPanelClient({ userId }: TemplateLibraryPanelClientProps) {
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
  const [createDescription, setCreateDescription] = useState("");
  const [createSplitType, setCreateSplitType] = useState<string>("custom");
  const [createFolderKey, setCreateFolderKey] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState(false);
  const [folderCreateLabel, setFolderCreateLabel] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [editingFolderKey, setEditingFolderKey] = useState<string | null>(null);
  const [editingFolderLabel, setEditingFolderLabel] = useState("");
  const [isFolderSaving, setIsFolderSaving] = useState(false);
  const [pendingDeleteFolderKey, setPendingDeleteFolderKey] = useState<string | null>(null);
  const [pendingDeleteMigrateTo, setPendingDeleteMigrateTo] = useState<string>("uncategorized");

  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [itemActionSaving, setItemActionSaving] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, items],
  );

  const splitTypeLabelMap = useMemo(
    () => new Map(splitTypes.map((item) => [item.key, item.label])),
    [splitTypes],
  );

  const folderLabelMap = useMemo(
    () => new Map(folders.map((item) => [item.key, item.label])),
    [folders],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listTemplateLibraryItems(userId, {
        query: query.trim() || undefined,
        enabled: enabledFilter,
        splitType: splitFilter,
        folderKey: folderFilter,
      });
      setItems(next);
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : "加载计划库失败");
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

      if (splitFilter !== "all" && !nextSplitTypes.some((item) => item.key === splitFilter)) {
        setSplitFilter("all");
      }
      if (
        folderFilter !== "all" &&
        folderFilter !== "uncategorized" &&
        !nextFolders.some((item) => item.key === folderFilter)
      ) {
        setFolderFilter("all");
      }
    } catch {
      setSplitTypes([]);
      setFolders([]);
    }
  }, [folderFilter, splitFilter, userId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  const cueStats = useMemo(
    () => ({
      all: items.length,
      recent: items.filter((item) => getTimestamp(item.lastUsedAt) > 0).length,
      referenced: items.filter((item) => getReferenceCount(item) > 0).length,
      unused: items.filter(
        (item) => getTimestamp(item.lastUsedAt) === 0 && getReferenceCount(item) === 0,
      ).length,
    }),
    [items],
  );

  const displayItems = useMemo(() => {
    if (libraryCue === "recent") {
      return items
        .filter((item) => getTimestamp(item.lastUsedAt) > 0)
        .slice()
        .sort(
          (a, b) =>
            getTimestamp(b.lastUsedAt) - getTimestamp(a.lastUsedAt) ||
            sortByTemplateName(a, b),
        );
    }

    if (libraryCue === "referenced") {
      return items
        .filter((item) => getReferenceCount(item) > 0)
        .slice()
        .sort(
          (a, b) =>
            getReferenceCount(b) - getReferenceCount(a) || sortByTemplateName(a, b),
        );
    }

    if (libraryCue === "unused") {
      return items
        .filter((item) => getTimestamp(item.lastUsedAt) === 0 && getReferenceCount(item) === 0)
        .slice()
        .sort(sortByTemplateName);
    }

    return items;
  }, [items, libraryCue]);

  const visibleStats = useMemo(() => {
    const activeCount = displayItems.filter((item) => item.enabled).length;
    return {
      visibleCount: displayItems.length,
      activeCount,
      folderCount: folders.length,
    };
  }, [displayItems, folders.length]);

  const clearFilters = () => {
    setQuery("");
    setSplitFilter("all");
    setEnabledFilter("all");
    setFolderFilter("all");
    setLibraryCue("all");
  };

  const openCreateSheet = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateSplitType(splitTypes[0]?.key ?? "custom");
    setCreateFolderKey(null);
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateTemplate = async () => {
    const trimmedName = createName.trim();
    if (!trimmedName) {
      setCreateError("请输入模板名称");
      return;
    }

    setCreateError(null);
    setIsCreating(true);
    try {
      const created = await createTemplateLibraryItem({
        userId,
        name: trimmedName,
        description: createDescription.trim(),
        splitType: createSplitType,
        folderKey: createFolderKey,
        aliases: [],
        enabled: true,
        units: [],
      });
      setIsCreateOpen(false);
      await Promise.all([loadMetadata(), loadItems()]);
      router.push(`/template-library/${created.id}`);
    } catch (saveError) {
      setCreateError(saveError instanceof Error ? saveError.message : "新建模板失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleFolderCreate = async () => {
    const label = folderCreateLabel.trim();
    if (!label) {
      setFolderError("请输入文件夹名称");
      return;
    }

    setFolderError(null);
    setIsFolderSaving(true);
    try {
      await createTemplateLibraryFolder({
        userId,
        label,
      });
      setFolderCreateLabel("");
      await loadMetadata();
    } catch (saveError) {
      setFolderError(saveError instanceof Error ? saveError.message : "创建文件夹失败");
    } finally {
      setIsFolderSaving(false);
    }
  };

  const beginFolderRename = (folder: TemplateLibraryFolderItem) => {
    setEditingFolderKey(folder.key);
    setEditingFolderLabel(folder.label);
    setFolderError(null);
  };

  const handleFolderRename = async () => {
    if (!editingFolderKey) {
      return;
    }
    const label = editingFolderLabel.trim();
    if (!label) {
      setFolderError("请输入文件夹名称");
      return;
    }

    setFolderError(null);
    setIsFolderSaving(true);
    try {
      await updateTemplateLibraryFolder(editingFolderKey, {
        userId,
        label,
      });
      setEditingFolderKey(null);
      setEditingFolderLabel("");
      await loadMetadata();
    } catch (saveError) {
      setFolderError(saveError instanceof Error ? saveError.message : "重命名文件夹失败");
    } finally {
      setIsFolderSaving(false);
    }
  };

  const handleFolderDelete = async () => {
    if (!pendingDeleteFolderKey) {
      return;
    }

    setFolderError(null);
    setIsFolderSaving(true);
    try {
      await deleteTemplateLibraryFolder(pendingDeleteFolderKey, {
        userId,
        migrateToKey:
          pendingDeleteMigrateTo === "uncategorized" ? undefined : pendingDeleteMigrateTo,
      });
      if (folderFilter === pendingDeleteFolderKey) {
        setFolderFilter(
          pendingDeleteMigrateTo === "uncategorized" ? "uncategorized" : "all",
        );
      }
      setPendingDeleteFolderKey(null);
      setPendingDeleteMigrateTo("uncategorized");
      await Promise.all([loadMetadata(), loadItems()]);
    } catch (saveError) {
      setFolderError(saveError instanceof Error ? saveError.message : "删除文件夹失败");
    } finally {
      setIsFolderSaving(false);
    }
  };

  const handleSetItemEnabled = async (item: TemplateLibraryItem, enabled: boolean) => {
    setItemActionError(null);
    setItemActionSaving(true);
    try {
      await setTemplateLibraryItemEnabled(item.id, {
        userId,
        enabled,
      });
      await loadItems();
      setActiveItemId(null);
    } catch (saveError) {
      setItemActionError(saveError instanceof Error ? saveError.message : "更新状态失败");
    } finally {
      setItemActionSaving(false);
    }
  };

  const handleMoveItemToFolder = async (
    item: TemplateLibraryItem,
    nextFolderKey: string | null,
  ) => {
    setItemActionError(null);
    setItemActionSaving(true);
    try {
      await updateTemplateLibraryItem(item.id, {
        userId,
        folderKey: nextFolderKey,
      });
      await Promise.all([loadMetadata(), loadItems()]);
      setActiveItemId(null);
    } catch (saveError) {
      setItemActionError(saveError instanceof Error ? saveError.message : "移动模板失败");
    } finally {
      setItemActionSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-[30px] font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              计划库
            </h1>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {buildSummaryCountLabel(visibleStats.visibleCount, "模板")}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                启用 {visibleStats.activeCount}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                文件夹 {visibleStats.folderCount}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreateSheet}
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-black text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" />
            新建模板
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索意图、动作、部位或模板描述"
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </header>

      <AppCard className="space-y-3 p-3" emphasis="soft">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">浏览线索</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{LIBRARY_CUE_LABEL_MAP[libraryCue]}</p>
          </div>
          {libraryCue !== "all" ? (
            <button
              type="button"
              onClick={() => setLibraryCue("all")}
              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              重置
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <DiscoveryButton
            active={libraryCue === "all"}
            label="全部模板"
            meta={buildSummaryCountLabel(cueStats.all, "模板")}
            onClick={() => setLibraryCue("all")}
          />
          <DiscoveryButton
            active={libraryCue === "recent"}
            label="最近使用"
            meta={buildSummaryCountLabel(cueStats.recent, "模板")}
            onClick={() => setLibraryCue("recent")}
          />
          <DiscoveryButton
            active={libraryCue === "referenced"}
            label="计划引用"
            meta={buildSummaryCountLabel(cueStats.referenced, "模板")}
            onClick={() => setLibraryCue("referenced")}
          />
          <DiscoveryButton
            active={libraryCue === "unused"}
            label="未使用"
            meta={buildSummaryCountLabel(cueStats.unused, "模板")}
            onClick={() => setLibraryCue("unused")}
          />
        </div>
      </AppCard>

      <AppCard className="space-y-3 p-3" emphasis="soft">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">细筛</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              类型、文件夹、状态
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(query.trim() ||
              splitFilter !== "all" ||
              enabledFilter !== "all" ||
              folderFilter !== "all" ||
              libraryCue !== "all") && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                清空
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {showFilters ? "收起" : "展开"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showFilters && "rotate-180")} />
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">按分化类型筛选</p>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  active={splitFilter === "all"}
                  onClick={() => setSplitFilter("all")}
                  compact
                >
                  全部
                </FilterChip>
                {splitTypes.map((type) => (
                  <FilterChip
                    key={type.key}
                    active={splitFilter === type.key}
                    onClick={() => setSplitFilter(type.key)}
                    compact
                  >
                    {type.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">按文件夹筛选</p>
                <button
                  type="button"
                  onClick={() => {
                    setFolderError(null);
                    setPendingDeleteFolderKey(null);
                    setIsFolderManagerOpen(true);
                  }}
                  className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  管理
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  active={folderFilter === "all"}
                  onClick={() => setFolderFilter("all")}
                  compact
                >
                  全部
                </FilterChip>
                <FilterChip
                  active={folderFilter === "uncategorized"}
                  onClick={() => setFolderFilter("uncategorized")}
                  compact
                >
                  未分类
                </FilterChip>
                {folders.map((folder) => (
                  <FilterChip
                    key={folder.key}
                    active={folderFilter === folder.key}
                    onClick={() => setFolderFilter(folder.key)}
                    compact
                  >
                    {folder.label}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">按状态筛选</p>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  active={enabledFilter === "all"}
                  onClick={() => setEnabledFilter("all")}
                  compact
                >
                  全部
                </FilterChip>
                <FilterChip
                  active={enabledFilter === "true"}
                  onClick={() => setEnabledFilter("true")}
                  compact
                >
                  启用
                </FilterChip>
                <FilterChip
                  active={enabledFilter === "false"}
                  onClick={() => setEnabledFilter("false")}
                  compact
                >
                  归档
                </FilterChip>
              </div>
            </div>
          </div>
        ) : null}
      </AppCard>

      {error ? <InlineAlert tone="warn">{error}</InlineAlert> : null}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={`template-skeleton:${index}`}
              className="h-28 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/60"
            />
          ))}
        </div>
      ) : displayItems.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
            <span>{LIBRARY_CUE_LABEL_MAP[libraryCue]}</span>
            <span>{buildSummaryCountLabel(displayItems.length, "模板")}</span>
          </div>
          {displayItems.map((item) => {
            const splitLabel =
              splitTypeLabelMap.get(item.splitType) ?? getTemplateSplitTypeLabel(item.splitType);
            const folderLabel = item.folderKey
              ? folderLabelMap.get(item.folderKey) ?? item.folderKey
              : "未分类";
            const unitPreview = buildUnitPreview(item);
            return (
              <AppCard
                key={item.id}
                className="cursor-pointer space-y-2.5 p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:hover:border-blue-800 dark:hover:bg-zinc-900"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/template-library/${item.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/template-library/${item.id}`);
                    }
                  }}
                  className="space-y-2 outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h2 className="line-clamp-1 text-base font-black text-zinc-900 dark:text-zinc-50">
                          {item.name}
                        </h2>
                        {!item.enabled ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                            已归档
                          </span>
                        ) : null}
                      </div>
                      <p className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {item.description?.trim() || "暂无模板说明"}
                      </p>
                      {unitPreview ? (
                        <p className="line-clamp-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          包含 {unitPreview}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setItemActionError(null);
                        setActiveItemId(item.id);
                      }}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {splitLabel}
                    </span>
                    <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {item.unitCount} 槽位
                    </span>
                    <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {folderLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>最近使用 {formatDateLabel(item.lastUsedAt)}</span>
                    <span>{item.referenceProgramCount ?? 0} 个计划引用</span>
                  </div>
                </div>
              </AppCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="当前没有符合条件的模板"
          hint="可以先新建一个模板，或者清空筛选重新查看"
          actions={
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              清空筛选
            </button>
          }
        />
      )}

      <BottomSheet
        open={isCreateOpen}
        onClose={() => {
          if (isCreating) return;
          setIsCreateOpen(false);
        }}
        title="新建模板"
        description="先创建一个空白模板，再进入详情页继续补充训练槽位"
      >
        <div className="space-y-3">
          {createError ? <InlineAlert tone="warn">{createError}</InlineAlert> : null}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">模板名称</label>
            <input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="例如：胸肩主项日"
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-200">模板说明</label>
            <textarea
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              rows={3}
              placeholder="可选，简短说明这个模板的用途"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">分化类型</p>
            <div className="flex flex-wrap gap-1.5">
              {splitTypes.map((type) => (
                <FilterChip
                  key={type.key}
                  active={createSplitType === type.key}
                  onClick={() => setCreateSplitType(type.key)}
                  compact
                  tone="accent"
                >
                  {type.label}
                </FilterChip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">放入文件夹</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={createFolderKey === null}
                onClick={() => setCreateFolderKey(null)}
                compact
              >
                未分类
              </FilterChip>
              {folders.map((folder) => (
                <FilterChip
                  key={folder.key}
                  active={createFolderKey === folder.key}
                  onClick={() => setCreateFolderKey(folder.key)}
                  compact
                >
                  {folder.label}
                </FilterChip>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="h-11 flex-1 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              disabled={isCreating}
              onClick={() => void handleCreateTemplate()}
              className="h-11 flex-1 rounded-xl bg-blue-600 text-sm font-black text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
            >
              {isCreating ? "创建中..." : "创建并进入"}
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={isFolderManagerOpen}
        onClose={() => {
          if (isFolderSaving) return;
          setIsFolderManagerOpen(false);
          setEditingFolderKey(null);
          setPendingDeleteFolderKey(null);
          setFolderError(null);
        }}
        title="管理文件夹"
        description="文件夹用于管理你的模板使用习惯，不改变模板本身的训练内容"
      >
        <div className="space-y-3">
          {folderError ? <InlineAlert tone="warn">{folderError}</InlineAlert> : null}

          <AppCard emphasis="soft" className="space-y-2.5 p-3">
            <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">新建文件夹</p>
            <div className="flex gap-2">
              <input
                value={folderCreateLabel}
                onChange={(event) => setFolderCreateLabel(event.target.value)}
                placeholder="例如：常用模板"
                className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                type="button"
                disabled={isFolderSaving}
                onClick={() => void handleFolderCreate()}
                className="inline-flex h-10 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-black text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
          </AppCard>

          <div className="space-y-2">
            {folders.length > 0 ? (
              folders.map((folder) => {
                const isEditing = editingFolderKey === folder.key;
                const isDeleting = pendingDeleteFolderKey === folder.key;
                return (
                  <AppCard key={folder.key} className="space-y-2.5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        {isEditing ? (
                          <input
                            value={editingFolderLabel}
                            onChange={(event) => setEditingFolderLabel(event.target.value)}
                            className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                          />
                        ) : (
                          <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                            {folder.label}
                          </p>
                        )}
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {folder.templateCount} 个模板
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              disabled={isFolderSaving}
                              onClick={() => void handleFolderRename()}
                              className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-black text-white"
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFolderKey(null);
                                setEditingFolderLabel("");
                              }}
                              className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => beginFolderRename(folder)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingDeleteFolderKey(folder.key);
                                setPendingDeleteMigrateTo("uncategorized");
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isDeleting ? (
                      <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                          删除“{folder.label}”前，先决定里面的模板放到哪里
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <FilterChip
                            active={pendingDeleteMigrateTo === "uncategorized"}
                            onClick={() => setPendingDeleteMigrateTo("uncategorized")}
                            compact
                            tone="accent"
                          >
                            移到未分类
                          </FilterChip>
                          {folders
                            .filter((item) => item.key !== folder.key)
                            .map((candidate) => (
                              <FilterChip
                                key={candidate.key}
                                active={pendingDeleteMigrateTo === candidate.key}
                                onClick={() => setPendingDeleteMigrateTo(candidate.key)}
                                compact
                                tone="accent"
                              >
                                {candidate.label}
                              </FilterChip>
                            ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingDeleteFolderKey(null)}
                            className="h-9 flex-1 rounded-xl border border-zinc-300 bg-white text-[11px] font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={isFolderSaving}
                            onClick={() => void handleFolderDelete()}
                            className="h-9 flex-1 rounded-xl bg-red-600 text-[11px] font-black text-white disabled:opacity-60"
                          >
                            确认删除
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </AppCard>
                );
              })
            ) : (
              <EmptyState
                title="还没有文件夹"
                hint="你可以先建一个“常用模板”或“待打磨”文件夹"
              />
            )}
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={selectedItem !== null}
        onClose={() => {
          if (itemActionSaving) return;
          setActiveItemId(null);
          setItemActionError(null);
        }}
        title={selectedItem?.name ?? "模板操作"}
        description="这里处理模板移动、归档和进入详情，不改动模板训练内容"
      >
        {selectedItem ? (
          <div className="space-y-3">
            {itemActionError ? <InlineAlert tone="warn">{itemActionError}</InlineAlert> : null}

            <AppCard emphasis="soft" className="space-y-2.5 p-3">
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">模板摘要</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {splitTypeLabelMap.get(selectedItem.splitType) ??
                    getTemplateSplitTypeLabel(selectedItem.splitType)}
                </span>
                <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {selectedItem.unitCount} 槽位
                </span>
                <span className="rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {selectedItem.folderKey
                    ? folderLabelMap.get(selectedItem.folderKey) ?? selectedItem.folderKey
                    : "未分类"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/template-library/${selectedItem.id}`)}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                打开详情
              </button>
            </AppCard>

            <AppCard emphasis="soft" className="space-y-2.5 p-3">
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">移动到文件夹</p>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  active={selectedItem.folderKey === null}
                  onClick={() => void handleMoveItemToFolder(selectedItem, null)}
                  compact
                  tone="accent"
                >
                  未分类
                </FilterChip>
                {folders.map((folder) => (
                  <FilterChip
                    key={folder.key}
                    active={selectedItem.folderKey === folder.key}
                    onClick={() => void handleMoveItemToFolder(selectedItem, folder.key)}
                    compact
                    tone="accent"
                  >
                    {folder.label}
                  </FilterChip>
                ))}
              </div>
            </AppCard>

            <AppCard emphasis="soft" className="space-y-2.5 p-3">
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-50">模板状态</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={itemActionSaving || selectedItem.enabled}
                  onClick={() => void handleSetItemEnabled(selectedItem, true)}
                  className="h-10 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  启用模板
                </button>
                <button
                  type="button"
                  disabled={itemActionSaving || !selectedItem.enabled}
                  onClick={() => void handleSetItemEnabled(selectedItem, false)}
                  className="h-10 rounded-xl border border-zinc-300 bg-white text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  归档模板
                </button>
              </div>
            </AppCard>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
