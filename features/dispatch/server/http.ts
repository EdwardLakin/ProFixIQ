import "server-only";

import { NextResponse } from "next/server";
import { DispatchCommandError } from "@/features/dispatch/server/commands";

export function dispatchErrorResponse(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "Dispatch operation failed.";
  const normalized = message.toLowerCase();
  const code = error instanceof DispatchCommandError ? error.code : null;

  const status =
    code === "42501" || normalized.includes("denied") || normalized.includes("actor mismatch")
      ? 403
      : code === "40001" || normalized.includes("changed since it was loaded")
        ? 409
        : code === "23P01" ||
            normalized.includes("not available") ||
            normalized.includes("overlap") ||
            normalized.includes("double")
          ? 409
          : normalized.includes("not found")
            ? 404
            : 400;

  return NextResponse.json({ error: message }, { status });
}
