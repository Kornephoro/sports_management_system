import { ZodError } from "zod";
import { NextResponse } from "next/server";

import { UseCaseError } from "@/server/use-cases/shared/use-case-error";

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "请求参数校验失败",
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  if (error instanceof UseCaseError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.statusCode },
    );
  }

  const prismaConnectivityMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (
    prismaConnectivityMessage.includes("Can't reach database server") ||
    prismaConnectivityMessage.includes("Error opening a TLS connection")
  ) {
    return NextResponse.json(
      {
        error: "数据库连接不可用，请稍后重试",
        ...(process.env.NODE_ENV !== "production" && prismaConnectivityMessage
          ? { debug: prismaConnectivityMessage }
          : {}),
      },
      { status: 503 },
    );
  }

  console.error(error);
  const errorDetail =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "string"
        ? error
        : undefined;
  return NextResponse.json(
    {
      error: "服务器内部错误",
      ...(process.env.NODE_ENV !== "production" && errorDetail
        ? { debug: errorDetail }
        : {}),
    },
    { status: 500 },
  );
}
