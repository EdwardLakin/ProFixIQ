export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type ProfileSigRow = {
  tech_signature_path: string | null;
  tech_signature_hash: string | null;
};

export async function GET() {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("tech_signature_path, tech_signature_hash")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = (data as ProfileSigRow | null) ?? null;

  return NextResponse.json({
    ok: true,
    signatureImagePath: row?.tech_signature_path ?? null,
    signatureHash: row?.tech_signature_hash ?? null,
  });
}