import "server-only";

import { randomInt } from "node:crypto";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";
import { getDemoShopId } from "@/features/shared/lib/server/demo-shop";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { sendUserInviteEmail } from "@/features/email/server";
import { seedDemoShopFixtures } from "@/features/ops/server/demoShopFixtures";
import {
  buildShopUserAuthEmail,
  buildShopUsernameNamespace,
  normalizeProvisioningUsername,
  withShopUsernameSuffix,
} from "@/features/users/lib/username";

const DEMO_BILLING_ENTITLEMENT = "internal_demo";

// Explicit allow-list of template-shop fields cloned into each prospect's
// own shop: business/display/config fields only. Never add a stripe_*,
// organization_id, default_stock_location_id, owner_pin*, or slug field
// here -- those are per-tenant identity/billing references that must never
// be shared across shops, demo or not. A new shops column defaults to NOT
// being cloned unless deliberately added to this list.
const CLONED_SHOP_DISPLAY_FIELDS = [
  "business_name",
  "name",
  "shop_name",
  "address",
  "postal_code",
  "city",
  "province",
  "phone_number",
  "email",
  "logo_url",
  "labor_rate",
  "supplies_percent",
  "diagnostic_fee",
  "tax_rate",
  "use_ai",
  "require_cause_correction",
  "require_authorization",
  "invoice_terms",
  "invoice_footer",
  "email_on_complete",
  "auto_generate_pdf",
  "auto_send_quote_email",
  "timezone",
  "accepts_online_booking",
  "min_notice_minutes",
  "max_lead_days",
  "country",
  "location_type",
  "shop_supplies_enabled",
  "shop_supplies_type",
  "shop_supplies_percent",
  "shop_supplies_flat_amount",
  "shop_supplies_cap_amount",
  "menu_repair_pricing_valid_days",
  "geo_lat",
  "geo_lng",
  "images",
  "plan",
  "subscription_package",
  "stripe_pricing_model",
] as const;

type AdminSupabase = ReturnType<typeof createAdminSupabase>;

export type DemoShopContext = {
  shopId: string;
  shopDisplayName: string;
};

export type DemoAccessState = "active" | "expired" | "archived";

export type DemoProspect = {
  profileId: string;
  shopId: string;
  fullName: string | null;
  email: string | null;
  username: string | null;
  createdAt: string | null;
  expiresAt: string;
  archivedAt: string | null;
  state: DemoAccessState;
  lastSignInAt: string | null;
};

/**
 * Resolves the configured template demo shop -- the read-only source every
 * new prospect's own shop is cloned from (see createDemoProspect()). Never
 * accept a shop id from the client: this always reads the server-only
 * DEMO_SHOP_ID env var, then confirms the shop is still marked for internal
 * demo use before allowing any read or write. Fails closed (throws) rather
 * than falling back to any other shop.
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

export function computeDemoAccessState(
  expiresAt: string,
  archivedAt: string | null,
): DemoAccessState {
  if (archivedAt) return "archived";
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) return "expired";
  return "active";
}

const PASSWORD_GROUPS = [
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "0123456789",
  "!@#$%^&*()_+-=",
] as const;
const PASSWORD_ALPHABET = PASSWORD_GROUPS.join("");

export function generateTempPassword(): string {
  const characters = PASSWORD_GROUPS.map((group) => group[randomInt(group.length)]);
  while (characters.length < 32) {
    characters.push(PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]);
  }
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join("");
}

async function fetchLastSignInAt(
  admin: AdminSupabase,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user.last_sign_in_at ?? null;
}

const LIST_PAGE_SIZE = 500;

type ProspectShopRow = {
  id: string;
  demo_prospect_profile_id: string | null;
  demo_shop_archived_at: string | null;
};

/**
 * Pages through every prospect shop rather than one unbounded SELECT: with
 * archiving keeping shops indefinitely (never deleting), the number of
 * prospect shops ever created only grows, and a single unpaginated query is
 * silently capped at the Data API's default 1000-row limit
 * (supabase/config.toml) -- past that cap, newer prospects would stop
 * appearing in the ops list at all.
 */
