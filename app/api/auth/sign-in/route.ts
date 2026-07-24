export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { enforceAuthRateLimit } from "@/features/auth/server/authRateLimit";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  buildShopUserAuthEmail,
  getAuthIdentifierStrategy,
  normalizeLoginUsername,
} from "@/features/users/lib/username";

type AccessSurface = "shop" | "mobile" | "customer" | "fleet";
type Body = { identifier?: string; password?: string; surface?: AccessSurface };

type RateLimitResult = ReturnType<typeof enforceAuthRateLimit>;

const GENERIC_ERROR = "We couldn't sign you in with those details.";

function uniqueAuthEmails(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function resolveAuthEmails(identifier: string): Promise<string[]> {
  const strategy = getAuthIdentifierStrategy(identifier);
  const candidates = [strategy.authEmail];

  const admin = createAdminSupabase();

  if (strategy.inputKind === "username") {
    const normalizedUsername = normalizeLoginUsername(identifier);
    const { data: profiles } = await admin
      .from("profiles")
      .select("username")
      .ilike("username", normalizedUsername)
      .not("username", "is", null)
      .limit(2);

    if ((profiles ?? []).length === 1) {
      const username = normalizeLoginUsername(profiles?.[0]?.username ?? "");
      if (username) candidates.push(buildShopUserAuthEmail(username));
    }

    return uniqueAuthEmails(candidates);
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("username")
    .ilike("email", strategy.authEmail)
    .not("username", "is", null)
    .limit(2);

  if ((profiles ?? []).length === 1) {
    const username = normalizeLoginUsername(profiles?.[0]?.username ?? "");
    if (username) candidates.push(buildShopUserAuthEmail(username));
  }

  return uniqueAuthEmails(candidates);
}

function enforceSignInRateLimits(
  req: Request,
  surface: AccessSurface,
  identifier: string,
  authEmails: string[],
): RateLimitResult | null {
  const keys = Array.from(new Set([
    identifier.trim().toLowerCase(),
    ...authEmails.map((email) => email.trim().toLowerCase()),
  ].filter(Boolean)));

  for (const key of keys) {
    const rateLimit = enforceAuthRateLimit(req, `sign-in:${surface}`, key, {
      max: 10,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) return rateLimit;
  }

  return null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const identifier = String(body?.identifier ?? "").trim();
  const password = String(body?.password ?? "");
  const surface: AccessSurface =
    body?.surface === "mobile" ||
    body?.surface === "customer" ||
    body?.surface === "fleet"
      ? body.surface
      : "shop";

  if (!identifier || !password) {
    return NextResponse.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 400 },
    );
  }

  const authEmails = await resolveAuthEmails(identifier);
  const rateLimit = enforceSignInRateLimits(req, surface, identifier, authEmails);
  if (rateLimit) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const supabase = createServerSupabaseRoute();
  let signedInUser:
    | Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"]["user"]
    | null = null;

  for (const authEmail of authEmails) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (!error && data.user) {
      signedInUser = data.user;
      break;
    }
  }

  if (!signedInUser) {
    return NextResponse.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 401 },
    );
  }

  const deny = async () => {
    await supabase.auth.signOut();
    return NextResponse.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 403 },
    );
  };

  if (
    (surface === "shop" || surface === "mobile") &&
    signedInUser.app_metadata?.profixiq_portal_only === true
  ) {
    return deny();
  }

  if (surface === "customer") {
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", signedInUser.id)
      .limit(1)
      .maybeSingle();
    if (!customer?.id) return deny();

    const admin = createAdminSupabase();
    const { data: invite } = await admin
      .from("customer_portal_invites")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("accepted_by_user_id", signedInUser.id)
      .not("accepted_at", "is", null)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();
    if (!invite?.id) return deny();
    return NextResponse.json({ ok: true, destination: "/portal" });
  }

  if (surface === "fleet") {
    const actor = await resolveFleetActorContext(supabase, {
      userId: signedInUser.id,
    });
    if (!actor.capabilities.canAccessPortalFleetWrappers) return deny();
    return NextResponse.json({ ok: true, destination: "/portal/fleet" });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, role, completed_onboarding, must_change_password")
    .eq("id", signedInUser.id)
    .maybeSingle();

  if (!profile?.shop_id) return deny();

  if (surface === "mobile") {
    const capabilities = getActorCapabilities({ role: profile.role });
    const canUseMobile =
      capabilities.isKnownRole && capabilities.canonicalRole !== "customer";
    if (!canUseMobile) return deny();
  }

  const destination = profile.must_change_password
    ? surface === "mobile"
      ? "/auth/set-password?redirect=%2Fmobile"
      : "/auth/set-password"
    : surface === "mobile"
      ? "/mobile"
      : profile.completed_onboarding || profile.shop_id
        ? "/dashboard"
        : "/onboarding";

  return NextResponse.json({ ok: true, destination });
}
