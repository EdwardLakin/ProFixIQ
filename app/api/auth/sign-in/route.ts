export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { enforceAuthRateLimit } from "@/features/auth/server/authRateLimit";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { getMobileFieldServiceAccess } from "@/features/mobile/service/server/access";
import {
  ACCOUNT_BILLING_RECOVERY_HREF,
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  buildShopUserAuthEmail,
  getAuthIdentifierStrategy,
  normalizeLoginUsername,
} from "@/features/users/lib/username";

type AccessSurface = "shop" | "mobile" | "field" | "customer" | "fleet";
type Body = {
  identifier?: string;
  password?: string;
  surface?: AccessSurface;
  acquisitionSessionId?: string;
};

type RateLimitResult = ReturnType<typeof enforceAuthRateLimit>;

const GENERIC_ERROR = "We couldn't sign you in with those details.";

function billingRecoveryDestination(input: {
  canManageBilling: boolean;
  canonicalRole: string;
  mustChangePassword: boolean;
}): string | null {
  if (
    !input.canManageBilling ||
    (input.canonicalRole !== "owner" && input.canonicalRole !== "admin")
  ) {
    return null;
  }

  return input.mustChangePassword
    ? `/auth/set-password?redirect=${encodeURIComponent(ACCOUNT_BILLING_RECOVERY_HREF)}`
    : ACCOUNT_BILLING_RECOVERY_HREF;
}

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
  const keys = Array.from(
    new Set(
      [
        identifier.trim().toLowerCase(),
        ...authEmails.map((email) => email.trim().toLowerCase()),
      ].filter(Boolean),
    ),
  );

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
    body?.surface === "field" ||
    body?.surface === "customer" ||
    body?.surface === "fleet"
      ? body.surface
      : "shop";
  const acquisitionSessionId = String(body?.acquisitionSessionId ?? "").trim();
  const hasAcquisitionContext =
    surface === "shop" && /^cs_[A-Za-z0-9_]+$/.test(acquisitionSessionId);

  if (!identifier || !password) {
    return NextResponse.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 400 },
    );
  }

  const authEmails = await resolveAuthEmails(identifier);
  const rateLimit = enforceSignInRateLimits(
    req,
    surface,
    identifier,
    authEmails,
  );
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
    | Awaited<
        ReturnType<typeof supabase.auth.signInWithPassword>
      >["data"]["user"]
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

  const rejectedSessionScope = "local" as const;
  const deny = async () => {
    await supabase.auth.signOut({ scope: rejectedSessionScope });
    return NextResponse.json(
      { ok: false, error: GENERIC_ERROR },
      { status: 403 },
    );
  };

  if (
    (surface === "shop" || surface === "mobile" || surface === "field") &&
    signedInUser.app_metadata?.profixiq_portal_only === true &&
    !hasAcquisitionContext
  ) {
    return deny();
  }

  if (surface === "customer") {
    // Password authentication has already established the caller's auth subject.
    // Resolve the linked customer and accepted invite with the service-role
    // client, explicitly pinned to that verified subject. This keeps portal
    // bootstrap independent of customer-table RLS and of production-only policy
    // drift such as `customer_select_own`.
    const admin = createAdminSupabase();
    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("id")
      .eq("user_id", signedInUser.id)
      .limit(1)
      .maybeSingle();
    if (customerError || !customer?.id) return deny();

    const { data: invite, error: inviteError } = await admin
      .from("customer_portal_invites")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("accepted_by_user_id", signedInUser.id)
      .not("accepted_at", "is", null)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();
    if (inviteError || !invite?.id) return deny();
    return NextResponse.json({ ok: true, destination: "/portal" });
  }

  if (surface === "fleet") {
    const actor = await resolveFleetActorContext(supabase, {
      userId: signedInUser.id,
    });
    if (!actor.capabilities.canAccessPortalFleetWrappers) return deny();
    return NextResponse.json({ ok: true, destination: "/portal/fleet" });
  }

  const { profile, error: profileError } =
    await resolveAuthenticatedStaffProfile(supabase, signedInUser.id);

  if (profileError || !profile) return deny();

  if (!profile.shop_id) {
    if (surface === "shop" && !profile.role) {
      return NextResponse.json({ ok: true, destination: "/onboarding" });
    }
    return deny();
  }

  const capabilities = getActorCapabilities({ role: profile.role });
  const canUseStaffSurface =
    capabilities.isKnownRole && capabilities.canonicalRole !== "customer";
  if (!canUseStaffSurface) return deny();

  if (surface === "shop" || surface === "mobile") {
    const productAccess = await resolveShopProductAccess({
      supabase,
      shopId: profile.shop_id,
      capabilities: SHOP_PRODUCT_CAPABILITIES,
    });
    if (productAccess.error) {
      await supabase.auth.signOut({ scope: rejectedSessionScope });
      return NextResponse.json(
        { ok: false, error: "Unable to verify Shop access right now." },
        { status: 503 },
      );
    }
    if (!productAccess.entitled) {
      const recovery = billingRecoveryDestination({
        canManageBilling: capabilities.canManageBilling,
        canonicalRole: capabilities.canonicalRole,
        mustChangePassword: Boolean(profile.must_change_password),
      });
      if (recovery) {
        return NextResponse.json({ ok: true, destination: recovery });
      }
      return deny();
    }
  }

  let fieldDestination: string | null = null;
  if (surface === "field") {
    try {
      const fieldAccess = await getMobileFieldServiceAccess({
        ok: true,
        profile: {
          id: profile.id,
          role: profile.role,
          shop_id: profile.shop_id,
          completed_onboarding: profile.completed_onboarding,
          must_change_password: profile.must_change_password,
          email: profile.email,
          full_name: profile.full_name,
        },
        canonicalRole: capabilities.canonicalRole,
        authUserId: signedInUser.id,
        supabase,
      });

      fieldDestination =
        fieldAccess.decision === "ready"
          ? "/mobile/service"
          : fieldAccess.decision === "setup_required"
            ? "/mobile/service/setup"
            : fieldAccess.decision === "forbidden" &&
                fieldAccess.productEntitled &&
                fieldAccess.canConfigure
              ? "/mobile/service/setup"
              : null;
    } catch {
      await supabase.auth.signOut({ scope: rejectedSessionScope });
      return NextResponse.json(
        { ok: false, error: "Unable to verify Field access right now." },
        { status: 503 },
      );
    }

    if (!fieldDestination) {
      const recovery = billingRecoveryDestination({
        canManageBilling: capabilities.canManageBilling,
        canonicalRole: capabilities.canonicalRole,
        mustChangePassword: Boolean(profile.must_change_password),
      });
      if (recovery) {
        return NextResponse.json({ ok: true, destination: recovery });
      }
      return deny();
    }
  }

  const destination = profile.must_change_password
    ? surface === "field"
      ? `/auth/set-password?redirect=${encodeURIComponent(fieldDestination!)}`
      : surface === "mobile"
        ? "/auth/set-password?redirect=%2Fmobile"
        : "/auth/set-password"
    : surface === "field"
      ? fieldDestination!
      : surface === "mobile"
        ? "/mobile"
        : profile.completed_onboarding || profile.shop_id
          ? "/dashboard"
          : "/onboarding";

  return NextResponse.json({ ok: true, destination });
}
