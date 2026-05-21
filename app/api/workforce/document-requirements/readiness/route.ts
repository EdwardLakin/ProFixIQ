import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildDocumentRequirementsReadiness } from "@/features/shared/lib/workforce/documentReadiness";
import { DEFAULT_DOCUMENT_REQUIREMENTS } from "@/features/shared/lib/workforce/documentRequirementsDefaults";

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const shopId = access.profile.shop_id;

  const [{ data: workforceProfiles, error: workforceError }, { data: docs, error: docsError }, { data: people, error: peopleError }] = await Promise.all([
    admin
      .from("people_workforce_profiles")
      .select("user_id, workforce_role, workforce_category, employment_status")
      .eq("shop_id", shopId),
    admin
      .from("employee_documents")
      .select("id, user_id, doc_type, status, expires_at, uploaded_at")
      .eq("shop_id", shopId),
    admin.from("profiles").select("id, full_name, email").eq("shop_id", shopId),
  ]);

  const firstError = workforceError ?? docsError ?? peopleError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const joinedPeople = (workforceProfiles ?? []).map((workforce) => {
    const profile = personById.get(workforce.user_id);
    return {
      id: workforce.user_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      workforce_role: workforce.workforce_role,
      workforce_category: workforce.workforce_category,
      employment_status: workforce.employment_status,
    };
  });

  const readiness = buildDocumentRequirementsReadiness({
    people: joinedPeople,
    documents: docs ?? [],
    requirements: DEFAULT_DOCUMENT_REQUIREMENTS,
    warningDays: 30,
  });

  return NextResponse.json({
    ...readiness,
    generatedAt: new Date().toISOString(),
  });
}
