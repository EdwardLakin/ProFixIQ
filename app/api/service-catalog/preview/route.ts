import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  SERVICE_CATALOG_ROLES,
  readCatalogRequest,
} from "@/features/service-catalog/server/readCatalogRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Analyze only. Performs no writes. */
export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: [...SERVICE_CATALOG_ROLES] });
  if (!access.ok) return access.response;

  const parsed = await readCatalogRequest(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "bad_request", detail: parsed.detail }, { status: parsed.status });
  }
  const { plan } = parsed;

  const importableKeys = plan.services.filter((s) => !s.needsReview).map((s) => s.serviceKey);
  const existing = new Set<string>();
  if (importableKeys.length > 0) {
    const { data, error } = await access.supabase
      .from("menu_items")
      .select("service_key")
      .eq("shop_id", access.profile.shop_id)
      .in("service_key", importableKeys);
    if (error) {
      return NextResponse.json(
        { ok: false, error: "lookup_failed", detail: "Could not check existing services." },
        { status: 500 },
      );
    }
    for (const row of data ?? []) if (row.service_key) existing.add(row.service_key);
  }

  return NextResponse.json({
    ok: true,
    summary: {
      ...plan.summary,
      servicesToCreate: importableKeys.filter((key) => !existing.has(key)).length,
      servicesToUpdate: importableKeys.filter((key) => existing.has(key)).length,
    },
    services: plan.services.map((s) => ({
      importKey: s.importKey,
      serviceCode: s.serviceCode,
      name: s.name,
      laborHours: s.laborHours,
      price: s.price,
      inspection: s.templateName,
      status: s.needsReview ? "review" : existing.has(s.serviceKey) ? "update" : "new",
      reviewReason: s.reviewReason,
    })),
    templates: plan.templates.map((t) => ({
      importKey: t.importKey,
      name: t.templateName,
      itemCount: t.itemCount,
      sectionCount: t.sections.length,
      status: t.needsReview ? "review" : "ready",
    })),
    warnings: plan.warnings,
  });
}
