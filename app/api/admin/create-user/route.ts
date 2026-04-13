// app/api/admin/create-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

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

    const username = (raw.username ?? "").trim().toLowerCase();
    const password = (raw.password ?? "").trim();
    const full_name = (raw.full_name ?? null) || null;
    const requestedRole = (raw.role ?? null) || null;
    const phone = (raw.phone ?? null) || null;
    const inputEmail = (raw.email ?? "").trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }
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

    // 4) build service client to actually create auth user
    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const serviceSupabase = createClient<Database>(url, service);

    // 5) ensure username is unique
    const { data: existingProfile, error: existingErr } = await serviceSupabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json(
        { error: `Failed to check existing usernames: ${existingErr.message}` },
        { status: 500 }
      );
    }

    if (existingProfile) {
      return NextResponse.json(
        { error: "That username is already in use. Pick a different one." },
        { status: 400 }
      );
    }

    // 6) real email or synthetic
    const syntheticEmail = `${username}@local.profix-internal`;
    const email = inputEmail || syntheticEmail;

    // 7) create auth user with service client
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
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create user." },
        { status: 400 }
      );
    }

    const newUserId = created.user.id;

    // 8) upsert profile for the new user
    const { error: profileErr } = await serviceSupabase
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          email,
          full_name,
          phone,
          role: requestedRole,
          shop_id: effectiveShopId, // force caller's shop
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

    return NextResponse.json({
      ok: true,
      user_id: newUserId,
      username,
      email,
      must_change_password: true,
      shop_id: effectiveShopId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