async function fetchAllProspectShops(admin: AdminSupabase): Promise<ProspectShopRow[]> {
  const rows: ProspectShopRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("shops")
      .select("id, demo_prospect_profile_id, demo_shop_archived_at")
      .eq("billing_entitlement_override", DEMO_BILLING_ENTITLEMENT)
      .not("demo_prospect_profile_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + LIST_PAGE_SIZE - 1)
      .returns<ProspectShopRow[]>();
    if (error) {
      throw new Error(`Failed to list demo prospect shops: ${error.message}`);
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < LIST_PAGE_SIZE) break;
    from += LIST_PAGE_SIZE;
  }
  return rows;
}

type ProspectProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  created_at: string | null;
  demo_access_expires_at: string | null;
};

/** Same unbounded-growth concern as fetchAllProspectShops, chunked by id. */
async function fetchProspectProfiles(
  admin: AdminSupabase,
  profileIds: string[],
): Promise<ProspectProfileRow[]> {
  const rows: ProspectProfileRow[] = [];
  for (let i = 0; i < profileIds.length; i += LIST_PAGE_SIZE) {
    const chunk = profileIds.slice(i, i + LIST_PAGE_SIZE);
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, email, username, created_at, demo_access_expires_at")
      .in("id", chunk)
      .eq("role", "owner")
      .not("demo_access_expires_at", "is", null)
      .returns<ProspectProfileRow[]>();
    if (error) {
      throw new Error(`Failed to list demo prospects: ${error.message}`);
    }
    rows.push(...(data ?? []));
  }
  return rows;
}

export async function listDemoProspects(): Promise<{
  shop: DemoShopContext;
  prospects: DemoProspect[];
}> {
  await requireOpsOperatorPageAccess();
  const admin = createAdminSupabase();
  const shop = await resolveDemoShopOrFail(admin);

  // Each prospect now owns their own cloned shop (demo_prospect_profile_id
  // not null) rather than sharing the template shop, so the prospect list
  // is driven from shops, not from profiles.shop_id = the template.
  const shopRows = await fetchAllProspectShops(admin);
  const profileIds = shopRows
    .map((row) => row.demo_prospect_profile_id)
    .filter((id): id is string => Boolean(id));

  if (profileIds.length === 0) {
    return { shop, prospects: [] };
  }

  const shopByProfileId = new Map(
    shopRows
      .filter((row): row is typeof row & { demo_prospect_profile_id: string } => Boolean(row.demo_prospect_profile_id))
      .map((row) => [row.demo_prospect_profile_id, row]),
  );

  const rows = (await fetchProspectProfiles(admin, profileIds)).sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return bTime - aTime;
  });
  const prospects: DemoProspect[] = await Promise.all(
    rows
      .filter(
        (row): row is typeof row & { demo_access_expires_at: string } =>
          row.demo_access_expires_at !== null,
      )
      .map(async (row) => {
        const prospectShop = shopByProfileId.get(row.id);
        return {
          profileId: row.id,
          shopId: prospectShop?.id ?? "",
          fullName: row.full_name,
          email: row.email,
          username: row.username,
          createdAt: row.created_at,
          expiresAt: row.demo_access_expires_at,
          archivedAt: prospectShop?.demo_shop_archived_at ?? null,
          state: computeDemoAccessState(row.demo_access_expires_at, prospectShop?.demo_shop_archived_at ?? null),
          lastSignInAt: await fetchLastSignInAt(admin, row.id),
        };
      }),
  );

  return { shop, prospects };
}

