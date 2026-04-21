import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "unit_execution manual creation is disabled; source is execution_sets.",
    },
    { status: 410 },
  );
}
