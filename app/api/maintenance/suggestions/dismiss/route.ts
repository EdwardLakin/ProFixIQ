import { NextResponse } from "next/server";

type Body = {
  vehicleId?: string;
  serviceCode?: string;
  reason?: "completed_previously";
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const vehicleId = typeof body?.vehicleId === "string" ? body.vehicleId.trim() : "";
  const serviceCode = typeof body?.serviceCode === "string" ? body.serviceCode.trim() : "";
  const reason = body?.reason;

  if (!vehicleId || !serviceCode || reason !== "completed_previously") {
    return NextResponse.json(
      { ok: false, error: "Missing vehicleId, serviceCode, or reason." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
