import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type VerifyTask = {
  id: string;
  script: string;
  description: string;
};

type VerifyTaskResult = {
  id: string;
  success: boolean;
  output: string;
  exitCode: number | null;
  durationMs: number;
  spawnError: string | null;
};

type VerifySummary = {
  runner: "verify:v1";
  generatedAt: string;
  passed: boolean;
  failedTaskId: string | null;
  taskCount: number;
  completedCount: number;
  tasks: Array<{
    id: string;
    description: string;
    success: boolean;
    exitCode: number | null;
    durationMs: number;
    failureOutput?: string;
    spawnError?: string;
  }>;
  runnerError?: string;
};

const TASKS: VerifyTask[] = [
  {
    id: "round4",
    script: "scripts/verify-round4-use-cases.ts",
    description: "Program/PlannedSession/SessionExecution main chain",
  },
  {
    id: "round6",
    script: "scripts/verify-round6-observations.ts",
    description: "Observation minimal loop",
  },
  {
    id: "round7",
    script: "scripts/verify-round7-evidence.ts",
    description: "Evidence upload + mock parse + confirm/reject",
  },
  {
    id: "round8",
    script: "scripts/verify-round8-constraints-injuries.ts",
    description: "Constraint/Injury + minimal constraint-aware planning",
  },
  {
    id: "round9-errors",
    script: "scripts/verify-round9-error-paths.ts",
    description: "Minimal error-path checks",
  },
  {
    id: "round32-progression",
    script: "scripts/verify-round32-progression.ts",
    description: "Progression minimal runnable strategy set",
  },
  {
    id: "round33-progression-exceptions",
    script: "scripts/verify-round33.ts",
    description: "Progression periodization + exception handling baseline",
  },
];

function loadEnvLocalIfExists() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function getSummaryFilePath() {
  const configured = process.env.VERIFY_V1_SUMMARY_FILE?.trim();
  if (configured) {
    return resolve(process.cwd(), configured);
  }

  return resolve(process.cwd(), "artifacts/verify-v1-summary.json");
}

function writeSummaryToFile(summary: VerifySummary, summaryFilePath: string) {
  mkdirSync(dirname(summaryFilePath), { recursive: true });
  writeFileSync(summaryFilePath, JSON.stringify(summary, null, 2) + "\n", "utf-8");
  console.log(`[verify:v1] SUMMARY_FILE ${summaryFilePath}`);
}

async function runTask(task: VerifyTask, extraEnv: Record<string, string>) {
  return new Promise<VerifyTaskResult>((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ["--import", "tsx", task.script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (resolved) {
        return;
      }

      resolved = true;
      resolvePromise({
        id: task.id,
        success: false,
        output: (stdout + stderr).trim(),
        exitCode: null,
        durationMs: Date.now() - startedAt,
        spawnError: String(error),
      });
    });

    child.on("close", (code) => {
      if (resolved) {
        return;
      }

      resolved = true;
      const success = code === 0;
      resolvePromise({
        id: task.id,
        success,
        output: (stdout + stderr).trim(),
        exitCode: code,
        durationMs: Date.now() - startedAt,
        spawnError: null,
      });
    });
  });
}

async function main() {
  const summaryFilePath = getSummaryFilePath();
  const envLocal = loadEnvLocalIfExists();
  const results: Array<{
    id: string;
    description: string;
    success: boolean;
    output: string;
    exitCode: number | null;
    durationMs: number;
    spawnError: string | null;
  }> = [];
  let failedTaskId: string | null = null;

  for (const task of TASKS) {
    console.log(`[verify:v1] START ${task.id} - ${task.description}`);
    const result = await runTask(task, envLocal);
    results.push({
      id: task.id,
      description: task.description,
      success: result.success,
      output: result.output,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      spawnError: result.spawnError,
    });

    if (result.success) {
      console.log(`[verify:v1] PASS  ${task.id} (${result.durationMs}ms)`);
      continue;
    }

    failedTaskId = task.id;
    console.error(`[verify:v1] FAIL  ${task.id} (exitCode=${String(result.exitCode)}, duration=${result.durationMs}ms)`);
    if (result.spawnError) {
      console.error(`[verify:v1] FAIL_REASON ${result.spawnError}`);
    }
    if (result.output) {
      console.error(`[verify:v1] TASK_OUTPUT_BEGIN ${task.id}`);
      console.error(result.output);
      console.error(`[verify:v1] TASK_OUTPUT_END ${task.id}`);
    } else {
      console.error(`[verify:v1] TASK_OUTPUT_EMPTY ${task.id}`);
    }
    break;
  }

  const passed = results.every((item) => item.success);
  const summary: VerifySummary = {
    runner: "verify:v1",
    generatedAt: new Date().toISOString(),
    passed,
    failedTaskId,
    taskCount: TASKS.length,
    completedCount: results.length,
    tasks: results.map((item) => ({
      id: item.id,
      description: item.description,
      success: item.success,
      exitCode: item.exitCode,
      durationMs: item.durationMs,
      ...(item.success
        ? {}
        : {
            failureOutput: item.output,
            ...(item.spawnError ? { spawnError: item.spawnError } : {}),
          }),
    })),
  };

  if (passed) {
    console.log("[verify:v1] ALL_TASKS_PASSED");
  } else {
    console.error("[verify:v1] FAILED");
  }

  writeSummaryToFile(summary, summaryFilePath);
  console.log(JSON.stringify(summary, null, 2));

  if (!passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[verify:v1] RUNNER_ERROR ${message}`);

  const summaryFilePath = getSummaryFilePath();
  const summary: VerifySummary = {
    runner: "verify:v1",
    generatedAt: new Date().toISOString(),
    passed: false,
    failedTaskId: null,
    taskCount: TASKS.length,
    completedCount: 0,
    tasks: [],
    runnerError: message,
  };

  try {
    writeSummaryToFile(summary, summaryFilePath);
    console.log(JSON.stringify(summary, null, 2));
  } catch (writeError) {
    const writeMessage = writeError instanceof Error ? `${writeError.name}: ${writeError.message}` : String(writeError);
    console.error(`[verify:v1] SUMMARY_WRITE_ERROR ${writeMessage}`);
  }

  process.exit(1);
});
