import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    {
      error: "unit_execution manual update is disabled; source is execution_sets.",
    },
    { status: 410 },
  );
}
