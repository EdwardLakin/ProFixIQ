import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type Ctx = {
  params: Promise<{
    id: string;
    certId: string;
  }>;
};
type AdminClient = ReturnType<typeof createAdminSupabase>;
type CertificationPayload = {
  cert_type?: string;
  cert_name: string;
  cert_number?: string | null;
  issuing_body?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  status?: string;
  notes?: string | null;
};

function normalizeDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function findCertification(admin: AdminClient, shopId: string, userId: string, certId: string) {
  return admin
    .from("staff_certifications")
    .select("id, cert_type, cert_name, cert_number, issuing_body, issue_date, expiry_date, status, notes")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .eq("id", certId)
    .maybeSingle();
}

export async function PATCH(req: NextRequest, context: unknown) {
  const { id, certId } = await (context as Ctx).params;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin: AdminClient = createAdminSupabase();
  const { data: existing, error: existingErr } = await findCertification(admin, access.profile.shop_id!, id, certId);
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Certification not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body?.cert_name || typeof body.cert_name !== "string") return NextResponse.json({ error: "cert_name is required" }, { status: 400 });

  const issueDate = normalizeDate(body.issue_date);
  const expiryDate = normalizeDate(body.expiry_date);
  if (body.issue_date && !issueDate) return NextResponse.json({ error: "issue_date must be a valid date" }, { status: 400 });
  if (body.expiry_date && !expiryDate) return NextResponse.json({ error: "expiry_date must be a valid date" }, { status: 400 });

  const payload = body as CertificationPayload;
  const updatePayload = {
    cert_type: payload.cert_type ?? "certification",
    cert_name: payload.cert_name.trim(),
    cert_number: payload.cert_number?.trim() || null,
    issuing_body: payload.issuing_body?.trim() || null,
    issue_date: issueDate,
    expiry_date: expiryDate,
    status: payload.status ?? "active",
    notes: payload.notes?.trim() || null,
  };

  const { data, error } = await admin
    .from("staff_certifications")
    .update(updatePayload)
    .eq("shop_id", access.profile.shop_id)
    .eq("user_id", id)
    .eq("id", certId)
    .select("id, cert_type, cert_name, cert_number, issuing_body, issue_date, expiry_date, status, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "people.certification.updated",
    target: id,
    metadata: {
      shop_id: access.profile.shop_id,
      person_id: id,
      certification_id: certId,
      previous_status: existing.status,
      next_status: data.status,
      cert_name: data.cert_name,
    },
  });

  return NextResponse.json({ certification: data });
}

export async function DELETE(_req: NextRequest, context: unknown) {
  const { id, certId } = await (context as Ctx).params;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin: AdminClient = createAdminSupabase();
  const { data: existing, error: existingErr } = await findCertification(admin, access.profile.shop_id!, id, certId);
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Certification not found" }, { status: 404 });

  const { error } = await admin
    .from("staff_certifications")
    .delete()
    .eq("shop_id", access.profile.shop_id)
    .eq("user_id", id)
    .eq("id", certId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "people.certification.deleted",
    target: id,
    metadata: {
      shop_id: access.profile.shop_id,
      person_id: id,
      certification_id: certId,
      cert_name: existing.cert_name,
      status: existing.status,
    },
  });

  return NextResponse.json({ ok: true });
}
