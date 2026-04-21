import { getProgramDetailUseCase } from "../src/server/use-cases/programs/get-program-detail.use-case";
import { getConstraintProfileByIdForUser } from "../src/server/repositories/constraints/constraint.repository";
import { notFoundError, UseCaseError } from "../src/server/use-cases/shared/use-case-error";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";
const NON_EXIST_PROGRAM_ID = "99999999-9999-9999-9999-999999999999";
const NON_EXIST_CONSTRAINT_ID = "88888888-8888-8888-8888-888888888888";

function assertUseCaseNotFound(error: unknown, expectedMessageIncludes: string) {
  if (!(error instanceof UseCaseError)) {
    throw new Error(`Expected UseCaseError, got ${String(error)}`);
  }

  if (error.code !== "NOT_FOUND") {
    throw new Error(`Expected NOT_FOUND code, got ${error.code}`);
  }

  if (!error.message.includes(expectedMessageIncludes)) {
    throw new Error(`Expected error message to include "${expectedMessageIncludes}", got "${error.message}"`);
  }
}

async function verifyProgramNotFoundError() {
  try {
    await getProgramDetailUseCase({
      userId: SEED_USER_ID,
      programId: NON_EXIST_PROGRAM_ID,
    });
    throw new Error("Expected getProgramDetailUseCase to throw NOT_FOUND, but it succeeded");
  } catch (error) {
    assertUseCaseNotFound(error, "Program not found");
  }
}

async function verifyRepositoryNotFoundShape() {
  const constraint = await getConstraintProfileByIdForUser(NON_EXIST_CONSTRAINT_ID, SEED_USER_ID);
  if (constraint !== null) {
    throw new Error("Expected missing constraint profile to return null");
  }
}

async function main() {
  await verifyProgramNotFoundError();
  await verifyRepositoryNotFoundShape();

  const sampleError = notFoundError("sample");
  console.log(
    JSON.stringify(
      {
        programNotFoundValidated: true,
        repositoryNullOnMissingValidated: true,
        sampleUseCaseErrorCode: sampleError.code,
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
