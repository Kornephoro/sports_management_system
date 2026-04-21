"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  generateRecoveryAiSummary,
  getOpenAiSettings,
  saveOpenAiSettings,
  testOpenAiSettings,
} from "@/features/me/me-api";
import { AppCard, InlineAlert, PageContainer, PageHeader } from "@/features/shared/components/ui-primitives";
import { ThemeSwitcherClientOnly } from "@/features/shared/components/theme-switcher-client-only";

type MePageClientProps = {
  userId: string;
};

type OpenAiFormState = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

function GroupTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-black tracking-tight text-zinc-950 dark:text-zinc-50">{title}</h2>
      {description ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p> : null}
    </div>
  );
}

function MenuRow({
  title,
  description,
  href,
  badge,
}: {
  title: string;
  description: string;
  href?: string;
  badge?: string;
}) {
  const content = (
    <>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">{title}</p>
          {badge ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      <span className="shrink-0 text-zinc-300 dark:text-zinc-600">›</span>
    </>
  );

  if (!href) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[1.4rem] border border-dashed border-zinc-200 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/30">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-[1.4rem] border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950"
    >
      {content}
    </Link>
  );
}

function toneToClasses(state: "idle" | "ok" | "error") {
  if (state === "ok") return "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800/50";
  if (state === "error") return "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/30 dark:border-red-800/50";
  return "text-zinc-600 bg-zinc-50 border-zinc-200 dark:text-zinc-300 dark:bg-zinc-950/40 dark:border-zinc-800";
}

