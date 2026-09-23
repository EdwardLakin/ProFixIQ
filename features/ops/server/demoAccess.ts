import "server-only";

import { randomBytes } from "node:crypto";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";
import { getDemoShopId } from "@/features/shared/lib/server/demo-shop";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { sendUserInviteEmail } from "@/features/email/server";
import {
  buildShopUserAuthEmail,
  buildShopUsernameNamespace,
  normalizeProvisioningUsername,
  withShopUsernameSuffix,
} from "@/features/users/lib/username";

const DEMO_BILLING_ENTITLEMENT = "internal_demo";

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

export type DemoShopContext = {
  shopId: string;
  shopDisplayName: string;
};

export type DemoAccessState = "active" | "expired";

export type DemoProspect = {
  profileId: string;
  fullName: string | null;
  email: string | null;
  username: string | null;
  createdAt: string | null;
  expiresAt: string;
  state: DemoAccessState;
  lastSignInAt: string | null;
};

/**
 * The one place every demo-access action resolves and validates its target
 * shop. Never accept a shop id from the client: this always reads the
 * server-only DEMO_SHOP_ID env var, then confirms the shop is still marked
 * for internal demo use before allowing any read or write. Fails closed
 * (throws) rather than falling back to any other shop.
 */
export async function resolveDemoShopOrFail(
  admin: AdminSupabase,
): Promise<DemoShopContext> {
  const demoShopId = getDemoShopId();
  if (!demoShopId) {
    throw new Error("DEMO_SHOP_ID is not configured.");
  }

  const { data: shop, error } = await admin
    .from("shops")
    .select("id, name, shop_name, billing_entitlement_override")
    .eq("id", demoShopId)
    .maybeSingle<{
      id: string;
      name: string | null;
      shop_name: string | null;
      billing_entitlement_override: string | null;
    }>();

  if (error) {
    throw new Error(`Failed to resolve the configured demo shop: ${error.message}`);
  }
  if (!shop || shop.billing_entitlement_override !== DEMO_BILLING_ENTITLEMENT) {
    throw new Error(
      "The configured DEMO_SHOP_ID is not marked billing_entitlement_override = 'internal_demo'.",
    );
  }

  return {
    shopId: shop.id,
    shopDisplayName: (shop.shop_name ?? "").trim() || (shop.name ?? "").trim() || "Demo Shop",
  };
}

export function computeDemoAccessState(expiresAt: string): DemoAccessState {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) return "expired";
  return "active";
}

function generateTempPassword(): string {
  return randomBytes(18).toString("base64url");
}

async function fetchLastSignInAt(
  admin: AdminSupabase,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user.last_sign_in_at ?? null;
}

export async function listDemoProspects(): Promise<{
  shop: DemoShopContext;
  prospects: DemoProspect[];
}> {
  await requireOpsOperatorPageAccess();
  const admin = createAdminSupabase();
  const shop = await resolveDemoShopOrFail(admin);

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, username, created_at, demo_access_expires_at")
    .eq("shop_id", shop.shopId)
    .eq("role", "owner")
    .not("demo_access_expires_at", "is", null)
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        full_name: string | null;
        email: string | null;
        username: string | null;
        created_at: string | null;
        demo_access_expires_at: string | null;
      }[]
    >();

  if (error) {
    throw new Error(`Failed to list demo prospects: ${error.message}`);
  }

  const rows = data ?? [];
  const prospects: DemoProspect[] = await Promise.all(
    rows
      .filter(
        (row): row is typeof row & { demo_access_expires_at: string } =>
          row.demo_access_expires_at !== null,
      )
      .map(async (row) => ({
        profileId: row.id,
        fullName: row.full_name,
        email: row.email,
        username: row.username,
        createdAt: row.created_at,
        expiresAt: row.demo_access_expires_at,
        state: computeDemoAccessState(row.demo_access_expires_at),
        lastSignInAt: await fetchLastSignInAt(admin, row.id),
      })),
  );

  return { shop, prospects };
}

async function rollbackCreatedProspect(args: {
  admin: AdminSupabase;
  authUserId: string;
}): Promise<void> {
  const cleanupTables = [
    ["shop_members", "user_id"],
    ["people_workforce_profiles", "user_id"],
    ["profiles", "id"],
  ] as const;
  for (const [table, column] of cleanupTables) {
    await args.admin.from(table).delete().eq(column, args.authUserId);
  }
  await args.admin.auth.admin.deleteUser(args.authUserId);
}

export type CreateDemoProspectInput = {
  fullName: string;
  email: string;
  expiresAt: string;
};

/**
 * Access is the caller's responsibility: this is invoked from API route
 * handlers that have already resolved and checked requireOpsOperatorApiAccess()
 * (a redirect()/notFound()-based page gate cannot run inside a route handler),
 * and from listDemoProspects() below, which is page-only and checks itself.
 */
