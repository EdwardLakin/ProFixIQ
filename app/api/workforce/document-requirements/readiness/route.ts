import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildDocumentRequirementsReadiness } from "@/features/shared/lib/workforce/documentReadiness";
import {
  DEFAULT_DOCUMENT_REQUIREMENTS,
  buildEffectiveDocumentRequirements,
} from "@/features/shared/lib/workforce/documentRequirementsDefaults";
import { composeActiveWorkforceRoster } from "@/features/workforce/lib/roster";
import { getShopScheduleDateContext } from "@/features/workforce/lib/schedulePosture";

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const shopId = access.profile.shop_id;

  const [{ data: workforceProfiles, error: workforceError }, { data: docs, error: docsError }, { data: people, error: peopleError }, { data: requirementOverrides, error: requirementsError }, { data: shop, error: shopError }] =
    await Promise.all([
      admin
        .from("people_workforce_profiles")
        .select("user_id, workforce_role, workforce_category, employment_status, payroll_ready")
        .eq("shop_id", shopId),
      admin
        .from("employee_documents")
        .select("id, user_id, doc_type, status, expires_at, uploaded_at")
        .eq("shop_id", shopId),
      admin
        .from("profiles")
        .select("id, full_name, username, email, role")
        .eq("shop_id", shopId),
      admin
        .from("workforce_document_requirements")
        .select("id, workforce_role, workforce_category, doc_type, label, is_required, expires_required, expires_warning_days, priority, is_active")
        .eq("shop_id", shopId),
      admin
        .from("shops")
        .select("timezone")
        .eq("id", shopId)
        .maybeSingle(),
    ]);

  const firstError = workforceError ?? docsError ?? peopleError ?? requirementsError ?? shopError;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const workforceByUser = new Map(
    (workforceProfiles ?? []).map((workforce) => [
      workforce.user_id,
      workforce,
    ]),
  );
  const activeRoster = composeActiveWorkforceRoster({
    profiles: people ?? [],
    workforceProfiles: workforceProfiles ?? [],
  });
  const joinedPeople = activeRoster.map((profile) => {
    const workforce = workforceByUser.get(profile.id);
    return {
      id: profile.id,
      full_name: profile.displayName,
      email: profile.email,
      workforce_role: workforce?.workforce_role ?? null,
      workforce_category:
        workforce?.workforce_category ?? profile.role ?? null,
      employment_status: profile.employmentStatus,
    };
  });

  const effectiveRequirements = buildEffectiveDocumentRequirements(DEFAULT_DOCUMENT_REQUIREMENTS, requirementOverrides ?? []);

  const readiness = buildDocumentRequirementsReadiness({
    people: joinedPeople,
    documents: docs ?? [],
    requirements: effectiveRequirements,
    warningDays: 30,
    todayDateKey: getShopScheduleDateContext(
      new Date(),
      shop?.timezone,
    ).dateKey,
  });

  return NextResponse.json({
    ...readiness,
    generatedAt: new Date().toISOString(),
  });
}