async function rollbackCreatedProspect(args: {
  admin: AdminSupabase;
  authUserId: string;
  shopId: string | null;
}): Promise<void> {
  const { admin, authUserId, shopId } = args;

  // Cleanup order matters here because of a real FK cycle: shops.owner_id is
  // NOT NULL with ON DELETE SET NULL to profiles(id), so deleting the
  // profile first (while the cloned shop still references it as owner)
  // fails the SET NULL action against that NOT NULL column. The shop must
  // go first.
  if (shopId) {
    // Fixture rows (seedDemoShopFixtures may have partially run before the
    // failure) must be cleared before the shop itself: customers has no
    // ON DELETE behavior on its shop_id FK (defaults to NO ACTION, which
    // would block deleting the shop while any customer still references
    // it), and vehicles/work_orders reference customers too. Deepest
    // dependency first avoids relying on any one FK's ON DELETE behavior.
    const fixtureTables = ["work_order_lines", "inspections", "work_orders", "vehicles", "customers"] as const;
    for (const table of fixtureTables) {
      const { error } = await admin.from(table).delete().eq("shop_id", shopId);
      if (error) {
        console.error(`[ops/demo-access] rollback: failed to clear ${table} for shop ${shopId}`, error.message);
      }
    }

    // shop_members and people_workforce_profiles both cascade-delete on
    // shops.id, so deleting the shop also clears them -- no need to delete
    // those tables separately.
    const { error: shopErr } = await admin.from("shops").delete().eq("id", shopId);
    if (shopErr) {
      console.error(`[ops/demo-access] rollback: failed to delete cloned shop ${shopId}`, shopErr.message);
    }
  }

  // Safe now that no shop references this profile via owner_id.
  // profiles.id -> auth.users(id) has no ON DELETE clause (RESTRICT-like),
  // so the profile must also be gone before deleteUser below; shop_members
  // and people_workforce_profiles cascade-delete on profiles.id too, in
  // case no shop was ever created (failure before cloneDemoShopForProspect).
  const { error: profileErr } = await admin.from("profiles").delete().eq("id", authUserId);
  if (profileErr) {
    console.error("[ops/demo-access] rollback: failed to delete prospect profile", profileErr.message);
  }

  const { error: userErr } = await admin.auth.admin.deleteUser(authUserId);
  if (userErr) {
    console.error("[ops/demo-access] rollback: failed to delete prospect auth user", userErr.message);
  }
}

/**
 * Clones the template demo shop's business/display/config fields (never
 * its Stripe identifiers, organization_id, default_stock_location_id,
 * owner_pin*, or slug -- see CLONED_SHOP_DISPLAY_FIELDS) into a brand new
 * shop row owned by the prospect. This is what gives each prospect their
 * own isolated shop_id instead of sharing the template's.
 */
