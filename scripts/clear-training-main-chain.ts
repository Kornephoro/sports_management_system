import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function countTrainingChain() {
  const [
    goalCount,
    programCount,
    blockCount,
    sessionTemplateCount,
    trainingUnitTemplateCount,
    progressTrackCount,
    plannedSessionCount,
    plannedUnitCount,
    sessionExecutionCount,
    unitExecutionCount,
  ] = await Promise.all([
    prisma.goal.count(),
    prisma.program.count(),
    prisma.block.count(),
    prisma.sessionTemplate.count(),
    prisma.trainingUnitTemplate.count(),
    prisma.progressTrack.count(),
    prisma.plannedSession.count(),
    prisma.plannedUnit.count(),
    prisma.sessionExecution.count(),
    prisma.unitExecution.count(),
  ]);

  return {
    goalCount,
    programCount,
    blockCount,
    sessionTemplateCount,
    trainingUnitTemplateCount,
    progressTrackCount,
    plannedSessionCount,
    plannedUnitCount,
    sessionExecutionCount,
    unitExecutionCount,
  };
}

async function main() {
  const before = await countTrainingChain();
  const observationUnlink = await prisma.observation.updateMany({
    where: {
      OR: [
        {
          linked_program_id: {
            not: null,
          },
        },
        {
          linked_session_execution_id: {
            not: null,
          },
        },
      ],
    },
    data: {
      linked_program_id: null,
      linked_session_execution_id: null,
    },
  });

  const injuryUnlink = await prisma.injuryIncident.updateMany({
    where: {
      OR: [
        {
          linked_session_execution_id: {
            not: null,
          },
        },
        {
          linked_unit_execution_id: {
            not: null,
          },
        },
      ],
    },
    data: {
      linked_session_execution_id: null,
      linked_unit_execution_id: null,
    },
  });

  const deletedUnitExecutions = await prisma.unitExecution.deleteMany({});
  const deletedSessionExecutions = await prisma.sessionExecution.deleteMany({});
  const deletedPlannedUnits = await prisma.plannedUnit.deleteMany({});
  const deletedPlannedSessions = await prisma.plannedSession.deleteMany({});
  const deletedTrainingUnitTemplates = await prisma.trainingUnitTemplate.deleteMany({});
  const deletedSessionTemplates = await prisma.sessionTemplate.deleteMany({});
  const deletedBlocks = await prisma.block.deleteMany({});
  const deletedProgressTracks = await prisma.progressTrack.deleteMany({});
  const deletedPrograms = await prisma.program.deleteMany({});
  const deletedGoals = await prisma.goal.deleteMany({});

  const result = {
    unlinkedObservationCount: observationUnlink.count,
    unlinkedInjuryIncidentCount: injuryUnlink.count,
    deletedUnitExecutionCount: deletedUnitExecutions.count,
    deletedSessionExecutionCount: deletedSessionExecutions.count,
    deletedPlannedUnitCount: deletedPlannedUnits.count,
    deletedPlannedSessionCount: deletedPlannedSessions.count,
    deletedTrainingUnitTemplateCount: deletedTrainingUnitTemplates.count,
    deletedSessionTemplateCount: deletedSessionTemplates.count,
    deletedBlockCount: deletedBlocks.count,
    deletedProgressTrackCount: deletedProgressTracks.count,
    deletedProgramCount: deletedPrograms.count,
    deletedGoalCount: deletedGoals.count,
  };

  const after = await countTrainingChain();

  console.log(
    JSON.stringify(
      {
        runner: "db:clear:training",
        message: "训练主链数据已清空，且未自动重新灌入训练种子数据。",
        before,
        result,
        after,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    if (error instanceof Error && error.message.includes("Can't reach database server")) {
      console.error("清空失败：当前数据库不可达，请先确认网络/TLS/数据库连接后重试。");
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
