import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaDatabaseUrl?: string;
};

function normalizeSupabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    // Supabase pooler should use 6543. Some local env files still carry 5432.
    if (host.endsWith(".pooler.supabase.com") && (!parsed.port || parsed.port === "5432")) {
      parsed.port = "6543";
    }

    // Ensure TLS and pooler compatibility params are present.
    if (host.includes("supabase.com")) {
      if (!parsed.searchParams.has("sslmode")) {
        parsed.searchParams.set("sslmode", "require");
      }
      if (host.endsWith(".pooler.supabase.com") && !parsed.searchParams.has("pgbouncer")) {
        parsed.searchParams.set("pgbouncer", "true");
      }
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const normalizedDatabaseUrl = normalizeSupabaseUrl(process.env.DATABASE_URL);

const shouldLogQuery = process.env.PRISMA_LOG_QUERY === "1";
const prismaOptions: Prisma.PrismaClientOptions = {
  log: shouldLogQuery ? ["query", "error", "warn"] : ["error", "warn"],
};

if (normalizedDatabaseUrl) {
  prismaOptions.datasources = {
    db: {
      url: normalizedDatabaseUrl,
    },
  };
}

const shouldReuseGlobalClient =
  globalForPrisma.prisma &&
  globalForPrisma.prismaDatabaseUrl === (normalizedDatabaseUrl ?? process.env.DATABASE_URL);

function createPrismaClient() {
  return new PrismaClient(prismaOptions);
}

export const prisma = shouldReuseGlobalClient ? globalForPrisma.prisma! : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaDatabaseUrl = normalizedDatabaseUrl ?? process.env.DATABASE_URL;
}