async function cloneDemoShopForProspect(args: {
  admin: AdminSupabase;
  templateShopId: string;
  newOwnerId: string;
  actorProfileId: string | null;
}): Promise<string> {
  const { admin, templateShopId, newOwnerId, actorProfileId } = args;

  const { data: template, error: templateErr } = await admin
    .from("shops")
    .select(CLONED_SHOP_DISPLAY_FIELDS.join(","))
    .eq("id", templateShopId)
    .maybeSingle<Record<string, unknown>>();
  if (templateErr) {
    throw new Error(`Failed to read the template demo shop: ${templateErr.message}`);
  }
  if (!template) {
    throw new Error("The template demo shop no longer exists.");
  }

  const { data: inserted, error: insertErr } = await admin
    .from("shops")
    .insert({
      ...template,
      owner_id: newOwnerId,
      created_by: actorProfileId,
      billing_entitlement_override: DEMO_BILLING_ENTITLEMENT,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !inserted?.id) {
    throw new Error(`Failed to clone the demo shop: ${insertErr?.message ?? "no id returned"}`);
  }

  return inserted.id;
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
 *
 * Provisions a brand new shop cloned from the template (see
 * cloneDemoShopForProspect) rather than linking the prospect into a shared
 * shop -- every prospect gets their own isolated shop_id, so two concurrent
 * prospects never see each other's work orders/customers/vehicles.
 */
export async function createDemoProspect(
  input: CreateDemoProspectInput,
  actorProfileId: string | null,
): Promise<{ profileId: string; shopId: string; username: string; expiresAt: string }> {
  const admin = createAdminSupabase();
  const template = await resolveDemoShopOrFail(admin);

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

  const shopNamespace = buildShopUsernameNamespace(template.shopDisplayName);
  const baseUsername = normalizeProvisioningUsername(email.split("@")[0] ?? fullName, shopNamespace);

  // Usernames must be globally unique now, not just within one shared shop:
  // each prospect's own shop always starts empty, so a per-shop check would
  // never find a collision, yet the username still maps 1:1 to a synthetic
  // auth email (buildShopUserAuthEmail) that Supabase Auth itself enforces
  // as globally unique.
  let username = baseUsername;
  for (let suffix = 0; suffix < 25; suffix += 1) {
    const candidate = suffix === 0 ? baseUsername : withShopUsernameSuffix(baseUsername, suffix);
    const { data: existing, error: existingErr } = await admin
      .from("profiles")
      .select("id")
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
      username,
      contact_email: email,
      demo_prospect: true,
    },
  });

  if (createErr || !created?.user) {
    throw new Error(createErr?.message ?? "Failed to create the prospect auth user.");
  }

  const newUserId = created.user.id;
  let newShopId: string | null = null;

  try {
    newShopId = await cloneDemoShopForProspect({
      admin,
      templateShopId: template.shopId,
      newOwnerId: newUserId,
      actorProfileId,
    });

    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: newUserId,
        email,
        full_name: fullName,
        role: "owner",
        shop_id: newShopId,
        shop_name: null,
        username,
        must_change_password: true,
        demo_access_expires_at: input.expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (profileErr) throw new Error(`Failed to create the prospect profile: ${profileErr.message}`);

    const { error: shopLinkErr } = await admin
      .from("shops")
      .update({ demo_prospect_profile_id: newUserId })
      .eq("id", newShopId);
    if (shopLinkErr) {
      throw new Error(`Failed to link the cloned shop to its prospect: ${shopLinkErr.message}`);
    }

    const { error: membershipErr } = await admin.from("shop_members").upsert(
      {
        shop_id: newShopId,
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
        shop_id: newShopId,
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

    await seedDemoShopFixtures({ admin, shopId: newShopId, actorProfileId: newUserId });

    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";
      await sendUserInviteEmail({
        shopId: newShopId,
        to: email,
        loginUrl: `${siteUrl}/login`,
        username,
        tempPassword,
        role: "owner",
        shopName: template.shopDisplayName,
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

    return { profileId: newUserId, shopId: newShopId, username, expiresAt: input.expiresAt };
  } catch (error) {
    await rollbackCreatedProspect({ admin, authUserId: newUserId, shopId: newShopId });
    throw error;
  }
}

/**
 * Verifies a client-supplied profileId is actually a tracked Demo Shop
 * prospect (owner role, with a demo_access_expires_at already set, owning a
 * shop that's still marked billing_entitlement_override = 'internal_demo'
 * via demo_prospect_profile_id) before extend/revoke may touch it, and
 * returns that shop's id. This is the boundary that stops a profileId for
 * any other shop or account from being reachable through these actions.
 */
async function resolveProspectShopId(
  admin: AdminSupabase,
  profileId: string,
): Promise<{ shopId: string; archivedAt: string | null }> {
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, shop_id")
    .eq("id", profileId)
    .eq("role", "owner")
    .not("demo_access_expires_at", "is", null)
    .maybeSingle<{ id: string; shop_id: string | null }>();

  if (profileErr) {
    throw new Error(`Failed to verify the prospect profile: ${profileErr.message}`);
  }
  if (!profile?.shop_id) {
    throw new Error("This account is not a tracked Demo Shop prospect.");
  }

  const { data: shop, error: shopErr } = await admin
    .from("shops")
    .select("id, demo_shop_archived_at")
    .eq("id", profile.shop_id)
    .eq("demo_prospect_profile_id", profileId)
    .eq("billing_entitlement_override", DEMO_BILLING_ENTITLEMENT)
    .maybeSingle<{ id: string; demo_shop_archived_at: string | null }>();

  if (shopErr) {
    throw new Error(`Failed to verify the prospect's shop: ${shopErr.message}`);
  }
  if (!shop) {
    throw new Error("This account is not a tracked Demo Shop prospect.");
  }

  return { shopId: shop.id, archivedAt: shop.demo_shop_archived_at };
}

export async function extendDemoProspect(input: {
  profileId: string;
  expiresAt: string;
}): Promise<{ expiresAt: string }> {
  const admin = createAdminSupabase();

  const expiresAtMs = Date.parse(input.expiresAt);
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error("Expiration must be a valid date/time in the future.");
  }

  const { shopId, archivedAt } = await resolveProspectShopId(admin, input.profileId);

  const { error } = await admin
    .from("profiles")
    .update({ demo_access_expires_at: input.expiresAt })
    .eq("id", input.profileId)
    .eq("shop_id", shopId);

  if (error) {
    throw new Error(`Failed to extend demo access: ${error.message}`);
  }

  // Archiving never deletes data -- restore access to the prospect's own
  // still-intact shop by clearing the archive marker, and restore every
  // member profile archiving had expired alongside the owner (see
  // archive_expired_demo_shops()) to this same new expiry, not just the
  // owner's own profile -- otherwise staff would stay locked out forever
  // even after their shop is un-archived.
  if (archivedAt) {
    const { error: unarchiveErr } = await admin
      .from("shops")
      .update({ demo_shop_archived_at: null })
      .eq("id", shopId);
    if (unarchiveErr) {
      throw new Error(`Failed to restore the archived demo shop: ${unarchiveErr.message}`);
    }

    const { error: membersErr } = await admin
      .from("profiles")
      .update({ demo_access_expires_at: input.expiresAt })
      .eq("shop_id", shopId)
      .neq("id", input.profileId)
      .not("demo_access_expires_at", "is", null);
    if (membersErr) {
      throw new Error(`Failed to restore the archived shop's member access: ${membersErr.message}`);
    }
  }

  return { expiresAt: input.expiresAt };
}

export async function revokeDemoProspect(input: {
  profileId: string;
}): Promise<{ expiresAt: string }> {
  const admin = createAdminSupabase();
  const { shopId } = await resolveProspectShopId(admin, input.profileId);

  const revokedAt = new Date().toISOString();
  const { error } = await admin
    .from("profiles")
    .update({ demo_access_expires_at: revokedAt })
    .eq("id", input.profileId)
    .eq("shop_id", shopId);

  if (error) {
    throw new Error(`Failed to revoke demo access: ${error.message}`);
  }

  return { expiresAt: revokedAt };
}

/**
 * Marks every prospect shop past its grace period as archived (never
 * deletes data -- see the shops.demo_shop_archived_at migration) and
 * expires every member profile of each shop it archives, not just the
 * owner -- see archive_expired_demo_shops() in
 * 20261002162857_archive_expired_demo_shops_fn.sql for why. Runs as one
 * atomic, uncapped database-side statement rather than separate
 * SELECT/SELECT/UPDATE round trips, so it can't race a concurrent extend()
 * and isn't bound by the Data API's row cap. Intended to run from a
 * scheduled job (see app/api/internal/demo/archive-expired), not from any
 * user-facing code path.
 */
export async function archiveExpiredDemoProspects(args: {
  graceMs: number;
}): Promise<{ archivedShopIds: string[] }> {
  const admin = createAdminSupabase();
  const cutoff = new Date(Date.now() - args.graceMs).toISOString();

  const { data, error } = await admin
    .rpc("archive_expired_demo_shops", { p_cutoff: cutoff })
    .returns<{ shop_id: string }[]>();

  if (error) {
    throw new Error(`Failed to archive expired demo shops: ${error.message}`);
  }

  return { archivedShopIds: (data ?? []).map((row) => row.shop_id) };
}
