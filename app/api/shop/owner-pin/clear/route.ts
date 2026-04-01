import { NextResponse } from "next/server";
import { clearOwnerPinVerifiedCookie } from "@/features/shared/lib/server/owner-pin";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  return clearOwnerPinVerifiedCookie(res);
}
