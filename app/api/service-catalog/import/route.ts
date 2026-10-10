import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { toImportPayload } from "@/features/service-catalog/lib/parseServiceCatalog";
import {
  SERVICE_CATALOG_ROLES,
  readCatalogRequest,
} from "@/features/service-catalog/server/readCatalogRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportResult = {
  ok?: boolean;
  servicesCreated?: number;
  servicesUpdated?: number;
  templatesCreated?: number;
  templatesUpdated?: number;
  linksCreated?: number;
  partsAttached?: number;
  partsRequested?: number;
  partsAmbiguous?: number;
  templatesLaborSet?: number;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Confirmed import: one transaction, templates → services → links. */
export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: [...SERVICE_CATALOG_ROLES] });
  if (!access.ok) return access.response;

  const parsed = await readCatalogRequest(req);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: "bad_request", detail: parsed.detail }, { status: parsed.status });
  }

  const { plan, csvHash } = parsed;
  const payload = toImportPayload(plan);
  if (payload.services.length === 0) {
    return NextResponse.json(
      { ok: false, error: "nothing_to_import", detail: "No services are ready to import. Review the flagged rows first." },
      { status: 422 },
    );
  }

  const { data, error } = (await (access.supabase as unknown as RpcClient).rpc("import_service_catalog_complete", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_actor_auth_user_id: access.authUserId,
    p_source_ref: `csv:${csvHash}:${randomUUID()}`,
    p_templates: payload.templates,
    p_services: payload.services,
    p_parts: payload.parts,
  })) as { data: ImportResult | null; error: { message: string } | null };

  if (error || !data?.ok) {
    const detail = error?.message ?? "The catalog could not be imported.";
    const status = /not authorized|identity|member/i.test(detail) ? 403 : /required|invalid|range|negative|too (large|long)|needs|unknown/i.test(detail) ? 400 : 500;
    return NextResponse.json({ ok: false, error: "import_failed", detail }, { status });
  }

  return NextResponse.json({
    ok: true,
    servicesCreated: data.servicesCreated ?? 0,
    servicesUpdated: data.servicesUpdated ?? 0,
    templatesCreated: data.templatesCreated ?? 0,
    templatesUpdated: data.templatesUpdated ?? 0,
    linksCreated: data.linksCreated ?? 0,
    partsAttached: data.partsAttached ?? 0,
    partsRequested: data.partsRequested ?? 0,
    partsAmbiguous: data.partsAmbiguous ?? 0,
    templatesLaborSet: data.templatesLaborSet ?? 0,
    reviewRequired: plan.summary.reviewRequired,
  });
}
