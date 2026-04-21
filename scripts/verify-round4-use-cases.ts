import {
  createProgramUseCase,
  createSessionExecutionUseCase,
  createUnitExecutionsUseCase,
  generatePlannedSessionsUseCase,
  getProgramDetailUseCase,
  listPlannedSessionsUseCase,
  markPlannedSessionStatusUseCase,
} from "../src/server/use-cases";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";
const SEED_GOAL_ID = "10000000-0000-0000-0000-000000000001";
const SEED_PROGRAM_ID = "20000000-0000-0000-0000-000000000001";

async function main() {
  const createdProgram = await createProgramUseCase({
    userId: SEED_USER_ID,
    goalId: SEED_GOAL_ID,
    name: `Round4 Minimal Program ${Date.now()}`,
    sportType: "mixed",
    startDate: new Date("2026-04-01"),
    durationWeeks: 8,
  });

  const programDetail = await getProgramDetailUseCase({
    userId: SEED_USER_ID,
    programId: SEED_PROGRAM_ID,
  });

  const generatedSessions = await generatePlannedSessionsUseCase({
    userId: SEED_USER_ID,
    programId: SEED_PROGRAM_ID,
    startDate: new Date("2026-04-10"),
    sessionCount: 2,
  });

  const listedSessions = await listPlannedSessionsUseCase({
    userId: SEED_USER_ID,
    programId: SEED_PROGRAM_ID,
    dateFrom: new Date("2026-04-10"),
    dateTo: new Date("2026-04-30"),
  });

  const targetSession = generatedSessions[0];
  const createdSessionExecution = await createSessionExecutionUseCase({
    userId: SEED_USER_ID,
    plannedSessionId: targetSession.id,
    completionStatus: "partial",
    performedAt: new Date(),
    actualDurationMin: 62,
  });

  const createdUnitExecutions = await createUnitExecutionsUseCase({
    userId: SEED_USER_ID,
    sessionExecutionId: createdSessionExecution.sessionExecution.id,
    unitExecutions: targetSession.planned_units.map((unit, index) => ({
      plannedUnitId: unit.id,
      completionStatus: index === 0 ? "completed" : "partial",
      actualPayload: {
        note: "minimal verify",
      },
    })),
  });

  const markedSession = await markPlannedSessionStatusUseCase({
    userId: SEED_USER_ID,
    plannedSessionId: targetSession.id,
    status: "completed",
  });

  console.log(
    JSON.stringify(
      {
        createdProgramId: createdProgram.id,
        detailBlockCount: programDetail.blocks.length,
        generatedSessionCount: generatedSessions.length,
        listedSessionCount: listedSessions.length,
        createdSessionExecutionId: createdSessionExecution.sessionExecution.id,
        createdUnitExecutionCount: createdUnitExecutions.length,
        markedSessionStatus: markedSession?.status,
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
