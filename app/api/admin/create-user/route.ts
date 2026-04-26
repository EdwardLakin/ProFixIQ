// app/api/admin/create-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  buildShopUsernameNamespace,
  normalizeProvisioningUsername,
  withShopUsernameSuffix,
} from "@/features/users/lib/username";

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

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const raw = (await req.json()) as Partial<Body>;

    const password = (raw.password ?? "").trim();
    const full_name = (raw.full_name ?? null) || null;
    const requestedRole = (raw.role ?? null) || null;
    const phone = (raw.phone ?? null) || null;
    const inputEmail = (raw.email ?? "").trim().toLowerCase();

    if (!password) {
      return NextResponse.json({ error: "Temporary password is required." }, { status: 400 });
    }

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageUsers",
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    // Always force the creator's shop_id to preserve tenant boundaries.
    const effectiveShopId = access.profile.shop_id;

    // build service client to actually create auth user
    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const serviceSupabase = createClient<Database>(url, service);

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

    const username = normalizeProvisioningUsername(requestedUsername, shopNamespace);

    // ensure username is unique inside the current shop only
    const { data: sameShopProfiles, error: existingErr } = await serviceSupabase
      .from("profiles")
      .select("id, username")
      .eq("shop_id", effectiveShopId)
      .ilike("username", username)
      .limit(1);

    if (existingErr) {
      return NextResponse.json(
        { error: `Failed to check existing usernames: ${existingErr.message}` },
        { status: 500 }
      );
    }

    if ((sameShopProfiles ?? []).length > 0) {
      return NextResponse.json(
        { error: "A user with this username already exists in this shop." },
        { status: 400 }
      );
    }

    // Username-only auth still signs in as username@local.profix-internal.
    // We enforce a shop namespace in username normalization so this backing identity remains collision-safe.
    const syntheticEmail = `${username}@local.profix-internal`;
    const email = inputEmail || syntheticEmail;

    // create auth user with service client
    const { data: created, error: createErr } = await serviceSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role: requestedRole,
        shop_id: effectiveShopId, // force caller's shop
        phone,
        username,
      },
    });

    if (createErr || !created?.user) {
      const safeMessage = createErr?.message?.toLowerCase().includes("already been registered")
        ? "Unable to provision this username. Try the suggested shop-prefixed username."
        : (createErr?.message ?? "Failed to create user.");

      return NextResponse.json({ error: safeMessage }, { status: 400 });
    }

    const newUserId = created.user.id;

    // upsert profile for the new user
    const { error: profileErr } = await serviceSupabase
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          email,
          full_name,
          phone,
          role: requestedRole,
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
      return NextResponse.json(
        { error: `Profile upsert failed: ${profileErr.message}` },
        { status: 400 }
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
      return NextResponse.json(
        { error: `Workforce profile seed failed: ${workforceErr.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      user_id: newUserId,
      username,
      suggested_alternate_username: withShopUsernameSuffix(username, 1),
      email,
      must_change_password: true,
      shop_id: effectiveShopId,
      people_record_href: `/dashboard/admin/people/${newUserId}?from=create-user`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
