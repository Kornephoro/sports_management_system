"use client";

import {
  CLASSIC_PROGRESSION_STRATEGIES,
  getClassicProgressionStrategyByPolicyType,
} from "@/features/progression/progression-strategy-catalog";

type ProgressionStrategyPickerProps = {
  selectedPolicyType: string;
  disabled?: boolean;
  onSelect: (policyType: string) => void;
  onOpenInfo: (policyType: string) => void;
};

export function ProgressionStrategyPicker({
  selectedPolicyType,
  disabled = false,
  onSelect,
  onOpenInfo,
}: ProgressionStrategyPickerProps) {
  const selectedClassic = getClassicProgressionStrategyByPolicyType(selectedPolicyType);

  return (
    <div className="space-y-2 rounded border border-zinc-200 bg-white p-3">
      <div>
        <p className="text-xs font-semibold text-zinc-900">进步策略 / Progression Strategy</p>
        <p className="mt-1 text-[11px] text-zinc-600">
          策略挂在当前动作槽位上，同一动作在不同模板或不同计划中可使用不同策略。
        </p>
      </div>

      <div className="space-y-2">
        {CLASSIC_PROGRESSION_STRATEGIES.map((strategy) => {
          const selected = selectedPolicyType === strategy.policyType;
          return (
            <div
              key={strategy.id}
              className={`flex items-center justify-between rounded border px-2 py-2 text-xs ${
                selected ? "border-blue-300 bg-blue-50" : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <label className="flex cursor-pointer items-center gap-2 text-zinc-800">
                <input
                  type="radio"
                  name="progression_strategy"
                  value={strategy.policyType}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onSelect(strategy.policyType)}
                />
                <span>
                  {strategy.labelZh} / {strategy.labelEn}
                </span>
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onOpenInfo(strategy.policyType)}
                className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 disabled:opacity-60"
              >
                说明
              </button>
            </div>
          );
        })}
      </div>

      {!selectedClassic ? (
        <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          当前槽位使用的是历史策略键（{selectedPolicyType}）。选择上方任一策略后将切换为标准策略。
        </p>
      ) : null}
    </div>
  );
}

