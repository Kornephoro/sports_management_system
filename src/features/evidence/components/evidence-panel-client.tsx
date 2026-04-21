"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  confirmEvidence,
  EvidenceAssetItem,
  listEvidenceAssets,
  rejectEvidence,
  triggerEvidenceMockParse,
  updateEvidenceParseStatus,
  uploadEvidenceFile,
} from "@/features/evidence/evidence-api";
import {
  getEvidenceAssetTypeLabel,
  getEvidenceDomainHintLabel,
  getEvidenceParseStatusLabel,
  TERMS_ZH,
} from "@/features/shared/ui-zh";

type EvidencePanelClientProps = {
  userId: string;
};

const DOMAIN_HINT_OPTIONS: EvidenceAssetItem["domain_hint"][] = [
  "training",
  "body_metric",
  "health",
  "rehab",
  "nutrition",
  "other",
];

export function EvidencePanelClient({ userId }: EvidencePanelClientProps) {
  const [file, setFile] = useState<File | null>(null);
  const [domainHint, setDomainHint] = useState<EvidenceAssetItem["domain_hint"]>("training");
  const [sourceApp, setSourceApp] = useState("网页上传");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [evidenceList, setEvidenceList] = useState<EvidenceAssetItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadEvidence = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (showLoading) {
      setLoadingList(true);
    }

    setListError(null);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await listEvidenceAssets(userId, 30);
        setEvidenceList(data);
        return true;
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    setListError(lastError instanceof Error ? lastError.message : "加载证据列表失败");
    return false;
  }, [userId]);

  useEffect(() => {
    void loadEvidence({ showLoading: true }).finally(() => {
      setLoadingList(false);
    });
  }, [loadEvidence]);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setUploadError("请先选择文件");
      return;
    }

    setUploading(true);
    setUploadMessage(null);
    setUploadError(null);
    setActionError(null);
    setActionMessage(null);

    try {
      const asset = await uploadEvidenceFile({
        userId,
        file,
        domainHint,
        sourceApp: sourceApp || undefined,
        notes: notes || undefined,
      });
      setUploadMessage(`上传成功，证据编号：${asset.id}，状态：${getEvidenceParseStatusLabel(asset.parse_status)}`);
      setFile(null);
      setNotes("");

      const refreshed = await loadEvidence({ showLoading: false });
      if (!refreshed) {
        setActionError("上传成功，但列表刷新失败，请点击“重试加载列表”。");
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const withAction = async (
    evidenceId: string,
    actionLabel: string,
    action: () => Promise<void>,
  ) => {
    setActingId(evidenceId);
    setActionError(null);
    setActionMessage(null);
    setListError(null);

    try {
      await action();
      const refreshed = await loadEvidence({ showLoading: false });
      if (refreshed) {
        setActionMessage(`${actionLabel} 成功`);
      } else {
        setActionError(`${actionLabel} 已执行，但列表刷新失败，请点击“重试加载列表”。`);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `${actionLabel}失败`);
    } finally {
      setActingId(null);
    }
  };

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">{TERMS_ZH.evidence}</h1>
      <p className="text-sm text-zinc-600">当前用户标识：{userId}</p>

      <form onSubmit={handleUpload} className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">上传证据文件</p>
        <label className="block text-sm text-zinc-700">
          文件
          <input
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
        </label>

        <label className="block text-sm text-zinc-700">
          证据类型
          <select
            value={domainHint}
            onChange={(event) => setDomainHint(event.target.value as EvidenceAssetItem["domain_hint"])}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          >
            {DOMAIN_HINT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {getEvidenceDomainHintLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-zinc-700">
          来源应用
          <input
            value={sourceApp}
            onChange={(event) => setSourceApp(event.target.value)}
            placeholder="例如：网页上传"
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

        <button type="submit" disabled={uploading} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white">
          {uploading ? "上传中..." : "上传证据"}
        </button>

        {uploadMessage ? <p className="text-sm text-green-700">{uploadMessage}</p> : null}
        {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}
      </form>

      <div className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium text-zinc-900">证据列表与状态流转</p>

        {loadingList ? <p className="text-sm text-zinc-600">加载中...</p> : null}
        {listError ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
            <p>{listError}</p>
            <button
              type="button"
              className="mt-2 rounded border border-amber-300 px-2 py-1 text-xs"
              onClick={() => void loadEvidence({ showLoading: true }).finally(() => setLoadingList(false))}
            >
              重试加载列表
            </button>
          </div>
        ) : null}
        {actionMessage ? <p className="text-sm text-green-700">{actionMessage}</p> : null}
        {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

        {!loadingList ? (
          <ul className="space-y-3">
            {evidenceList.map((asset) => {
              const working = actingId === asset.id;
              const canMockParse = asset.parse_status === "pending";
              const canConfirmOrReject = asset.parse_status === "parsed" || asset.parse_status === "needs_review";
              const canReset = asset.parse_status === "failed";
              const hasActionButtons = canMockParse || canConfirmOrReject || canReset;

              return (
                <li key={asset.id} className="rounded border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-sm font-medium text-zinc-900">证据编号：{asset.id}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    状态：{getEvidenceParseStatusLabel(asset.parse_status)} | 文件类型：{getEvidenceAssetTypeLabel(asset.asset_type)} | 文件格式（MIME）：{asset.mime_type}
                  </p>
                  <p className="mt-1 break-all text-xs text-zinc-600">存储地址：{asset.storage_url}</p>
                  <p className="mt-1 text-xs text-zinc-600">上传时间：{new Date(asset.uploaded_at).toLocaleString()}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {canMockParse ? (
                      <>
                        <button
                          disabled={working}
                          onClick={() =>
                            void withAction(asset.id, "模拟解析为“已解析”", async () => {
                              await triggerEvidenceMockParse(asset.id, userId, "parsed");
                            })
                          }
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        >
                          模拟解析 -&gt; 已解析
                        </button>
                        <button
                          disabled={working}
                          onClick={() =>
                            void withAction(asset.id, "模拟解析为“待人工复核”", async () => {
                              await triggerEvidenceMockParse(asset.id, userId, "needs_review");
                            })
                          }
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        >
                          模拟解析 -&gt; 待人工复核
                        </button>
                        <button
                          disabled={working}
                          onClick={() =>
                            void withAction(asset.id, "标记为解析失败", async () => {
                              await updateEvidenceParseStatus(asset.id, userId, "failed");
                            })
                          }
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        >
                          标记失败
                        </button>
                      </>
                    ) : null}

                    {canConfirmOrReject ? (
                      <>
                        <button
                          disabled={working}
                          onClick={() =>
                            void withAction(asset.id, "确认证据", async () => {
                              await confirmEvidence(asset.id, userId);
                            })
                          }
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        >
                          确认（写入身体状态记录）
                        </button>
                        <button
                          disabled={working}
                          onClick={() =>
                            void withAction(asset.id, "驳回证据", async () => {
                              await rejectEvidence(asset.id, userId, "页面手动驳回");
                            })
                          }
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                        >
                          驳回
                        </button>
                      </>
                    ) : null}

                    {canReset ? (
                      <button
                        disabled={working}
                        onClick={() =>
                          void withAction(asset.id, "重置为待解析", async () => {
                            await updateEvidenceParseStatus(asset.id, userId, "pending");
                          })
                        }
                        className="rounded border border-zinc-300 px-2 py-1 text-xs"
                      >
                        重置 -&gt; 待解析
                      </button>
                    ) : null}

                    {!hasActionButtons ? (
                      <p className="text-xs text-zinc-500">
                        当前状态为终态（{getEvidenceParseStatusLabel(asset.parse_status)}），无可执行动作。
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {!loadingList && evidenceList.length === 0 ? (
          <p className="text-sm text-zinc-600">暂无证据，请先上传一个文件开始。</p>
        ) : null}
      </div>
    </section>
  );
}
