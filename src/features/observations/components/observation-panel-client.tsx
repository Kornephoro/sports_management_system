"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  createObservation,
  getLatestObservationSummary,
  listObservationsByMetric,
  ObservationItem,
} from "@/features/observations/observations-api";
import { getMetricLabel, TERMS_ZH } from "@/features/shared/ui-zh";

type ObservationPanelClientProps = {
  userId: string;
};

type PresetMetric = {
  label: string;
  metricKey: "bodyweight" | "sleep_hours" | "fatigue_score";
  observationDomain: "body" | "recovery";
  unit: string;
};

const PRESET_METRICS: PresetMetric[] = [
  {
    label: "体重",
    metricKey: "bodyweight",
    observationDomain: "body",
    unit: "kg",
  },
  {
    label: "睡眠",
    metricKey: "sleep_hours",
    observationDomain: "recovery",
    unit: "小时",
  },
  {
    label: "疲劳",
    metricKey: "fatigue_score",
    observationDomain: "recovery",
    unit: "分",
  },
];

function defaultObservedAtInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function ObservationPanelClient({ userId }: ObservationPanelClientProps) {
  const [selectedMetric, setSelectedMetric] = useState<PresetMetric>(PRESET_METRICS[0]);
  const [valueNumeric, setValueNumeric] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [observedAt, setObservedAt] = useState(defaultObservedAtInput);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [queryMetricKey, setQueryMetricKey] = useState<string>(PRESET_METRICS[0].metricKey);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [records, setRecords] = useState<ObservationItem[]>([]);

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryItems, setSummaryItems] = useState<Array<{ metricKey: string; latest: ObservationItem | null }>>([]);

  const selectedMetricOptions = useMemo(
    () =>
      PRESET_METRICS.map((metric) => (
        <option key={metric.metricKey} value={metric.metricKey}>
          {metric.label}
        </option>
      )),
    [],
  );

  const loadRecords = useCallback(async (metricKey: string) => {
    setQueryLoading(true);
    setQueryError(null);
    try {
      const data = await listObservationsByMetric(userId, metricKey, 10);
      setRecords(data);
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "加载身体状态记录失败");
    } finally {
      setQueryLoading(false);
    }
  }, [userId]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const summary = await getLatestObservationSummary(userId, PRESET_METRICS.map((metric) => metric.metricKey));
      setSummaryItems(summary.latestByMetric);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "加载最新摘要失败");
    } finally {
      setSummaryLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadRecords(queryMetricKey);
    void loadSummary();
  }, [loadRecords, loadSummary, queryMetricKey]);

  const handleCreateObservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSubmitting(true);
    setSubmitMessage(null);
    setSubmitError(null);

    try {
      const numericValue = Number(valueNumeric);
      await createObservation({
        userId,
        observedAt: new Date(observedAt).toISOString(),
        observationDomain: selectedMetric.observationDomain,
        metricKey: selectedMetric.metricKey,
        valueNumeric: numericValue,
        unit: selectedMetric.unit,
        source: "manual",
        notes: notes || undefined,
      });

      setSubmitMessage(`${selectedMetric.label}记录已提交`);
      setValueNumeric("");
      setNotes("");

      await Promise.all([loadRecords(queryMetricKey), loadSummary()]);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "提交身体状态记录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">{TERMS_ZH.observations}</h1>
      <p className="text-sm text-zinc-600">当前用户标识：{userId}</p>

      <form onSubmit={handleCreateObservation} className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">手动录入（体重 / 睡眠 / 疲劳）</p>

        <label className="block text-sm text-zinc-700">
          指标
          <select
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            value={selectedMetric.metricKey}
            onChange={(event) => {
              const metric = PRESET_METRICS.find((item) => item.metricKey === event.target.value);
              if (metric) {
                setSelectedMetric(metric);
              }
            }}
          >
            {selectedMetricOptions}
          </select>
        </label>

        <label className="block text-sm text-zinc-700">
          数值（{selectedMetric.unit}）
          <input
            type="number"
            step="0.1"
            required
            value={valueNumeric}
            onChange={(event) => setValueNumeric(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        {selectedMetric.metricKey === "fatigue_score" ? (
          <p className="text-xs text-zinc-600">
            疲劳评分建议用 1-10 分，分数越高表示越疲劳；可填整数或一位小数。
          </p>
        ) : null}

        <label className="block text-sm text-zinc-700">
          记录时间
          <input
            type="datetime-local"
            value={observedAt}
            onChange={(event) => setObservedAt(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>

        <label className="block text-sm text-zinc-700">
          备注
          <textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>

        <button type="submit" disabled={submitting} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white">
          {submitting ? "提交中..." : "提交身体状态记录"}
        </button>

        {submitMessage ? <p className="text-sm text-green-700">{submitMessage}</p> : null}
        {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
      </form>

      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">最新状态摘要（最小版）</p>
        {summaryLoading ? <p className="text-sm text-zinc-600">加载中...</p> : null}
        {summaryError ? <p className="text-sm text-red-600">{summaryError}</p> : null}
        {!summaryLoading && !summaryError ? (
          <ul className="space-y-2">
            {summaryItems.map((item) => (
              <li key={item.metricKey} className="text-sm text-zinc-700">
                {getMetricLabel(item.metricKey)}：{" "}
                {item.latest
                  ? `${item.latest.value_numeric ?? item.latest.value_text ?? "-"} ${item.latest.unit ?? ""} @ ${new Date(item.latest.observed_at).toLocaleString()}`
                  : "暂无记录"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">按指标查看最近记录</p>
        <label className="block text-sm text-zinc-700">
          指标
          <select
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            value={queryMetricKey}
            onChange={(event) => setQueryMetricKey(event.target.value)}
          >
            {selectedMetricOptions}
          </select>
        </label>

        {queryLoading ? <p className="text-sm text-zinc-600">加载中...</p> : null}
        {queryError ? <p className="text-sm text-red-600">{queryError}</p> : null}

        {!queryLoading && !queryError ? (
          <ul className="space-y-2">
            {records.map((record) => (
              <li key={record.id} className="rounded border border-zinc-100 bg-zinc-50 p-2 text-sm text-zinc-700">
                {new Date(record.observed_at).toLocaleString()} | {getMetricLabel(record.metric_key)} ={" "}
                {record.value_numeric ?? record.value_text ?? "-"} {record.unit ?? ""}
              </li>
            ))}
          </ul>
        ) : null}

        {!queryLoading && !queryError && records.length === 0 ? (
          <p className="text-sm text-zinc-600">当前指标暂无记录。</p>
        ) : null}
      </div>
    </section>
  );
}
