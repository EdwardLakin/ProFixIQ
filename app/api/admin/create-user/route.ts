// app/api/admin/create-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { assertShopHasAvailableSeat } from "@/features/shared/lib/server/shop-seat-limit";
import {
  buildShopUserAuthEmail,
  buildShopUsernameNamespace,
  normalizeProvisioningUsername,
  withShopUsernameSuffix,
} from "@/features/users/lib/username";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

type Body = {
  username: string;
  email?: string | null;
  password: string;
  full_name?: string | null;
  role?: Database["public"]["Enums"]["user_role_enum"] | null;
  // client can send it but we will ignore unless allowed
  shop_id?: string | null;
  phone?: string | null;
};

const PRIVILEGED_ROLES = new Set(["owner", "admin"]);
const PROVISIONABLE_ROLES = new Set([
  "owner", "admin", "manager", "foreman", "lead_hand", "advisor", "service",
  "dispatcher", "parts", "mechanic", "fleet_manager", "driver",
]);

function isValidContactEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function logCreateUserStep(
  step: string,
  details: {
    adminId?: string | null;
    targetShopId?: string | null;
    role?: string | null;
    authUserId?: string | null;
    profileId?: string | null;
    normalizedUsername?: string | null;
    hasContactEmail?: boolean;
    emailConfirmed?: boolean | null;
  } = {},
): void {
  console.info("[admin/create-user]", { step, ...details });
}

function logCreateUserError(
  step: string,
  details: {
    adminId?: string | null;
    targetShopId?: string | null;
    role?: string | null;
    authUserId?: string | null;
    profileId?: string | null;
    normalizedUsername?: string | null;
    hasContactEmail?: boolean;
    emailConfirmed?: boolean | null;
    error?: string | null;
  } = {},
): void {
  console.warn("[admin/create-user]", { step, ...details });
}

async function rollbackCreatedAuthUser(args: {
  serviceSupabase: ReturnType<typeof createAdminSupabase>;
  authUserId: string;
  adminId: string;
  shopId: string;
}): Promise<boolean> {
  const { error } = await args.serviceSupabase.auth.admin.deleteUser(args.authUserId);
  if (error) {
    logCreateUserError("rollback_auth_user_failed", {
      adminId: args.adminId,
      targetShopId: args.shopId,
      authUserId: args.authUserId,
      error: error.message,
    });
    return false;
  }

  logCreateUserStep("rollback_auth_user_completed", {
    adminId: args.adminId,
    targetShopId: args.shopId,
    authUserId: args.authUserId,
  });
  return true;
}

