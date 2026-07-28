import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { isValidScheduleDateKey } from "@/features/workforce/lib/scheduleValidation";

type Ctx = { params: Promise<{ id: string }> };
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
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const dateKey = value.trim();
  if (!dateKey) return null;
  return isValidScheduleDateKey(dateKey) ? dateKey : undefined;
}

export async function POST(req: NextRequest, context: unknown) {
  const { id: personId } = await (context as Ctx).params;
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageUsers", allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.cert_name !== "string" ||
    !body.cert_name.trim()
  ) {
    return NextResponse.json({ error: "cert_name is required" }, { status: 400 });
  }
  if (body.cert_name.trim().length > 200) {
    return NextResponse.json(
      { error: "Certification name must be 200 characters or fewer" },
      { status: 400 },
    );
  }
  const textFields = [
    ["cert_type", body.cert_type, 100],
    ["cert_number", body.cert_number, 120],
    ["issuing_body", body.issuing_body, 200],
    ["notes", body.notes, 2000],
  ] as const;
  for (const [field, value, limit] of textFields) {
    if (value !== undefined && value !== null && typeof value !== "string") {
      return NextResponse.json(
        { error: `${field} must be text` },
        { status: 400 },
      );
    }
    if (typeof value === "string" && value.trim().length > limit) {
      return NextResponse.json(
        { error: `${field} must be ${limit} characters or fewer` },
        { status: 400 },
      );
    }
  }
  const status =
    typeof body.status === "string" ? body.status.trim().toLowerCase() : "active";
  if (!["active", "pending", "expired", "revoked"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid certification status" },
      { status: 400 },
    );
  }

  const issueDate = normalizeDate(body.issue_date);
  const expiryDate = normalizeDate(body.expiry_date);
  if (issueDate === undefined) return NextResponse.json({ error: "issue_date must be a valid date" }, { status: 400 });
  if (expiryDate === undefined) return NextResponse.json({ error: "expiry_date must be a valid date" }, { status: 400 });
  if (issueDate && expiryDate && expiryDate < issueDate) {
    return NextResponse.json(
      { error: "Expiry date cannot be before issue date" },
      { status: 400 },
    );
  }

  const admin: AdminClient = createAdminSupabase();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", personId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json(
      { error: "Employee not found in this shop" },
      { status: 404 },
    );
  }

  const payload = body as CertificationPayload;
  const { data, error } = await admin
    .from("staff_certifications")
    .insert({
      shop_id: access.profile.shop_id,
      user_id: personId,
      cert_type: payload.cert_type?.trim() || "certification",
      cert_name: payload.cert_name.trim(),
      cert_number: payload.cert_number?.trim() || null,
      issuing_body: payload.issuing_body?.trim() || null,
      issue_date: issueDate,
      expiry_date: expiryDate,
      status,
      notes: payload.notes?.trim() || null,
    })
    .select("id, cert_type, cert_name, cert_number, issuing_body, issue_date, expiry_date, status, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "people.certification.created",
    target: personId,
    metadata: { shop_id: access.profile.shop_id, person_id: personId, certification_id: data.id, cert_name: data.cert_name, status: data.status },
  });

  return NextResponse.json({
    certification: data,
    ...(auditError
      ? {
          warning:
            "The certification was created, but its Activity entry could not be recorded.",
        }
      : {}),
  });
}
