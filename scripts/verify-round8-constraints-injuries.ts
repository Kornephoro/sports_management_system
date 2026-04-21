import { createConstraintProfileUseCase } from "../src/server/use-cases/constraints/create-constraint-profile.use-case";
import { linkInjuryIncidentToConstraintUseCase } from "../src/server/use-cases/constraints/link-injury-incident-to-constraint.use-case";
import { listActiveConstraintsUseCase } from "../src/server/use-cases/constraints/list-active-constraints.use-case";
import { resolveConstraintProfileUseCase } from "../src/server/use-cases/constraints/resolve-constraint-profile.use-case";
import { createInjuryIncidentUseCase } from "../src/server/use-cases/injuries/create-injury-incident.use-case";
import { listInjuryIncidentsUseCase } from "../src/server/use-cases/injuries/list-injury-incidents.use-case";
import { generatePlannedSessionsUseCase } from "../src/server/use-cases/sessions/generate-planned-sessions.use-case";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";
const SEED_PROGRAM_ID = "20000000-0000-0000-0000-000000000001";

async function main() {
  const createdInjury = await createInjuryIncidentUseCase({
    userId: SEED_USER_ID,
    title: `Round8 Injury ${Date.now()}`,
    incidentType: "pain",
    status: "acute",
    bodyRegionTags: ["knee"],
    movementContextTags: ["squat_pattern"],
    painLevelInitial: 5,
    symptomSummary: "round8 verify symptom",
    currentRestrictions: ["deep_knee_flexion"],
  });

  const createdConstraint = await createConstraintProfileUseCase({
    userId: SEED_USER_ID,
    title: `Round8 Constraint ${Date.now()}`,
    domain: "pain",
    severity: "high",
    bodyRegionTags: ["knee"],
    movementTags: ["squat_pattern"],
    restrictionRules: {
      avoid_patterns: ["barbell_back_squat_primary"],
    },
    trainingImplications: {
      reduce_volume_percent: 20,
    },
    rehabFocusTags: ["knee_control"],
    notes: "round8 verify constraint",
  });

  const linkedConstraint = await linkInjuryIncidentToConstraintUseCase({
    userId: SEED_USER_ID,
    constraintProfileId: createdConstraint.id,
    injuryIncidentId: createdInjury.id,
  });

  const generatedSessions = await generatePlannedSessionsUseCase({
    userId: SEED_USER_ID,
    programId: SEED_PROGRAM_ID,
    startDate: new Date("2026-06-01"),
    sessionCount: 1,
  });

  const generatedUnits = generatedSessions[0]?.planned_units ?? [];
  const affectedUnits = generatedUnits.filter((unit) => {
    const snapshot = unit.constraint_snapshot as { affected?: boolean } | null;
    return !!snapshot?.affected;
  });

  await resolveConstraintProfileUseCase({
    userId: SEED_USER_ID,
    constraintProfileId: createdConstraint.id,
    notes: "round8 verify resolve",
  });

  const [activeConstraints, injuries] = await Promise.all([
    listActiveConstraintsUseCase({
      userId: SEED_USER_ID,
      limit: 100,
    }),
    listInjuryIncidentsUseCase({
      userId: SEED_USER_ID,
      limit: 100,
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        createdConstraintId: createdConstraint.id,
        linkedInjuryId: linkedConstraint.linked_injury_incident_id,
        generatedSessionCount: generatedSessions.length,
        affectedUnitCount: affectedUnits.length,
        createdConstraintStillActive: activeConstraints.some((item) => item.id === createdConstraint.id),
        injuryListed: injuries.some((item) => item.id === createdInjury.id),
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