export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as Partial<Body>;

    const password = raw.password ?? "";
    const full_name = String(raw.full_name ?? "").trim() || null;
    const requestedRole = (raw.role ?? null) || null;
    const canonicalRole = canonicalizeRole(requestedRole);
    const phone = (raw.phone ?? null) || null;
    const inputEmail = (raw.email ?? "").trim().toLowerCase();

    if (canonicalRole === "unknown") {
      return NextResponse.json(
        {
          error:
            "Invalid staff role. Allowed roles: owner, admin, manager, foreman, lead_hand, advisor, service, dispatcher, parts, mechanic, fleet_manager, driver.",
        },
        { status: 400 }
      );
    }

    if (!PROVISIONABLE_ROLES.has(canonicalRole)) {
      return NextResponse.json(
        { error: "This account type must be created through its dedicated portal or invitation flow." },
        { status: 400 },
      );
    }
    if (!full_name) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }
    if (full_name.length > 120) {
      return NextResponse.json({ error: "Full name is too long." }, { status: 400 });
    }
    if (password.trim().length < 8) {
      return NextResponse.json(
        { error: "Temporary password must be at least 8 characters." },
        { status: 400 },
      );
    }
    if (inputEmail && !isValidContactEmail(inputEmail)) {
      return NextResponse.json({ error: "Enter a valid contact email." }, { status: 400 });
    }
    if (phone && phone.length > 40) {
      return NextResponse.json({ error: "Phone number is too long." }, { status: 400 });
    }

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageUsers",
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    if (PRIVILEGED_ROLES.has(canonicalRole) && access.canonicalRole !== "owner") {
      return NextResponse.json(
        { error: "Only an owner can create owner or admin accounts." },
        { status: 403 },
      );
    }

    // Always force the creator's shop_id to preserve tenant boundaries.
    const effectiveShopId = access.profile.shop_id;
    if (!effectiveShopId) {
      return NextResponse.json({ error: "Profile for current user not found." }, { status: 403 });
    }

    logCreateUserStep("access_authorized", {
      adminId: access.profile.id,
      targetShopId: effectiveShopId,
      role: canonicalRole,
    });

    // Service-role client is created server-side only and is never exposed to the browser.
    const serviceSupabase = createAdminSupabase();

    const { data: shop } = await serviceSupabase
      .from("shops")
      .select("name, shop_name")
      .eq("id", effectiveShopId)
      .maybeSingle<{ name: string | null; shop_name: string | null }>();

    const shopDisplayName = (shop?.shop_name ?? "").trim() || (shop?.name ?? "").trim() || "shop";
    const shopNamespace = buildShopUsernameNamespace(shopDisplayName);
    const requestedUsername = String(raw.username ?? "").trim();

    if (!requestedUsername) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }

    const normalizedInputUsername = requestedUsername.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (normalizedInputUsername.length < 2) {
      return NextResponse.json(
        { error: "Username must include at least 2 letters or numbers." },
        { status: 400 },
      );
    }
    const username = normalizeProvisioningUsername(requestedUsername, shopNamespace);

    // ensure username is unique inside the current shop only
    const { data: sameShopProfiles, error: existingErr } = await serviceSupabase
      .from("profiles")
      .select("id, username")
      .eq("shop_id", effectiveShopId)
      .ilike("username", username)
      .limit(1);

    if (existingErr) {
      logCreateUserError("username_lookup_failed", {
        adminId: access.profile.id,
        targetShopId: effectiveShopId,
        role: canonicalRole,
        error: existingErr.message,
      });
      return NextResponse.json(
        { error: "Failed to check existing usernames.", code: "username_lookup_failed" },
        { status: 500 }
      );
    }

    if ((sameShopProfiles ?? []).length > 0) {
      return NextResponse.json(
        { error: "A user with this username already exists in this shop." },
        { status: 400 }
      );
    }

    try {
      await assertShopHasAvailableSeat(serviceSupabase, effectiveShopId);
    } catch (seatErr) {
      const msg = seatErr instanceof Error ? seatErr.message : "Shop user limit reached for your current plan.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Staff username auth is primary: Supabase Auth uses the same synthetic email
    // that username sign-in derives from the normalized username. Real email remains
    // a profile/contact field only.
    const syntheticEmail = buildShopUserAuthEmail(username);
    const contactEmail = inputEmail || null;

    logCreateUserStep("creating_auth_user", {
      adminId: access.profile.id,
      targetShopId: effectiveShopId,
      role: canonicalRole,
      normalizedUsername: username,
      hasContactEmail: Boolean(contactEmail),
    });

    // create auth user with service client
    const { data: created, error: createErr } = await serviceSupabase.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role: canonicalRole,
        shop_id: effectiveShopId, // force caller's shop
        phone,
        username,
        contact_email: contactEmail,
      },
    });

    if (createErr || !created?.user) {
      logCreateUserError("auth_user_create_failed", {
        adminId: access.profile.id,
        targetShopId: effectiveShopId,
        role: canonicalRole,
        error: createErr?.message ?? "No auth user returned",
      });
      const safeMessage = createErr?.message?.toLowerCase().includes("already been registered")
        ? "Unable to provision this username. Try the suggested shop-prefixed username."
        : (createErr?.message ?? "Failed to create user.");

      return NextResponse.json({ error: safeMessage, code: "auth_user_create_failed" }, { status: 400 });
    }

    const newUserId = created.user.id;
    logCreateUserStep("auth_user_created", {
      adminId: access.profile.id,
      targetShopId: effectiveShopId,
      role: canonicalRole,
      authUserId: newUserId,
      normalizedUsername: username,
      hasContactEmail: Boolean(contactEmail),
      emailConfirmed: Boolean(created.user.email_confirmed_at ?? created.user.confirmed_at),
    });

    // upsert profile for the new user
    const { error: profileErr } = await serviceSupabase
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          email: contactEmail,
          full_name,
          phone,
          role: canonicalRole,
          shop_id: effectiveShopId,
          shop_name: null,
          username,
          must_change_password: true,
          updated_at: new Date().toISOString(),
        } as Database["public"]["Tables"]["profiles"]["Insert"],
        {
          onConflict: "id",
        }
      );

    if (profileErr) {
      const rolledBack = await rollbackCreatedAuthUser({
        serviceSupabase,
        authUserId: newUserId,
        adminId: access.profile.id,
        shopId: effectiveShopId,
      });
      if (String(profileErr.message ?? "").toLowerCase().includes("shop user limit reached")) {
        return NextResponse.json(
          {
            error: rolledBack
              ? "Shop user limit reached for your current plan. No account was created."
              : "Shop user limit reached, and automatic account cleanup failed. Contact support before retrying.",
            code: rolledBack ? "shop_user_limit_reached" : "provisioning_rollback_failed",
          },
          { status: 400 }
        );
      }
      logCreateUserError("profile_upsert_failed", {
        adminId: access.profile.id,
        targetShopId: effectiveShopId,
        role: canonicalRole,
        authUserId: newUserId,
        error: profileErr.message,
      });
      return NextResponse.json(
        {
          error: rolledBack
            ? "User setup could not be completed. No account was created; you can try again."
            : "User setup could not be completed, and automatic cleanup failed. Contact support before retrying.",
          code: rolledBack ? "profile_upsert_failed" : "provisioning_rollback_failed",
        },
        { status: 500 }
      );
    }

    // Seed the canonical workforce profile row so People detail is immediately usable.
    const { error: workforceErr } = await serviceSupabase
      .from("people_workforce_profiles")
      .upsert(
        {
          shop_id: effectiveShopId,
          user_id: newUserId,
          employment_status: "active",
          payroll_ready: false,
          notes: "Seeded during account provisioning; complete in People detail.",
        },
        { onConflict: "shop_id,user_id" }
      );

    if (workforceErr) {
      const rolledBack = await rollbackCreatedAuthUser({
        serviceSupabase,
        authUserId: newUserId,
        adminId: access.profile.id,
        shopId: effectiveShopId,
      });
      logCreateUserError("workforce_profile_seed_failed", {
        adminId: access.profile.id,
        targetShopId: effectiveShopId,
        role: canonicalRole,
        authUserId: newUserId,
        error: workforceErr.message,
      });
      return NextResponse.json(
        {
          error: rolledBack
            ? "User setup could not be completed. No account was created; you can try again."
            : "User setup could not be completed, and automatic cleanup failed. Contact support before retrying.",
          code: rolledBack ? "workforce_profile_seed_failed" : "provisioning_rollback_failed",
        },
        { status: 500 }
      );
    }

    logCreateUserStep("completed", {
      adminId: access.profile.id,
      targetShopId: effectiveShopId,
      role: canonicalRole,
      authUserId: newUserId,
      profileId: newUserId,
      normalizedUsername: username,
      hasContactEmail: Boolean(contactEmail),
      emailConfirmed: Boolean(created.user.email_confirmed_at ?? created.user.confirmed_at),
    });

    return NextResponse.json({
      ok: true,
      user_id: newUserId,
      username,
      suggested_alternate_username: withShopUsernameSuffix(username, 1),
      email: contactEmail,
      auth_email: syntheticEmail,
      must_change_password: true,
      shop_id: effectiveShopId,
      people_record_href: `/dashboard/workforce/people/${newUserId}?from=create-user`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    logCreateUserError("unexpected_error", { error: msg });
    return NextResponse.json({ error: msg, code: "unexpected_error" }, { status: 500 });
  }
}
