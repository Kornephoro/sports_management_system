import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { DEMO_PROGRAM_ID, DEMO_USER_ID } from "../src/lib/demo-user";
import { prisma } from "../src/lib/prisma";
import { listProgramsUseCase } from "../src/server/use-cases/programs/list-programs.use-case";

type CheckResult = {
  passed: boolean;
  details: string;
};

type DbIssueType = "tls_or_ssl" | "network_unreachable" | "auth_failed" | "unknown";

type DemoReadinessSummary = {
  runner: "verify:demo-readiness";
  generatedAt: string;
  passed: boolean;
  checks: {
    env_required_vars_present: CheckResult;
    database_reachable: CheckResult;
    demo_program_exists: CheckResult;
    demo_program_planning_ready: CheckResult;
    verify_v1_passed: CheckResult;
  };
  verifyV1: {
    passed: boolean;
    failedTaskId: string | null;
    exitCode: number | null;
    summaryFilePath: string;
  };
  demoNotes: string[];
  nextActions: string[];
  runnerError?: string;
};

type VerifyV1RunResult = {
  success: boolean;
  exitCode: number | null;
  output: string;
  spawnError: string | null;
};

const DEMO_NOTES = [
  `建议先从 Demo Program 开始：/programs/${DEMO_PROGRAM_ID}`,
  "Evidence parse 当前仍为 mock 解析，不是实际 AI 解析。",
  "本次演示重点：Program -> Planned Sessions -> Execution，然后再演示 Observation / Evidence / Constraint-Injury。",
];

const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

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

function getDemoReadinessSummaryFilePath() {
  const configured = process.env.VERIFY_DEMO_READINESS_SUMMARY_FILE?.trim();
  if (configured) {
    return resolve(process.cwd(), configured);
  }
  return resolve(process.cwd(), "artifacts/demo-readiness-summary.json");
}

function getVerifyV1SummaryFilePath() {
  const configured = process.env.VERIFY_V1_SUMMARY_FILE?.trim();
  if (configured) {
    return resolve(process.cwd(), configured);
  }
  return resolve(process.cwd(), "artifacts/verify-v1-summary.json");
}

function writeSummary(summary: DemoReadinessSummary, summaryFilePath: string) {
  mkdirSync(dirname(summaryFilePath), { recursive: true });
  writeFileSync(summaryFilePath, JSON.stringify(summary, null, 2) + "\n", "utf-8");
  console.log(`[verify:demo-readiness] SUMMARY_FILE ${summaryFilePath}`);
}

function createInitialSummary(verifyV1SummaryFilePath: string): DemoReadinessSummary {
  return {
    runner: "verify:demo-readiness",
    generatedAt: new Date().toISOString(),
    passed: false,
    checks: {
      env_required_vars_present: {
        passed: false,
        details: "not checked",
      },
      database_reachable: {
        passed: false,
        details: "not checked",
      },
      demo_program_exists: {
        passed: false,
        details: "not checked",
      },
      demo_program_planning_ready: {
        passed: false,
        details: "not checked",
      },
      verify_v1_passed: {
        passed: false,
        details: "not checked",
      },
    },
    verifyV1: {
      passed: false,
      failedTaskId: null,
      exitCode: null,
      summaryFilePath: verifyV1SummaryFilePath,
    },
    demoNotes: DEMO_NOTES,
    nextActions: [],
  };
}

function checkRequiredEnvVars() {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key] || !process.env[key]?.trim());
  return {
    ok: missing.length === 0,
    missing,
  };
}

function classifyDbConnectionIssue(message: string): DbIssueType {
  const lower = message.toLowerCase();

  if (
    lower.includes("tls") ||
    lower.includes("ssl") ||
    lower.includes("certificate") ||
    lower.includes("x509") ||
    lower.includes("安全包") ||
    lower.includes("凭证")
  ) {
    return "tls_or_ssl";
  }

  if (
    lower.includes("p1001") ||
    lower.includes("can't reach") ||
    lower.includes("cannot reach") ||
    lower.includes("connection refused") ||
    lower.includes("timed out") ||
    lower.includes("timeout")
  ) {
    return "network_unreachable";
  }

  if (
    lower.includes("authentication failed") ||
    lower.includes("password authentication failed") ||
    lower.includes("invalid password")
  ) {
    return "auth_failed";
  }

  return "unknown";
}

