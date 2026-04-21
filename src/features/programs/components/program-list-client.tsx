"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createProgramWorkflow,
  listPrograms,
  ProgramListItem,
} from "@/features/programs/programs-api";
import {
  listTemplateLibraryItems,
  TemplateLibraryItem,
} from "@/features/template-library/template-library-api";
import { getProgramStatusLabel, getSportTypeLabel, TERMS_ZH } from "@/features/shared/ui-zh";

type ProgramListClientProps = {
  userId: string;
};

export function ProgramListClient({ userId }: ProgramListClientProps) {
  const router = useRouter();
  const [programs, setPrograms] = useState<ProgramListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programName, setProgramName] = useState("我的训练计划");
  const [structure, setStructure] = useState<"weekly_1_day">("weekly_1_day");
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [templateLibraryItems, setTemplateLibraryItems] = useState<TemplateLibraryItem[]>([]);
  const [selectedTemplateLibraryItemId, setSelectedTemplateLibraryItemId] = useState("");

  const loadPrograms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [nextPrograms, templates] = await Promise.all([
        listPrograms(userId),
        listTemplateLibraryItems(userId, {
          enabled: "true",
        }),
      ]);
      setPrograms(nextPrograms);
      setTemplateLibraryItems(templates.filter((item) => item.enabled));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载训练计划失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  useEffect(() => {
    if (templateLibraryItems.length === 0) {
      setSelectedTemplateLibraryItemId("");
      return;
    }
    if (!templateLibraryItems.some((item) => item.id === selectedTemplateLibraryItemId)) {
      setSelectedTemplateLibraryItemId(templateLibraryItems[0].id);
    }
  }, [templateLibraryItems, selectedTemplateLibraryItemId]);

  const handleCreateProgram = async (mode: "template" | "blank") => {
    const trimmedName = programName.trim();
    if (!trimmedName) {
      setCreateMessage("计划名称不能为空。");
      return;
    }
    if (mode === "template" && !selectedTemplateLibraryItemId) {
      setCreateMessage("请先选择模板后再创建，或使用“空白创建计划（高级）”。");
      return;
    }

    setCreating(true);
    setCreateMessage(null);
    setError(null);

    try {
      const created = await createProgramWorkflow({
        userId,
        programName: trimmedName,
        structure,
        templateLibraryItemId:
          mode === "template" ? selectedTemplateLibraryItemId || undefined : undefined,
        sportType: "strength",
      });
      setCreateMessage(
        mode === "template"
          ? "已从模板创建训练计划，正在进入详情页..."
          : "已空白创建训练计划（高级模式），正在进入详情页...",
      );
      await loadPrograms();
      router.push(`/programs/${created.programId}`);
    } catch (createError) {
      setCreateMessage(createError instanceof Error ? createError.message : "创建训练计划失败");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-zinc-900">{TERMS_ZH.program}列表</h1>
      <p className="text-sm text-zinc-600">当前用户标识：{userId}</p>
      <div className="text-sm">
        <Link href="/exercise-library" className="text-blue-700 underline">
          先去维护动作库
        </Link>
        <span className="mx-2 text-zinc-400">|</span>
        <Link href="/template-library" className="text-blue-700 underline">
          先去维护模板库
        </Link>
      </div>
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">创建训练计划（模板优先）</p>
        <p className="mt-1 text-xs text-zinc-600">
          默认建议从模板创建计划。空白创建仅用于高级场景，后续需要自行补齐训练结构。
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-zinc-700">
            计划名称
            <input
              type="text"
              value={programName}
              onChange={(event) => setProgramName(event.target.value)}
              className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm"
              placeholder="例如：我的力量训练计划"
            />
          </label>
          <label className="text-sm text-zinc-700">
            基本结构
            <select
              value={structure}
              onChange={(event) => setStructure(event.target.value as "weekly_1_day")}
              className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm"
            >
              <option value="weekly_1_day">一周 1 个训练日（推荐）</option>
            </select>
          </label>
          <label className="text-sm text-zinc-700">
            选择模板（主入口）
            <select
              value={selectedTemplateLibraryItemId}
              onChange={(event) => setSelectedTemplateLibraryItemId(event.target.value)}
              className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm"
            >
              {templateLibraryItems.length === 0 ? (
                <option value="">当前无可用模板</option>
              ) : null}
              {templateLibraryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={creating || templateLibraryItems.length === 0 || !selectedTemplateLibraryItemId}
            onClick={() => void handleCreateProgram("template")}
            className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {creating ? "创建中..." : "从模板创建计划"}
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreateProgram("blank")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700 disabled:opacity-60"
          >
            空白创建计划（高级）
          </button>
        </div>
        {templateLibraryItems.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-600">
            当前没有可用模板，主入口已置灰。请先去
            <Link href="/template-library" className="mx-1 text-blue-700 underline">
              模板库
            </Link>
            创建并启用模板。
          </p>
        ) : null}
        {createMessage ? <p className="mt-2 text-sm text-zinc-700">{createMessage}</p> : null}
      </div>

      {loading ? (
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="animate-pulse rounded-md border border-zinc-200 bg-white p-4">
              <div className="h-4 w-48 rounded bg-zinc-200" />
              <div className="mt-2 h-3 w-64 rounded bg-zinc-100" />
              <div className="mt-2 h-3 w-56 rounded bg-zinc-100" />
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <ul className="space-y-3">
          {programs.map((program) => (
            <li key={program.id} className="rounded-md border border-zinc-200 bg-white p-4">
              <p className="text-base font-medium text-zinc-900">{program.name}</p>
              <p className="mt-1 text-sm text-zinc-600">
                运动类型：{getSportTypeLabel(program.sport_type)} | 状态：{getProgramStatusLabel(program.status)}
              </p>
              <p className="mt-1 text-sm text-zinc-600">开始日期：{new Date(program.start_date).toLocaleDateString()}</p>
              <p className="mt-1 text-sm text-zinc-600">
                可用于生成的训练日模板：{program.enabled_session_template_with_units_count}/{program.session_template_count}
              </p>
              <p
                className={`mt-1 text-xs font-medium ${
                  program.planning_ready ? "text-green-700" : "text-amber-700"
                }`}
              >
                {program.planning_ready
                  ? "已就绪：可以生成已安排训练"
                  : "当前训练计划未就绪：缺少启用的训练日模板或训练单元模板"}
              </p>
              <div className="mt-3 flex gap-3 text-sm">
                <Link className="text-blue-700 underline" href={`/programs/${program.id}`}>
                  查看详情
                </Link>
                <Link className="text-blue-700 underline" href={`/programs/${program.id}/planned-sessions`}>
                  已安排训练
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && !error && programs.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          暂无训练计划。请先使用上方入口创建计划，再进入详情配置动作并排期。
        </p>
      ) : null}
    </section>
  );
}
