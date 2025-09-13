// app/api/admin/create-user/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Body = {
  email: string;
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
    // 1) Parse & validate input
    const raw = (await req.json()) as Partial<Body>;
    const email = (raw.email ?? "").trim().toLowerCase();
    const password = (raw.password ?? "").trim();
    const full_name = (raw.full_name ?? null) || null;
    const role = (raw.role ?? null) || null;
    const shop_id = (raw.shop_id ?? null) || null;
    const phone = (raw.phone ?? null) || null;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    // 2) Admin client (service role – server only)
    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient<Database>(url, service);

    // 3) Create auth user
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role, shop_id, phone },
    });
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Failed to create user." },
        { status: 400 },
      );
    }

    // 4) Upsert profile (id = auth.user.id)
    const userId = created.user.id;
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name,
          phone,
          role,
          shop_id,
          shop_name: null,
          updated_at: new Date().toISOString(),
        } as Database["public"]["Tables"]["profiles"]["Insert"],
      );
    if (profileErr) {
      return NextResponse.json(
        { error: `Profile upsert failed: ${profileErr.message}` },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, user_id: userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}