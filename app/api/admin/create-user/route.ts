// app/api/admin/create-user/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

// Shape we expect from the client
type Body = {
  email: string;
  password: string;               // temp password
  full_name?: string | null;
  role?: Database["public"]["Enums"]["user_role_enum"] | null; // adjust enum name if different
  shop_id?: string | null;        // uuid as string (nullable)
  phone?: string | null;          // optional
};

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

export async function POST(req: Request) {
  try {
    // 1) Parse & validate request body
    const raw = (await req.json()) as Partial<Body>;
    const email = (raw.email ?? "").trim().toLowerCase();
    const password = (raw.password ?? "").trim();
    const full_name = (raw.full_name ?? null) || null;
    const role = (raw.role ?? null) || null;
    const shop_id = (raw.shop_id ?? null) || null;
    const phone = (raw.phone ?? null) || null;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    // 2) Admin Supabase client (Service Role)
    const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = getEnv("SUPABASE_SERVICE_ROLE_KEY");
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

    const userId = created.user.id;

    // 4) Upsert profile row (safer if retried)
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
          // include other columns your table expects; keep nulls explicit
          shop_name: null,
          updated_at: new Date().toISOString(),
        } as Database["public"]["Tables"]["profiles"]["Insert"],
        // If your Supabase version supports the second arg:
        // { onConflict: "id" }
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