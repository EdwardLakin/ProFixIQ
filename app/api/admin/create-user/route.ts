// app/api/admin/create-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Body = {
  // NEW: username is now the primary thing the owner enters
  username: string;
  // optional: owner can still give a real email if they want
  email?: string | null;
  password: string;
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

    // If the admin didn't supply a real email, make a synthetic one that is stable.
    // This keeps Supabase Auth happy, but users will sign in with username.
    const syntheticEmail = `${username}@local.profix-internal`;
    const email = inputEmail || syntheticEmail;

    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient<Database>(url, service);

    // 1) Create auth user
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no email flow; mark as confirmed
      user_metadata: {
        full_name,
        role,
        shop_id,
        phone,
        username, // store here too
      },
    });

    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create user." },
        { status: 400 }
      );
    }

    const userId = created.user.id;

    // 2) Upsert the profile
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId, // profiles.id = auth.user.id in your schema
          email, // might be synthetic
          full_name,
          phone,
          role,
          shop_id,
          shop_name: null,
          username, // NEW
          must_change_password: true, // NEW: force them to change on first sign-in
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

    return NextResponse.json({ ok: true, user_id: userId, username, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}