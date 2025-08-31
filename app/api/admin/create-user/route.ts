import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export async function POST(req: Request) {
  try {
    const { email, password, full_name, role, shop_id } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient<Database>(url, service);

    // 1) Create auth user
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role, shop_id },
    });
    if (createErr || !created?.user) {
      return NextResponse.json({ error: createErr?.message || "Failed to create user" }, { status: 500 });
    }

    // 2) Insert profile row
    const { error: profileErr } = await supabase.from("profiles").insert({
      id: created.user.id,
      full_name: full_name ?? null,
      role: role ?? null,
      shop_id: shop_id ?? null,
      shop_name: null,
    });
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user_id: created.user.id });
  } catch (e) {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