function buildConnectionNextActions(issueType: DbIssueType) {
  const common = [
    "Run `npm run db:seed` only after database connectivity is restored.",
    "Re-run `npm run verify:demo-readiness` after the environment issue is fixed.",
  ];

  if (issueType === "tls_or_ssl") {
    return [
      "Check DATABASE_URL / DIRECT_URL SSL/TLS options and ensure they match your database requirements.",
      "If using managed DB (e.g. Supabase), verify your machine trust store/certificate chain is valid.",
      ...common,
    ];
  }

  if (issueType === "network_unreachable") {
    return [
      "Verify database host/port in DATABASE_URL and DIRECT_URL are reachable from this machine.",
      "Check VPN / proxy / firewall policy and retry.",
      ...common,
    ];
  }

  if (issueType === "auth_failed") {
    return [
      "Verify database credentials in DATABASE_URL and DIRECT_URL are correct and not expired.",
      "If credentials were rotated, update `.env.local` and retry.",
      ...common,
    ];
  }

  return [
    "Check DATABASE_URL / DIRECT_URL values and local network connectivity.",
    "If needed, run `npm run verify:v1` separately after environment fix to inspect downstream failures.",
    ...common,
  ];
}

async function probeDatabaseReachability() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      ok: true as const,
      issueType: null,
      rawError: null,
    };
  } catch (error) {
    const rawError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const issueType = classifyDbConnectionIssue(rawError);
    return {
      ok: false as const,
      issueType,
      rawError,
    };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function runVerifyV1(extraEnv: Record<string, string>): Promise<VerifyV1RunResult> {
  return new Promise<VerifyV1RunResult>((resolvePromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/verify-v1-stability.ts"], {
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
      const text = String(chunk);
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolvePromise({
        success: false,
        exitCode: null,
        output: (stdout + stderr).trim(),
        spawnError: String(error),
      });
    });

    child.on("close", (code) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolvePromise({
        success: code === 0,
        exitCode: code,
        output: (stdout + stderr).trim(),
        spawnError: null,
      });
    });
  });
}

function readVerifyV1FailedTaskId(summaryFilePath: string) {
  if (!existsSync(summaryFilePath)) {
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(summaryFilePath, "utf-8")) as { failedTaskId?: unknown };
    return typeof raw.failedTaskId === "string" ? raw.failedTaskId : null;
  } catch {
    return null;
  }
}

