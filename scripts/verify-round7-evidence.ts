import {
  confirmParsedEvidenceUseCase,
  listEvidenceAssetsUseCase,
  rejectParsedEvidenceUseCase,
  triggerEvidenceMockParseUseCase,
  updateEvidenceParseStatusUseCase,
  uploadEvidenceUseCase,
} from "../src/server/use-cases";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  const bytes1 = new TextEncoder().encode("round7-evidence-verify-confirm");
  const uploaded1 = await uploadEvidenceUseCase({
    userId: SEED_USER_ID,
    fileName: "round7-confirm.txt",
    mimeType: "text/plain",
    bytes: bytes1,
    domainHint: "body_metric",
    sourceApp: "verify-script",
  });

  const parsed1 = await triggerEvidenceMockParseUseCase({
    userId: SEED_USER_ID,
    evidenceAssetId: uploaded1.id,
    targetStatus: "parsed",
  });

  const confirmed1 = await confirmParsedEvidenceUseCase({
    userId: SEED_USER_ID,
    evidenceAssetId: parsed1.id,
  });

  const bytes2 = new TextEncoder().encode("round7-evidence-verify-reject");
  const uploaded2 = await uploadEvidenceUseCase({
    userId: SEED_USER_ID,
    fileName: "round7-reject.txt",
    mimeType: "text/plain",
    bytes: bytes2,
    domainHint: "health",
    sourceApp: "verify-script",
  });

  const failed2 = await updateEvidenceParseStatusUseCase({
    userId: SEED_USER_ID,
    evidenceAssetId: uploaded2.id,
    parseStatus: "failed",
  });

  const pending2 = await updateEvidenceParseStatusUseCase({
    userId: SEED_USER_ID,
    evidenceAssetId: failed2.id,
    parseStatus: "pending",
  });

  const needsReview2 = await triggerEvidenceMockParseUseCase({
    userId: SEED_USER_ID,
    evidenceAssetId: pending2.id,
    targetStatus: "needs_review",
  });

  const rejected2 = await rejectParsedEvidenceUseCase({
    userId: SEED_USER_ID,
    evidenceAssetId: needsReview2.id,
    reason: "round7 verify reject",
  });

  const evidenceList = await listEvidenceAssetsUseCase({
    userId: SEED_USER_ID,
    limit: 10,
  });

  console.log(
    JSON.stringify(
      {
        uploadedEvidenceIds: [uploaded1.id, uploaded2.id],
        confirmedEvidenceStatus: confirmed1.evidence.parse_status,
        confirmedLinkedEntityType: confirmed1.evidence.linked_entity_type,
        confirmedObservationId: confirmed1.observation.id,
        rejectedEvidenceStatus: rejected2.parse_status,
        latestEvidenceCount: evidenceList.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
