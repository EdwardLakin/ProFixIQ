import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  isActiveOverrideConflict,
  validateDocumentRequirementPayload,
} from "@/features/shared/lib/workforce/documentRequirementOverrideValidation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const body = await req.json().catch(() => null);

  let payload: Record<string, unknown>;
  try {
    payload = validateDocumentRequirementPayload(body, "patch") as Record<string, unknown>;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: existing, error: findError } = await admin
    .from("workforce_document_requirements")
    .select("id,shop_id,is_active")
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updatePayload = { ...payload, updated_by: access.profile.id ?? null };

  const { data, error } = await admin
    .from("workforce_document_requirements")
    .update(updatePayload)
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
    .select("*")
    .single();

  if (isActiveOverrideConflict(error)) {
    return NextResponse.json(
      {
        error: "Active override already exists for this role/category/doc_type scope",
        code: "ACTIVE_OVERRIDE_CONFLICT",
        conflict_key: {
          workforce_role: (payload.workforce_role as string | null | undefined) ?? null,
          workforce_category: (payload.workforce_category as string | null | undefined) ?? null,
          doc_type: (payload.doc_type as string | undefined) ?? undefined,
        },
      },
      { status: 409 }
    );
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const action = existing.is_active && payload.is_active === false
    ? "workforce.document_requirement.override.disabled"
    : "workforce.document_requirement.override.updated";

  void admin.from("audit_logs").insert({
    actor_id: access.profile.id ?? null,
    action,
    target: id,
    metadata: { shop_id: access.profile.shop_id },
  });

  return NextResponse.json(data);
}
