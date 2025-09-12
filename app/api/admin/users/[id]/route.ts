// app/api/admin/users/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(url, service);

// ✅ PUT /api/admin/users/:id
export const PUT = async (req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };
  const { id } = params;

  try {
    const body = (await req.json()) as {
      full_name?: string | null;
      role?: Database["public"]["Enums"]["user_role_enum"] | null;
    };

    if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
};

// ✅ DELETE /api/admin/users/:id
export const DELETE = async (_req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };
  const { id } = params;

  try {
    if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    // Remove profile row
    const { error: profileErr } = await supabase.from("profiles").delete().eq("id", id);
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

    // Remove Supabase Auth user
    const { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (authErr) {
      return NextResponse.json(
        { ok: false, warning: "Profile deleted but failed to delete auth user", error: authErr.message },
        { status: 207 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
};