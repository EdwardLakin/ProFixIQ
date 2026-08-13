import "server-only";

import { NextResponse } from "next/server";

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function requireNonProductionRoute(routeLabel: string):
  | { ok: true }
  | { ok: false; response: NextResponse } {
  if (!isProductionRuntime()) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: `${routeLabel} is disabled in production` },
      { status: 404 },
    ),
  };
}

export function requireInternalApiSecret(options: {
  request: Request;
  envSecretName: string;
  headerName: string;
  routeLabel: string;
  bearerEnvSecretName?: string;
}):
  | { ok: true }
  | { ok: false; response: NextResponse } {
  const bearerSecret = options.bearerEnvSecretName
    ? process.env[options.bearerEnvSecretName]
    : undefined;
  const authorization = options.request.headers.get("authorization");

  if (bearerSecret && authorization === `Bearer ${bearerSecret}`) {
    return { ok: true };
  }

  const configuredSecret = process.env[options.envSecretName];

  if (!configuredSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${options.routeLabel} is not configured` },
        { status: 500 },
      ),
    };
  }

  const providedSecret = options.request.headers.get(options.headerName);

  if (!providedSecret || providedSecret !== configuredSecret) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}