async function main() {
  const envLocal = loadEnvLocalIfExists();
  Object.assign(process.env, envLocal);

  const verifyV1SummaryFilePath = getVerifyV1SummaryFilePath();
  const demoSummaryFilePath = getDemoReadinessSummaryFilePath();
  const summary = createInitialSummary(verifyV1SummaryFilePath);

  try {
    console.log("[verify:demo-readiness] CHECK required environment variables");
    const envCheck = checkRequiredEnvVars();
    if (!envCheck.ok) {
      summary.checks.env_required_vars_present = {
        passed: false,
        details: `Missing required env vars: ${envCheck.missing.join(", ")}`,
      };
      summary.checks.database_reachable = {
        passed: false,
        details: "skipped because required env vars are missing",
      };
      summary.checks.demo_program_exists = {
        passed: false,
        details: "skipped because environment pre-check failed",
      };
      summary.checks.demo_program_planning_ready = {
        passed: false,
        details: "skipped because environment pre-check failed",
      };
      summary.checks.verify_v1_passed = {
        passed: false,
        details: "skipped because environment pre-check failed",
      };
      summary.nextActions = [
        "Fill missing variables in `.env.local` based on `.env.example`.",
        "Re-run `npm run verify:demo-readiness`.",
      ];
      writeSummary(summary, demoSummaryFilePath);
      console.error("[verify:demo-readiness] FAILED: required environment variables are missing");
      process.exit(1);
    }

    summary.checks.env_required_vars_present = {
      passed: true,
      details: "required environment variables are present",
    };

    console.log("[verify:demo-readiness] CHECK database reachability");
    const dbProbe = await probeDatabaseReachability();
    if (!dbProbe.ok) {
      summary.checks.database_reachable = {
        passed: false,
        details: `database probe failed (${dbProbe.issueType}): ${dbProbe.rawError}`,
      };
      summary.checks.demo_program_exists = {
        passed: false,
        details: "skipped because database pre-check failed",
      };
      summary.checks.demo_program_planning_ready = {
        passed: false,
        details: "skipped because database pre-check failed",
      };
      summary.checks.verify_v1_passed = {
        passed: false,
        details: "skipped because database pre-check failed",
      };
      summary.nextActions = buildConnectionNextActions(dbProbe.issueType);
      writeSummary(summary, demoSummaryFilePath);
      console.error("[verify:demo-readiness] FAILED: database is not reachable");
      process.exit(1);
    }

    summary.checks.database_reachable = {
      passed: true,
      details: "database probe succeeded (SELECT 1)",
    };

    console.log("[verify:demo-readiness] CHECK Demo Program existence and planning readiness");
    const programs = await listProgramsUseCase({
      userId: DEMO_USER_ID,
    });

    const demoProgram = programs.find((program) => program.id === DEMO_PROGRAM_ID);

    if (!demoProgram) {
      summary.checks.demo_program_exists = {
        passed: false,
        details: `Demo Program not found: ${DEMO_PROGRAM_ID}`,
      };
      summary.checks.demo_program_planning_ready = {
        passed: false,
        details: "skipped because demo program does not exist",
      };
      summary.checks.verify_v1_passed = {
        passed: false,
        details: "skipped because demo program pre-check failed",
      };
      summary.nextActions = [
        "Run `npm run db:seed` to restore demo baseline data.",
        `Verify Demo Program id exists: ${DEMO_PROGRAM_ID}`,
      ];
      writeSummary(summary, demoSummaryFilePath);
      console.error("[verify:demo-readiness] FAILED: demo program missing");
      process.exit(1);
    }

    summary.checks.demo_program_exists = {
      passed: true,
      details: `Demo Program found: ${demoProgram.name} (${demoProgram.id})`,
    };

    if (!demoProgram.planning_ready) {
      summary.checks.demo_program_planning_ready = {
        passed: false,
        details: `planning_ready=false; enabled templates with units: ${demoProgram.enabled_session_template_with_units_count}/${demoProgram.session_template_count}`,
      };
      summary.checks.verify_v1_passed = {
        passed: false,
        details: "skipped because demo program is not planning ready",
      };
      summary.nextActions = [
        "Run `npm run db:seed` to reset demo templates to enabled state.",
        "Ensure Demo Program has at least one enabled SessionTemplate with TrainingUnitTemplate.",
      ];
      writeSummary(summary, demoSummaryFilePath);
      console.error("[verify:demo-readiness] FAILED: demo program not planning ready");
      process.exit(1);
    }

    summary.checks.demo_program_planning_ready = {
      passed: true,
      details: `planning_ready=true; enabled templates with units: ${demoProgram.enabled_session_template_with_units_count}/${demoProgram.session_template_count}`,
    };

    console.log("[verify:demo-readiness] RUN npm run verify:v1");
    const verifyV1Result = await runVerifyV1(envLocal);
    const failedTaskId = readVerifyV1FailedTaskId(verifyV1SummaryFilePath);

    summary.verifyV1 = {
      passed: verifyV1Result.success,
      failedTaskId,
      exitCode: verifyV1Result.exitCode,
      summaryFilePath: verifyV1SummaryFilePath,
    };

    if (!verifyV1Result.success) {
      summary.checks.verify_v1_passed = {
        passed: false,
        details: `verify:v1 failed${failedTaskId ? ` at task ${failedTaskId}` : ""}`,
      };
      summary.nextActions = [
        "Fix failing verify:v1 task shown in artifacts/verify-v1-summary.json.",
        "Re-run `npm run verify:demo-readiness` after regression passes.",
      ];
      writeSummary(summary, demoSummaryFilePath);
      console.error("[verify:demo-readiness] FAILED: verify:v1 did not pass");
      process.exit(1);
    }

    summary.checks.verify_v1_passed = {
      passed: true,
      details: "verify:v1 passed",
    };
    summary.passed = true;
    summary.nextActions = [
      `Open Demo Program directly: /programs/${DEMO_PROGRAM_ID}`,
      "Demo focus order: Program -> Planned Sessions -> Execution -> Observation -> Evidence -> Constraints.",
      "If evidence list is temporarily unavailable, use the page retry action and continue demo flow.",
    ];

    writeSummary(summary, demoSummaryFilePath);
    console.log("[verify:demo-readiness] ALL_CHECKS_PASSED");
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    summary.runnerError = message;
    summary.nextActions = [
      "Check required environment variables and database connectivity first.",
      "If this is a TLS/SSL issue, verify DATABASE_URL/DIRECT_URL SSL settings and local trust store.",
      "Run `npm run db:seed` if demo baseline data is missing (after connectivity is restored).",
      "Re-run `npm run verify:demo-readiness`.",
    ];
    writeSummary(summary, demoSummaryFilePath);
    console.error(`[verify:demo-readiness] RUNNER_ERROR ${message}`);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
