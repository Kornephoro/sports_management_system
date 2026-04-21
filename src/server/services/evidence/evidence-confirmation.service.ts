import { EvidenceAsset, ObservationDomain } from "@prisma/client";
import { z } from "zod";

const SuggestedObservationSchema = z.object({
  observation_domain: z.nativeEnum(ObservationDomain),
  metric_key: z.string().min(1),
  value_numeric: z.number(),
  unit: z.string().min(1),
});

const ParsedSummarySchema = z.object({
  suggested_observation: SuggestedObservationSchema,
});

export function resolveSuggestedObservationFromParsedSummary(asset: EvidenceAsset) {
  const parsed = ParsedSummarySchema.safeParse(asset.parsed_summary);
  if (parsed.success) {
    return parsed.data.suggested_observation;
  }
  return null;
}

export function mergeEvidenceNotes(previousNotes?: string | null, incomingNotes?: string) {
  return [previousNotes, incomingNotes].filter((item): item is string => !!item && item.length > 0).join("\n");
}
