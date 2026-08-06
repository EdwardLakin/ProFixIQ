import { NextResponse } from "next/server";

import { FLEET_DRIVER_EVIDENCE_BUCKET } from "@/features/fleet/lib/fleetDriverEvidence";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

type Props = { params: Promise<{ evidenceId: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { evidenceId } = await params;
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // This authenticated read intentionally goes through RLS before the
  // service-role client creates a short-lived URL.
  const { data: evidence, error } = await supabase
    .from("fleet_driver_evidence")
    .select("id,storage_path")
    .eq("id", evidenceId)
    .maybeSingle();
  if (error || !evidence) {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }

  const admin = createAdminSupabase();
  const { data: signed, error: signedError } = await admin.storage
    .from(FLEET_DRIVER_EVIDENCE_BUCKET)
    .createSignedUrl(evidence.storage_path, 600);
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Evidence is temporarily unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
