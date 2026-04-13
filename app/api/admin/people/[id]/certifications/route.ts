import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, context: unknown) {
  const { params } = context as Ctx;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  if (!body?.cert_name) return NextResponse.json({ error: "cert_name is required" }, { status: 400 });

  const admin = createAdminSupabase() as any;
  const { data, error } = await admin
    .from("staff_certifications")
    .insert({
      shop_id: access.profile.shop_id,
      user_id: params.id,
      cert_type: body.cert_type ?? "certification",
      cert_name: body.cert_name,
      cert_number: body.cert_number ?? null,
      issuing_body: body.issuing_body ?? null,
      issue_date: body.issue_date ?? null,
      expiry_date: body.expiry_date ?? null,
      status: body.status ?? "active",
      notes: body.notes ?? null,
    })
    .select("id, cert_type, cert_name, cert_number, issuing_body, issue_date, expiry_date, status, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ certification: data });
}
