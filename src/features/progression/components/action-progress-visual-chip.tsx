import { buildActionProgressVisualState } from "@/features/progression/progression-visual-state";
import { getProgressVisualTone } from "@/features/shared/training-semantic-ui";

type ActionProgressVisualChipProps = {
  snapshot: unknown;
  maxFieldChanges?: number;
  dense?: boolean;
  showReason?: boolean;
  showStatusEnglish?: boolean;
};

export function ActionProgressVisualChip({
  snapshot,
  maxFieldChanges = 2,
  dense = false,
  showReason = true,
  showStatusEnglish = false,
}: ActionProgressVisualChipProps) {
  const visual = buildActionProgressVisualState(snapshot, { maxFieldChanges });
  const tone = getProgressVisualTone(visual.status);

  return (
    <div className={dense ? "space-y-1" : "space-y-1.5"}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${visual.statusClassName}`}>
          {showStatusEnglish ? `${visual.statusLabel} / ${visual.statusLabelEn}` : visual.statusLabel}
        </span>

        {visual.fieldChanges.map((change) => (
          <span
            key={`${change.field}-${change.summary}`}
            className={`rounded border px-2 py-0.5 text-[11px] ${tone.detailChipClassName}`}
          >
            {change.summary}
          </span>
        ))}

        {visual.forecastLabel && visual.forecastClassName ? (
          <span className={`rounded px-2 py-0.5 text-[11px] ${visual.forecastClassName}`}>
            {visual.forecastLabel}
          </span>
        ) : null}

        {visual.sourceHintLabel && visual.sourceHintClassName ? (
          <span className={`rounded px-2 py-0.5 text-[11px] ${visual.sourceHintClassName}`}>
            {visual.sourceHintLabel}
          </span>
        ) : null}

        {visual.assistHints.map((hint) => (
          <span key={hint.key} className={`rounded px-2 py-0.5 text-[11px] ${hint.className}`}>
            {hint.label}
          </span>
        ))}
      </div>

      {showReason ? (
        <p className="text-[11px] text-zinc-600">
          原因：{visual.reason}
        </p>
      ) : null}
    </div>
  );
}
