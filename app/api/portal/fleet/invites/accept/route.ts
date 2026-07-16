export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { LEGAL_DOCUMENTS } from "@/features/legal/lib/config";

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    token?: string;
    legalAccepted?: boolean;
    portalTermsVersion?: string;
    privacyVersion?: string;
  } | null;
  const token = String(body?.token ?? "").trim();
  if (!token)
    return NextResponse.json(
      { error: "Invite token is required." },
      { status: 400 },
    );
  if (
    body?.legalAccepted !== true ||
    body.portalTermsVersion !== LEGAL_DOCUMENTS.portalTerms.version ||
    body.privacyVersion !== LEGAL_DOCUMENTS.privacy.version
  ) {
    return NextResponse.json(
      { error: "Current portal terms and privacy notice must be accepted." },
      { status: 400 },
    );
  }
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rpc = supabaseAdmin as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await rpc.rpc(
    "accept_fleet_portal_invite_with_legal_atomic",
    {
      p_token_hash: tokenHash,
      p_actor_user_id: user.id,
      p_actor_email: user.email,
      p_portal_terms_version: body.portalTermsVersion,
      p_privacy_version: body.privacyVersion,
      p_at: new Date().toISOString(),
    },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 403 });
  if (!existingProfile?.id) {
    const { error: metadataError } =
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...user.app_metadata,
          profixiq_portal_only: true,
        },
      });
    if (metadataError) {
      return NextResponse.json(
        {
          error:
            "Fleet access was linked, but account routing could not be finalized. Retry this link.",
        },
        { status: 500 },
      );
    }
  }
  return NextResponse.json(data ?? { ok: true });
}
