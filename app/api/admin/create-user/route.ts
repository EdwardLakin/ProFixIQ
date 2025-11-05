// app/api/admin/create-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Body = {
  username: string; // primary identifier now
  email?: string | null; // optional, owner can still give one
  password: string; // temp password
  full_name?: string | null;
  role?: Database["public"]["Enums"]["user_role_enum"] | null;
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

    // 1) basic normalization
    const username = (raw.username ?? "").trim().toLowerCase();
    const password = (raw.password ?? "").trim();
    const full_name = (raw.full_name ?? null) || null;
    const role = (raw.role ?? null) || null;
    const shop_id = (raw.shop_id ?? null) || null;
    const phone = (raw.phone ?? null) || null;
    const inputEmail = (raw.email ?? "").trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "Temporary password is required." }, { status: 400 });
    }

    // 2) build auth client
    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient<Database>(url, service);

    // 3) check if that username already exists in profiles
    //    (you said you only have the owner now, but let's make it future-safe)
    const { data: existingProfile, error: existingErr } = await supabase
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

    // 4) Supabase Auth still requires an email. If owner didn't give one,
    //    we make a stable synthetic email based on the username.
    //    Using a domain that won't collide with real emails:
    const syntheticEmail = `${username}@local.profix-internal`;
    const email = inputEmail || syntheticEmail;

    // 5) create auth user (no email flow — we mark as confirmed)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
        shop_id,
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

    const userId = created.user.id;

    // 6) upsert profile so the app can see the user
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId, // keep profiles.id = auth.user.id
          email, // maybe synthetic
          full_name,
          phone,
          role,
          shop_id,
          shop_name: null,
          username,
          must_change_password: true, // ✅ force change on first sign-in
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
      user_id: userId,
      username,
      email,
      must_change_password: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}