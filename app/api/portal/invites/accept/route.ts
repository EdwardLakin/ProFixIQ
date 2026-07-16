import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { LEGAL_DOCUMENTS } from "@/features/legal/lib/config";

type RpcError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type Body = {
  inviteId?: string;
  operationKey?: string;
  idempotencyKey?: string;
  legalAccepted?: boolean;
  portalTermsVersion?: string;
  privacyVersion?: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const inviteId = clean(body?.inviteId);
  const operationKey =
    req.headers.get("Idempotency-Key")?.trim() ||
    clean(body?.operationKey) ||
    clean(body?.idempotencyKey);

  if (!inviteId) {
    return NextResponse.json({ error: "Missing inviteId" }, { status: 400 });
  }
  if (!operationKey) {
    return NextResponse.json(
      { error: "A stable Idempotency-Key is required." },
      { status: 400 },
    );
  }
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

  const rpc = supabaseAdmin as unknown as RpcClient;
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle();
  const { data, error } = await rpc.rpc(
    "accept_customer_portal_invite_with_legal_atomic",
    {
      p_invite_id: inviteId,
      p_actor_user_id: user.id,
      p_actor_email: user.email,
      p_operation_key: `portal-invite:${user.id}:${operationKey}`,
      p_portal_terms_version: body.portalTermsVersion,
      p_privacy_version: body.privacyVersion,
      p_at: new Date().toISOString(),
    },
  );

  if (error) {
    const message = [error.message, error.details, error.hint]
      .filter(Boolean)
      .join(" — ");
    const lower = message.toLowerCase();
    const status = lower.includes("not found")
      ? 404
      : lower.includes("another account") ||
          lower.includes("does not match") ||
          lower.includes("revoked") ||
          lower.includes("expired")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }

  if (!existingProfile?.shop_id) {
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
            "Portal access was linked, but account routing could not be finalized. Retry this link.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(data ?? { ok: true });
}
