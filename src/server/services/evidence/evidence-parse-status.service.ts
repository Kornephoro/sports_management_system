import { EvidenceParseStatus } from "@prisma/client";

export function canTransitionParseStatus(
  current: EvidenceParseStatus,
  next: EvidenceParseStatus,
): boolean {
  const allowed: Record<EvidenceParseStatus, EvidenceParseStatus[]> = {
    pending: ["parsed", "needs_review", "failed"],
    parsed: ["needs_review"],
    needs_review: ["parsed"],
    confirmed: [],
    rejected: [],
    failed: ["pending"],
  };

  return allowed[current].includes(next);
}

export function canConfirmParsedEvidence(status: EvidenceParseStatus): boolean {
  return status === "parsed" || status === "needs_review";
}

export function canRejectParsedEvidence(status: EvidenceParseStatus): boolean {
  return status === "parsed" || status === "needs_review";
}
