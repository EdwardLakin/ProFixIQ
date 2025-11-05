// app/api/admin/create-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

type Body = {
  username: string; // 👈 now username-based
  password: string;
  full_name?: string | null;
  role?: UserRole | null;
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

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient<Database>(url, service);

    // 👇 we give Supabase Auth *something* for email — a synthetic one
    const syntheticEmail = `${username}@noemail.local`;

    // (optional) check username uniqueness in profiles
    // if you don't have `username` column yet, comment this block out
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existingProfile) {
      return NextResponse.json(
        { error: "Username already exists." },
        { status: 409 }
      );
    }

    // 3) Create auth user (no real email flow)
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true, // 👈 mark as confirmed so it won't try to send email
        user_metadata: {
          username,
          full_name,
          role,
          shop_id,
          phone,
        },
      });

    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create user." },
        { status: 400 }
      );
    }

    const userId = created.user.id;

    // 4) Upsert profile with username
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: syntheticEmail,
          username, // 👈 new
          full_name,
          phone,
          role,
          shop_id,
          shop_name: null,
          must_change_password: true, // 👈 if this column exists
          updated_at: new Date().toISOString(),
        } as Database["public"]["Tables"]["profiles"]["Insert"]
      );

    if (profileErr) {
      return NextResponse.json(
        { error: `Profile upsert failed: ${profileErr.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, user_id: userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}