export async function createDemoProspect(
  input: CreateDemoProspectInput,
  actorProfileId: string | null,
): Promise<{ profileId: string; username: string; expiresAt: string }> {
  const admin = createAdminSupabase();
  const shop = await resolveDemoShopOrFail(admin);

  const expiresAtMs = Date.parse(input.expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error("Expiration must be a valid date/time in the future.");
  }

  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Prospect name is required.");
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid prospect email.");
  }

  const shopNamespace = buildShopUsernameNamespace(shop.shopDisplayName);
  const baseUsername = normalizeProvisioningUsername(email.split("@")[0] ?? fullName, shopNamespace);

  let username = baseUsername;
  for (let suffix = 0; suffix < 25; suffix += 1) {
    const candidate = suffix === 0 ? baseUsername : withShopUsernameSuffix(baseUsername, suffix);
    const { data: existing, error: existingErr } = await admin
      .from("profiles")
      .select("id")
      .eq("shop_id", shop.shopId)
      .ilike("username", candidate)
      .limit(1);
    if (existingErr) {
      throw new Error(`Failed to check existing usernames: ${existingErr.message}`);
    }
    if (!existing || existing.length === 0) {
      username = candidate;
      break;
    }
    if (suffix === 24) {
      throw new Error("Could not allocate a unique username for this prospect.");
    }
  }

  const tempPassword = generateTempPassword();
  const syntheticEmail = buildShopUserAuthEmail(username);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "owner",
      shop_id: shop.shopId,
      username,
      contact_email: email,
      demo_prospect: true,
    },
  });

  if (createErr || !created?.user) {
    throw new Error(createErr?.message ?? "Failed to create the prospect auth user.");
  }

  const newUserId = created.user.id;

  try {
    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: newUserId,
        email,
        full_name: fullName,
        role: "owner",
        shop_id: shop.shopId,
        shop_name: null,
        username,
        must_change_password: true,
        demo_access_expires_at: input.expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (profileErr) throw new Error(`Failed to create the prospect profile: ${profileErr.message}`);

    const { error: membershipErr } = await admin.from("shop_members").upsert(
      {
        shop_id: shop.shopId,
        user_id: newUserId,
        role: "owner",
        created_by: actorProfileId,
      },
      { onConflict: "shop_id,user_id" },
    );
    if (membershipErr) {
      throw new Error(`Failed to seed shop membership: ${membershipErr.message}`);
    }

    const { error: workforceErr } = await admin.from("people_workforce_profiles").upsert(
      {
        shop_id: shop.shopId,
        user_id: newUserId,
        employment_status: "active",
        payroll_ready: false,
        notes: "Temporary Demo Shop prospect account provisioned from /ops.",
      },
      { onConflict: "shop_id,user_id" },
    );
    if (workforceErr) {
      throw new Error(`Failed to seed the workforce profile: ${workforceErr.message}`);
    }

    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";
      await sendUserInviteEmail({
        shopId: shop.shopId,
        to: email,
        loginUrl: `${siteUrl}/login`,
        username,
        tempPassword,
        role: "owner",
        shopName: shop.shopDisplayName,
        inviterName: "ProFixIQ",
        fullName,
        resend: false,
        createdBy: actorProfileId,
      });
    } catch (inviteError) {
      console.warn("[ops/demo-access] invite email failed to send", {
        profileId: newUserId,
        error: inviteError instanceof Error ? inviteError.message : String(inviteError),
      });
    }

    return { profileId: newUserId, username, expiresAt: input.expiresAt };
  } catch (error) {
    await rollbackCreatedProspect({ admin, authUserId: newUserId });
    throw error;
  }
}

/**
 * Verifies a client-supplied profileId is actually a tracked Demo Shop
 * prospect (owner role, scoped to the configured demo shop, with a
 * demo_access_expires_at already set) before extend/revoke may touch it.
 * This is the boundary that stops a profileId for any other shop or
 * account from being reachable through these actions.
 */
async function requireDemoProspectProfile(
  admin: AdminSupabase,
  shopId: string,
  profileId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("shop_id", shopId)
    .eq("role", "owner")
    .not("demo_access_expires_at", "is", null)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Failed to verify the prospect profile: ${error.message}`);
  }
  if (!data) {
    throw new Error("This account is not a tracked Demo Shop prospect.");
  }
}

export async function extendDemoProspect(input: {
  profileId: string;
  expiresAt: string;
}): Promise<{ expiresAt: string }> {
  const admin = createAdminSupabase();
  const shop = await resolveDemoShopOrFail(admin);

  const expiresAtMs = Date.parse(input.expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error("Expiration must be a valid date/time in the future.");
  }

  await requireDemoProspectProfile(admin, shop.shopId, input.profileId);

  const { error } = await admin
    .from("profiles")
    .update({ demo_access_expires_at: input.expiresAt })
    .eq("id", input.profileId)
    .eq("shop_id", shop.shopId);

  if (error) {
    throw new Error(`Failed to extend demo access: ${error.message}`);
  }

  return { expiresAt: input.expiresAt };
}

export async function revokeDemoProspect(input: {
  profileId: string;
}): Promise<{ expiresAt: string }> {
  const admin = createAdminSupabase();
  const shop = await resolveDemoShopOrFail(admin);

  await requireDemoProspectProfile(admin, shop.shopId, input.profileId);

  const revokedAt = new Date().toISOString();
  const { error } = await admin
    .from("profiles")
    .update({ demo_access_expires_at: revokedAt })
    .eq("id", input.profileId)
    .eq("shop_id", shop.shopId);

  if (error) {
    throw new Error(`Failed to revoke demo access: ${error.message}`);
  }

  return { expiresAt: revokedAt };
}
