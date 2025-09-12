// app/api/admin/users/[id]/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// One client is fine here (App Route runs per request on server)
const supabase = createClient<Database>(url, service);

type Params = { params: { id: string } };

// PUT /api/admin/users/:id
// Body: { full_name?: string, role?: Database["public"]["Enums"]["user_role_enum"] }
export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = params;
    const body = (await req.json()) as {
      full_name?: string | null;
      role?: Database["public"]["Enums"]["user_role_enum"] | null;
    };

    if (!id) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }
    if (body.full_name == null && body.role == null) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        ...(body.full_name !== undefined ? { full_name: body.full_name } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/users/:id
// Deletes profile row AND the Supabase Auth user.
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    // Delete profile row first (id is FK to auth.user)
    const { error: profileErr } = await supabase.from("profiles").delete().eq("id", id);
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // Delete auth user (requires service role key)
    const { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (authErr) {
      // Not fatal for DB consistency (profile is already gone), but report it
      return NextResponse.json(
        { ok: false, warning: "Profile deleted but failed to delete auth user", error: authErr.message },
        { status: 207 }, // Multi-Status
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}