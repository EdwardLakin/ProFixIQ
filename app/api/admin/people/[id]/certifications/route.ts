import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type Ctx = { params: { id: string } };

function normalizeDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest, context: unknown) {
  const { params } = context as Ctx;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  if (!body?.cert_name || typeof body.cert_name !== "string") {
    return NextResponse.json({ error: "cert_name is required" }, { status: 400 });
  }

  const issueDate = normalizeDate(body.issue_date);
  const expiryDate = normalizeDate(body.expiry_date);
  if (body.issue_date && !issueDate) return NextResponse.json({ error: "issue_date must be a valid date" }, { status: 400 });
  if (body.expiry_date && !expiryDate) return NextResponse.json({ error: "expiry_date must be a valid date" }, { status: 400 });

  const admin = createAdminSupabase() as any;
  const { data, error } = await admin
    .from("staff_certifications")
    .insert({
      shop_id: access.profile.shop_id,
      user_id: params.id,
      cert_type: body.cert_type ?? "certification",
      cert_name: body.cert_name.trim(),
      cert_number: body.cert_number?.trim() || null,
      issuing_body: body.issuing_body?.trim() || null,
      issue_date: issueDate,
      expiry_date: expiryDate,
      status: body.status ?? "active",
      notes: body.notes?.trim() || null,
    })
    .select("id, cert_type, cert_name, cert_number, issuing_body, issue_date, expiry_date, status, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "people.certification.created",
    target: params.id,
    metadata: { shop_id: access.profile.shop_id, person_id: params.id, certification_id: data.id, cert_name: data.cert_name, status: data.status },
  });

  return NextResponse.json({ certification: data });
}
