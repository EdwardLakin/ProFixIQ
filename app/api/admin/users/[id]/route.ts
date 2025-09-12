import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type UserRole = DB["public"]["Enums"]["user_role_enum"];

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<DB>(url, serviceKey);
}

// -------- PUT /api/admin/users/[id] --------
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = (await req.json()) as {
      full_name?: string;
      phone?: string | null;
      role?: UserRole | null;
    };

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: body.full_name ?? null,
        phone: body.phone ?? null,
        role: body.role ?? null,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 },
    );
  }
}

// -------- DELETE /api/admin/users/[id] --------
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    // 1) Delete from auth.users
    const { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    // 2) Delete profile row (cascading if FK exists)
    const { error: profileErr } = await supabase
      .from("profiles")
      .delete()
      .eq("id", id);

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 },
    );
  }
}