export function MePageClient({ userId }: MePageClientProps) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<OpenAiFormState>({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4.1-mini",
  });
  const [savedMeta, setSavedMeta] = useState<{
    configured: boolean;
    hasApiKey: boolean;
    apiKeyMasked: string | null;
    updatedAt: string | null;
  }>({
    configured: false,
    hasApiKey: false,
    apiKeyMasked: null,
    updatedAt: null,
  });
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sampleRunning, setSampleRunning] = useState(false);
  const [sampleResult, setSampleResult] = useState<{ state: "idle" | "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getOpenAiSettings(userId);
        if (cancelled) return;
        setForm((current) => ({
          ...current,
          baseUrl: result.baseUrl,
          model: result.model,
        }));
        setSavedMeta({
          configured: result.configured,
          hasApiKey: result.hasApiKey,
          apiKeyMasked: result.apiKeyMasked,
          updatedAt: result.updatedAt,
        });
      } catch (error) {
        if (cancelled) return;
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "加载 OpenAI 配置失败",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const savedAtLabel = useMemo(() => {
    if (!savedMeta.updatedAt) return null;
    return new Date(savedMeta.updatedAt).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [savedMeta.updatedAt]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const result = await saveOpenAiSettings({
        userId,
        baseUrl: form.baseUrl,
        model: form.model,
        apiKey: form.apiKey,
      });
      setSavedMeta({
        configured: result.configured,
        hasApiKey: result.hasApiKey,
        apiKeyMasked: result.apiKeyMasked,
        updatedAt: result.updatedAt,
      });
      setForm((current) => ({ ...current, apiKey: "" }));
      setMessage({ tone: "success", text: "OpenAI 接口配置已保存。" });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "保存 OpenAI 配置失败",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);
    try {
      const result = await testOpenAiSettings({
        userId,
        baseUrl: form.baseUrl,
        model: form.model,
        apiKey: form.apiKey,
      });
      setMessage({
        tone: "success",
        text: `接口测试成功：${result.message}`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "接口测试失败",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleRunSample() {
    setSampleRunning(true);
    setSampleResult(null);
    try {
      const result = await generateRecoveryAiSummary(userId);
      setSampleResult({
        state: "ok",
        text: `${result.label} · ${result.summary}`,
      });
    } catch (error) {
      setSampleResult({
        state: "error",
        text: error instanceof Error ? error.message : "示例调用失败",
      });
    } finally {
      setSampleRunning(false);
    }
  }

  return (
    <PageContainer className="space-y-6 py-8">
      <PageHeader title="我的" description="把设置、AI 接口和低频系统入口收在一个地方，不打扰训练主流程。" />

      {message ? <InlineAlert tone={message.tone}>{message.text}</InlineAlert> : null}

      <AppCard className="space-y-4">
        <GroupTitle title="显示与提醒" description="先把高频会碰到的系统级设置收在这里。" />
        <div className="rounded-[1.4rem] border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">显示主题</p>
              <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                当前先把明暗主题放到“我的”里，减少训练页上的干扰。
              </p>
            </div>
            <ThemeSwitcherClientOnly />
          </div>
        </div>
        <MenuRow
          title="提醒与通知"
          description="训练提醒、恢复提醒、周期结束提醒会放进这里统一管理。"
          badge="即将支持"
        />
      </AppCard>

      <AppCard className="space-y-4">
        <GroupTitle title="AI 与 API" description="先把 OpenAI 的 base_URL、API Key 和模型接进来，并支持真实测试。" />

        <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">OpenAI 兼容接口</p>
              <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                这套配置会直接被身体页的 AI 恢复判断调用。后面再扩到计划包生成和动作基准助手。
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              已接入
            </span>
          </div>

          <form className="mt-4 space-y-4" onSubmit={handleSave}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Base URL</span>
              <input
                value={form.baseUrl}
                onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
                disabled={loading || saving || testing}
                className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="https://api.openai.com/v1"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Model</span>
              <input
                value={form.model}
                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                disabled={loading || saving || testing}
                className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="gpt-4.1-mini"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">API Key</span>
              <input
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                disabled={loading || saving || testing}
                className="w-full rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder={savedMeta.apiKeyMasked ? `已保存：${savedMeta.apiKeyMasked}` : "sk-..."}
              />
            </label>

            <div className="rounded-[1.2rem] border border-dashed border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-400">
              {savedMeta.hasApiKey
                ? "如果这次不想改 API Key，可以留空保存，系统会继续沿用当前已保存的密钥。"
                : "当前还没有保存过 API Key，第一次保存时需要把密钥填上。"}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={loading || saving}
                className="min-w-[120px] rounded-[1.25rem] bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-blue-500 dark:hover:bg-blue-400 dark:disabled:bg-zinc-800"
              >
                {saving ? "保存中..." : "保存配置"}
              </button>
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={loading || testing}
                className="min-w-[120px] rounded-[1.25rem] border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-700 transition hover:border-zinc-300 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
              >
                {testing ? "测试中..." : "测试连接"}
              </button>
            </div>
          </form>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.25rem] bg-zinc-50/80 p-4 dark:bg-zinc-900/60">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">当前状态</p>
              <p className="mt-2 text-lg font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                {savedMeta.configured ? "已配置" : "未配置"}
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                {savedMeta.hasApiKey
                  ? `已保存密钥 ${savedMeta.apiKeyMasked ?? ""}`
                  : "保存后才能在身体页调用 AI 恢复判断。"}
              </p>
            </div>
            <div className="rounded-[1.25rem] bg-zinc-50/80 p-4 dark:bg-zinc-900/60">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">最近更新时间</p>
              <p className="mt-2 text-lg font-black tracking-tight text-zinc-950 dark:text-zinc-50">
                {savedAtLabel ?? "-"}
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                这里保存的是当前用户的本地接口设置。
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[1.25rem] border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-bold text-zinc-950 dark:text-zinc-50">示例调用</p>
                <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  直接调用身体页的 AI 恢复判断接口，确认配置不只是能存，还能真的被页面使用。
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRunSample()}
                disabled={sampleRunning || !savedMeta.hasApiKey}
                className="rounded-[1.1rem] border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:border-zinc-300 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {sampleRunning ? "调用中..." : "试跑一次"}
              </button>
            </div>

            {sampleResult ? (
              <div className={`mt-3 rounded-[1.1rem] border px-3 py-3 text-xs leading-5 ${toneToClasses(sampleResult.state)}`}>
                {sampleResult.text}
              </div>
            ) : null}
          </div>
        </div>
      </AppCard>

      <AppCard className="space-y-4">
        <GroupTitle title="数据与资料" description="归档、素材和长期数据入口适合放在低频的个人页里。" />
        <MenuRow
          title="首次训练画像"
          description="维护会喂给 AI 的基础训练分级、器械环境、限制与动作熟练度。"
          href="/me/training-profile"
        />
        <MenuRow
          title="周期档案"
          description="按中周期回看历史训练阶段、减载记录和阶段归档。"
          href="/training/cycles"
        />
        <MenuRow
          title="资产"
          description="常用素材、附件与资源入口，避免继续挤占底栏。"
          href="/assets"
        />
        <MenuRow
          title="导入、导出与备份"
          description="后续会把数据导出、备份和恢复入口放在这里。"
          badge="即将支持"
        />
      </AppCard>

      <AppCard className="space-y-4">
        <GroupTitle title="实验与帮助" description="把未来准备扩展的东西集中收口，避免主页面过满。" />
        <MenuRow
          title="未来功能"
          description="查看准备加入的 AI 助手、恢复系统和更完整的分析入口。"
          badge="路线图"
        />
        <MenuRow
          title="帮助与说明"
          description="后续会在这里补功能说明、AI 使用方式和更新日志。"
          badge="即将支持"
        />
      </AppCard>
    </PageContainer>
  );
}
