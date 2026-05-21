import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  DEFAULT_DOCUMENT_REQUIREMENTS,
  buildEffectiveDocumentRequirements,
} from "@/features/shared/lib/workforce/documentRequirementsDefaults";
import {
  isActiveOverrideConflict,
  validateDocumentRequirementPayload,
} from "@/features/shared/lib/workforce/documentRequirementOverrideValidation";

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const { data: overrides, error } = await admin
    .from("workforce_document_requirements")
    .select("*")
    .eq("shop_id", access.profile.shop_id)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    defaults: DEFAULT_DOCUMENT_REQUIREMENTS,
    overrides: overrides ?? [],
    effective: buildEffectiveDocumentRequirements(DEFAULT_DOCUMENT_REQUIREMENTS, overrides ?? []),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  let payload: Record<string, unknown>;
  try {
    payload = validateDocumentRequirementPayload(body, "create") as Record<string, unknown>;
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const insertPayload: Record<string, unknown> = {
    ...payload,
    shop_id: access.profile.shop_id,
    created_by: access.profile.id ?? null,
    updated_by: access.profile.id ?? null,
  };

  const { data, error } = await admin
    .from("workforce_document_requirements")
    .insert(insertPayload)
    .select("*")
    .single();

  if (isActiveOverrideConflict(error)) {
    return NextResponse.json(
      {
        error: "Active override already exists for this role/category/doc_type scope",
        code: "ACTIVE_OVERRIDE_CONFLICT",
        conflict_key: {
          workforce_role: (insertPayload.workforce_role as string | null | undefined) ?? null,
          workforce_category: (insertPayload.workforce_category as string | null | undefined) ?? null,
          doc_type: insertPayload.doc_type as string,
        },
      },
      { status: 409 }
    );
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void admin.from("audit_logs").insert({
    actor_id: access.profile.id ?? null,
    action: "workforce.document_requirement.override.created",
    target: data.id,
    metadata: { shop_id: access.profile.shop_id },
  });

  return NextResponse.json(data, { status: 201 });
}
