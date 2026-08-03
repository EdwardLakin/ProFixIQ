export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { enforceAuthRateLimit } from "@/features/auth/server/authRateLimit";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";

type AcceptBody = {
  token?: string;
  password?: string;
};

function isValidInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,128}$/.test(token);
}

function isValidPassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128;
}

function activationError(status = 403) {
  return NextResponse.json(
    { error: "Fleet access could not be activated. Request a new invitation." },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AcceptBody | null;
  const token = String(body?.token ?? "").trim();
  const password = String(body?.password ?? "");

  if (!isValidInviteToken(token)) {
    return NextResponse.json(
      { error: "This fleet invitation is invalid or expired." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isValidPassword(password)) {
    return NextResponse.json(
      { error: "Use a password between 12 and 128 characters." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rateLimit = enforceAuthRateLimit(
    req,
    "fleet-invite-activation",
    tokenHash,
    { max: 6, windowMs: 15 * 60_000 },
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many activation attempts. Wait a few minutes and try again." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("fleet_portal_invites")
    .select(
      "id, email, expires_at, accepted_at, accepted_by_user_id, revoked_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (
    inviteError ||
    !invite?.id ||
    invite.revoked_at ||
    new Date(invite.expires_at) <= new Date()
  ) {
    return activationError();
  }

  if (invite.accepted_at) {
    if (!invite.accepted_by_user_id) return activationError();
    const { data: acceptedIdentity, error: acceptedIdentityError } =
      await supabaseAdmin.auth.admin.getUserById(invite.accepted_by_user_id);
    if (
      acceptedIdentityError ||
      acceptedIdentity.user?.email?.trim().toLowerCase() !==
        invite.email.trim().toLowerCase()
    ) {
      return activationError();
    }
    return NextResponse.json(
      { ok: true, email: invite.email, alreadyAccepted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Generate, but never deliver, a Supabase link so Auth resolves both new and
  // existing identities. The customer-facing email uses only ProFixIQ's
  // durable, hashed invitation token and cannot be consumed by link scanners.
  const { data: identityLink, error: identityError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: invite.email,
    });
  const identity = identityLink?.user;
  if (identityError || !identity?.id || !identity.email) {
    return activationError(500);
  }
  if (
    identity.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()
  ) {
    return activationError();
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", identity.id)
    .maybeSingle();
  const normalizedRole = String(existingProfile?.role ?? "")
    .trim()
    .toLowerCase();
  const isExistingShopStaff = Boolean(
    existingProfile?.shop_id &&
      normalizedRole !== "customer" &&
      normalizedRole !== "fleet_manager",
  );
  const appMetadata = isExistingShopStaff
    ? identity.app_metadata
    : {
        ...identity.app_metadata,
        profixiq_portal_only: true,
      };

  const { error: passwordError } =
    await supabaseAdmin.auth.admin.updateUserById(identity.id, {
      password,
      email_confirm: true,
      app_metadata: appMetadata,
    });
  if (passwordError) {
    return NextResponse.json(
      {
        error:
          "Your password does not meet the account security requirements. Try a different password.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rpc = supabaseAdmin as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { error: acceptError } = await rpc.rpc(
    "accept_fleet_portal_invite_atomic",
    {
      p_token_hash: tokenHash,
      p_actor_user_id: identity.id,
      p_actor_email: identity.email,
      p_at: new Date().toISOString(),
    },
  );
  if (acceptError) return activationError();

  return NextResponse.json(
    { ok: true, email: invite.email },
    { headers: { "Cache-Control": "no-store" } },
  );
}
