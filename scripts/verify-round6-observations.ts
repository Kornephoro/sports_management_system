import {
  createObservationUseCase,
  getLatestObservationSummaryUseCase,
  listObservationsByMetricUseCase,
} from "../src/server/use-cases";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  const createdBodyweight = await createObservationUseCase({
    userId: SEED_USER_ID,
    observedAt: new Date(),
    observationDomain: "body",
    metricKey: "bodyweight",
    valueNumeric: 72.4,
    unit: "kg",
    source: "manual",
    notes: "round6 verify bodyweight",
  });

  const createdSleep = await createObservationUseCase({
    userId: SEED_USER_ID,
    observedAt: new Date(),
    observationDomain: "recovery",
    metricKey: "sleep_hours",
    valueNumeric: 7.3,
    unit: "hour",
    source: "manual",
    notes: "round6 verify sleep",
  });

  const createdFatigue = await createObservationUseCase({
    userId: SEED_USER_ID,
    observedAt: new Date(),
    observationDomain: "recovery",
    metricKey: "fatigue_score",
    valueNumeric: 4,
    unit: "score",
    source: "manual",
    notes: "round6 verify fatigue",
  });

  const bodyweightRecords = await listObservationsByMetricUseCase({
    userId: SEED_USER_ID,
    metricKey: "bodyweight",
    limit: 5,
  });

  const summary = await getLatestObservationSummaryUseCase({
    userId: SEED_USER_ID,
    metricKeys: ["bodyweight", "sleep_hours", "fatigue_score"],
  });

  console.log(
    JSON.stringify(
      {
        createdIds: [createdBodyweight.id, createdSleep.id, createdFatigue.id],
        bodyweightRecordCount: bodyweightRecords.length,
        summaryMetrics: summary.latestByMetric.map((item) => ({
          metricKey: item.metricKey,
          hasLatest: !!item.latest,
        })),
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
