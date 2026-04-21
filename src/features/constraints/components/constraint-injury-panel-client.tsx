"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  ConstraintProfileItem,
  createConstraint,
  linkConstraintToInjury,
  listActiveConstraints,
  resolveConstraint,
} from "@/features/constraints/constraints-api";
import {
  createInjuryIncident,
  InjuryIncidentItem,
  listInjuryIncidents,
} from "@/features/injuries/injuries-api";
import {
  getConstraintDomainLabel,
  getConstraintSeverityLabel,
  getInjuryStatusLabel,
  getInjuryTypeLabel,
  TERMS_ZH,
} from "@/features/shared/ui-zh";

type ConstraintInjuryPanelClientProps = {
  userId: string;
};

function parseCsvTags(raw: string) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function ConstraintInjuryPanelClient({ userId }: ConstraintInjuryPanelClientProps) {
  const [constraints, setConstraints] = useState<ConstraintProfileItem[]>([]);
  const [injuries, setInjuries] = useState<InjuryIncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [constraintTitle, setConstraintTitle] = useState("");
  const [constraintDomain, setConstraintDomain] = useState<ConstraintProfileItem["domain"]>("pain");
  const [constraintSeverity, setConstraintSeverity] = useState<ConstraintProfileItem["severity"]>("moderate");
  const [constraintBodyTags, setConstraintBodyTags] = useState("");
  const [constraintMovementTags, setConstraintMovementTags] = useState("");
  const [constraintAvoidPatterns, setConstraintAvoidPatterns] = useState("");
  const [constraintDescription, setConstraintDescription] = useState("");

  const [injuryTitle, setInjuryTitle] = useState("");
  const [injuryType, setInjuryType] = useState<InjuryIncidentItem["incident_type"]>("pain");
  const [injuryStatus, setInjuryStatus] = useState<InjuryIncidentItem["status"]>("acute");
  const [injuryBodyTags, setInjuryBodyTags] = useState("");
  const [injuryMovementTags, setInjuryMovementTags] = useState("");
  const [injurySymptomSummary, setInjurySymptomSummary] = useState("");
  const [injuryPainLevel, setInjuryPainLevel] = useState<string>("3");

  const [linkInjuryByConstraint, setLinkInjuryByConstraint] = useState<Record<string, string>>({});
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadingError(null);
    try {
      const [activeConstraints, injuryList] = await Promise.all([
        listActiveConstraints(userId, 50),
        listInjuryIncidents(userId, 50),
      ]);
      setConstraints(activeConstraints);
      setInjuries(injuryList);
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "加载限制因素/伤病事件失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCreateConstraint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitMessage(null);
    setSubmitError(null);
    try {
      const created = await createConstraint({
        userId,
        title: constraintTitle,
        domain: constraintDomain,
        severity: constraintSeverity,
        bodyRegionTags: parseCsvTags(constraintBodyTags),
        movementTags: parseCsvTags(constraintMovementTags),
        description: constraintDescription || undefined,
        restrictionRules: {
          avoid_patterns: parseCsvTags(constraintAvoidPatterns),
        },
      });
      setConstraintTitle("");
      setConstraintBodyTags("");
      setConstraintMovementTags("");
      setConstraintAvoidPatterns("");
      setConstraintDescription("");
      setSubmitMessage(`限制因素已创建：${created.id}`);
      await loadAll();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "创建限制因素失败");
    }
  };

  const handleCreateInjury = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitMessage(null);
    setSubmitError(null);
    try {
      const created = await createInjuryIncident({
        userId,
        title: injuryTitle,
        incidentType: injuryType,
        status: injuryStatus,
        bodyRegionTags: parseCsvTags(injuryBodyTags),
        movementContextTags: parseCsvTags(injuryMovementTags),
        painLevelInitial: injuryPainLevel ? Number(injuryPainLevel) : undefined,
        symptomSummary: injurySymptomSummary || undefined,
      });
      setInjuryTitle("");
      setInjuryBodyTags("");
      setInjuryMovementTags("");
      setInjurySymptomSummary("");
      setInjuryPainLevel("3");
      setSubmitMessage(`伤病事件已创建：${created.id}`);
      await loadAll();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "创建伤病事件失败");
    }
  };

  const handleResolveConstraint = async (constraintId: string) => {
    setActioningId(constraintId);
    setSubmitMessage(null);
    setSubmitError(null);
    try {
      await resolveConstraint(constraintId, userId, "resolved in round8 page");
      setSubmitMessage(`限制因素已解除：${constraintId}`);
      await loadAll();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "解除限制因素失败");
    } finally {
      setActioningId(null);
    }
  };

  const handleLinkInjury = async (constraintId: string) => {
    const injuryId = linkInjuryByConstraint[constraintId];
    if (!injuryId) {
      setSubmitError("请先输入伤病事件编号");
      return;
    }

    setActioningId(constraintId);
    setSubmitMessage(null);
    setSubmitError(null);
    try {
      await linkConstraintToInjury(constraintId, userId, injuryId);
      setSubmitMessage(`限制因素已关联伤病事件：${injuryId}`);
      await loadAll();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "关联伤病事件失败");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">{TERMS_ZH.constraint} / {TERMS_ZH.injury}</h1>
      <p className="text-sm text-zinc-600">当前用户标识：{userId}</p>

      <form onSubmit={handleCreateConstraint} className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">创建限制因素</p>
        <label className="block text-sm text-zinc-700">
          标题
          <input
            required
            value={constraintTitle}
            onChange={(event) => setConstraintTitle(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          领域
          <select
            value={constraintDomain}
            onChange={(event) => setConstraintDomain(event.target.value as ConstraintProfileItem["domain"])}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          >
            <option value="pain">疼痛</option>
            <option value="injury">伤病</option>
            <option value="mobility">活动度</option>
            <option value="stability">稳定性</option>
            <option value="load_tolerance">负荷耐受</option>
            <option value="return_to_training">回归训练</option>
          </select>
        </label>
        <label className="block text-sm text-zinc-700">
          严重程度
          <select
            value={constraintSeverity}
            onChange={(event) => setConstraintSeverity(event.target.value as ConstraintProfileItem["severity"])}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          >
            <option value="low">低</option>
            <option value="moderate">中</option>
            <option value="high">高</option>
          </select>
        </label>
        <label className="block text-sm text-zinc-700">
          身体部位标签（逗号分隔）
          <input
            value={constraintBodyTags}
            onChange={(event) => setConstraintBodyTags(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          动作标签（逗号分隔）
          <input
            value={constraintMovementTags}
            onChange={(event) => setConstraintMovementTags(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          需回避模式（逗号分隔）
          <input
            value={constraintAvoidPatterns}
            onChange={(event) => setConstraintAvoidPatterns(event.target.value)}
            placeholder="例如：深蹲主项"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          说明
          <textarea
            rows={2}
            value={constraintDescription}
            onChange={(event) => setConstraintDescription(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded bg-zinc-900 px-3 py-2 text-sm text-white">
          创建限制因素
        </button>
      </form>

      <form onSubmit={handleCreateInjury} className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">创建伤病事件</p>
        <label className="block text-sm text-zinc-700">
          标题
          <input
            required
            value={injuryTitle}
            onChange={(event) => setInjuryTitle(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          事件类型
          <select
            value={injuryType}
            onChange={(event) => setInjuryType(event.target.value as InjuryIncidentItem["incident_type"])}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          >
            <option value="pain">疼痛</option>
            <option value="strain">肌肉拉伤</option>
            <option value="sprain">扭伤</option>
            <option value="overuse">过度使用</option>
            <option value="mobility_loss">活动度下降</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label className="block text-sm text-zinc-700">
          状态
          <select
            value={injuryStatus}
            onChange={(event) => setInjuryStatus(event.target.value as InjuryIncidentItem["status"])}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          >
            <option value="acute">急性期</option>
            <option value="monitoring">观察中</option>
            <option value="recovering">恢复中</option>
            <option value="resolved">已恢复</option>
            <option value="recurring">反复出现</option>
          </select>
        </label>
        <label className="block text-sm text-zinc-700">
          初始疼痛评分（0-10）
          <input
            type="number"
            min={0}
            max={10}
            value={injuryPainLevel}
            onChange={(event) => setInjuryPainLevel(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          身体部位标签（逗号分隔）
          <input
            value={injuryBodyTags}
            onChange={(event) => setInjuryBodyTags(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          动作场景标签（逗号分隔）
          <input
            value={injuryMovementTags}
            onChange={(event) => setInjuryMovementTags(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          症状摘要
          <textarea
            rows={2}
            value={injurySymptomSummary}
            onChange={(event) => setInjurySymptomSummary(event.target.value)}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded bg-zinc-900 px-3 py-2 text-sm text-white">
          创建伤病事件
        </button>
      </form>

      {submitMessage ? <p className="text-sm text-green-700">{submitMessage}</p> : null}
      {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">生效中的限制因素</p>
        {loading ? <p className="text-sm text-zinc-600">加载中...</p> : null}
        {loadingError ? <p className="text-sm text-red-600">{loadingError}</p> : null}
        {!loading && !loadingError ? (
          <ul className="space-y-3">
            {constraints.map((constraint) => (
              <li key={constraint.id} className="rounded border border-zinc-100 bg-zinc-50 p-3">
                <p className="text-sm font-medium text-zinc-900">
                  {constraint.title}（{getConstraintDomainLabel(constraint.domain)} / {getConstraintSeverityLabel(constraint.severity)}）
                </p>
                <p className="mt-1 text-xs text-zinc-600">限制因素编号：{constraint.id}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  关联伤病事件编号：{constraint.linked_injury_incident_id ?? "-"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={actioningId === constraint.id}
                    onClick={() => void handleResolveConstraint(constraint.id)}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                  >
                    标记已解除
                  </button>
                  <input
                    placeholder="输入伤病事件编号"
                    value={linkInjuryByConstraint[constraint.id] ?? ""}
                    onChange={(event) =>
                      setLinkInjuryByConstraint((prev) => ({
                        ...prev,
                        [constraint.id]: event.target.value,
                      }))
                    }
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                  <button
                    disabled={actioningId === constraint.id}
                    onClick={() => void handleLinkInjury(constraint.id)}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                  >
                    关联伤病事件
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {!loading && !loadingError && constraints.length === 0 ? (
          <p className="text-sm text-zinc-600">暂无生效中的限制因素。</p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">伤病事件列表</p>
        {loading ? <p className="text-sm text-zinc-600">加载中...</p> : null}
        {loadingError ? <p className="text-sm text-red-600">{loadingError}</p> : null}
        {!loading && !loadingError ? (
          <ul className="space-y-2">
            {injuries.map((injury) => (
              <li key={injury.id} className="rounded border border-zinc-100 bg-zinc-50 p-2 text-sm text-zinc-700">
                {injury.title} | {getInjuryStatusLabel(injury.status)} | {getInjuryTypeLabel(injury.incident_type)}
                <div className="mt-1 text-xs text-zinc-600">伤病事件编号：{injury.id}</div>
              </li>
            ))}
          </ul>
        ) : null}
        {!loading && !loadingError && injuries.length === 0 ? (
          <p className="text-sm text-zinc-600">暂无伤病事件。</p>
        ) : null}
      </div>
    </section>
  );
}
