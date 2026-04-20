import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const internalGate = requireInternalApiSecret({
    request: req,
    envSecretName: "DIAG_LOG_SECRET",
    headerName: "x-diag-log-secret",
    routeLabel: "diag/log",
  });
  if (!internalGate.ok) {
    return internalGate.response;
  }

  try {
    const body = await req.json().catch(() => ({}));
    console.log("[diag]", body.message, body.extra || "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[diag] failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
