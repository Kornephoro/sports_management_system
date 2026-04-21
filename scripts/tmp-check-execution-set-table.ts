import { prisma } from "@/lib/prisma";

async function main() {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ camel: string | null; snake: string | null; snake_quoted: string | null }>
  >(
    `SELECT to_regclass('"SessionExecutionSet"') AS camel, to_regclass('session_execution_sets') AS snake, to_regclass('"session_execution_sets"') AS snake_quoted`,
  );
  console.log(rows);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

