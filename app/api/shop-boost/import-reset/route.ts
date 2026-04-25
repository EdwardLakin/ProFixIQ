import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type ResetScope = "intake" | "shop";
type Domain = "customer" | "vehicle" | "work_order" | "work_order_line" | "invoice";

type ResetCounts = {
  intakes: number;
  reviewItems: number;
  rowResults: number;
  reviewAuditEvents: number;
  integrityReports: number;
  importFiles: number;
  importRows: number;
  staffInviteSuggestions: number;
  staffInviteCandidates: number;
  provenance: Record<Domain, number>;
  legacyTagged: {
    customers: number;
    vehicles: number;
    workOrders: number;
    workOrderLines: number;
    invoices: number;
  };
};

const RESET_CONFIRM_PREFIX = "RESET SHOP BOOST IMPORT";
const DOMAINS: Domain[] = ["customer", "vehicle", "work_order", "work_order_line", "invoice"];

function parseScope(raw: string | null): ResetScope {
  return raw === "shop" ? "shop" : "intake";
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildExpectedConfirmation(scope: ResetScope, shopId: string, intakeId: string | null): string {
  if (scope === "shop") return `${RESET_CONFIRM_PREFIX}S ${shopId}`;
  return `${RESET_CONFIRM_PREFIX} ${intakeId ?? ""}`.trim();
}

async function countExact(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return Number(count ?? 0);
}

async function collectCounts(args: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  scope: ResetScope;
  intakeId: string | null;
}): Promise<ResetCounts> {
  const { admin, shopId, scope, intakeId } = args;
  const intakeScoped = scope === "intake" && intakeId;

  const [
    intakes,
    reviewItems,
    rowResults,
    reviewAuditEvents,
    integrityReports,
    importFiles,
    importRows,
    staffInviteSuggestions,
    staffInviteCandidates,
    legacyCustomers,
    legacyVehicles,
    legacyWorkOrders,
    legacyWorkOrderLines,
    legacyInvoices,
  ] = await Promise.all([
    countExact(
      (intakeScoped
        ? admin.from("shop_boost_intakes").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("id", intakeId)
        : admin.from("shop_boost_intakes").select("id", { head: true, count: "exact" }).eq("shop_id", shopId)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("shop_boost_review_items").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("intake_id", intakeId)
        : admin.from("shop_boost_review_items").select("id", { head: true, count: "exact" }).eq("shop_id", shopId)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("shop_boost_row_results").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("intake_id", intakeId)
        : admin.from("shop_boost_row_results").select("id", { head: true, count: "exact" }).eq("shop_id", shopId)) as any,
    ),
    countExact(
      (intakeScoped
        ? (admin as any).from("shop_boost_review_audit_events").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("intake_id", intakeId)
        : (admin as any).from("shop_boost_review_audit_events").select("id", { head: true, count: "exact" }).eq("shop_id", shopId)) as any,
    ),
    countExact(
      (intakeScoped
        ? (admin as any).from("shop_boost_integrity_reports").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("intake_id", intakeId)
        : (admin as any).from("shop_boost_integrity_reports").select("id", { head: true, count: "exact" }).eq("shop_id", shopId)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("shop_import_files").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("intake_id", intakeId)
        : admin.from("shop_import_files").select("id", { head: true, count: "exact" }).eq("shop_id", shopId)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("shop_import_rows").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("intake_id", intakeId)
        : admin.from("shop_import_rows").select("id", { head: true, count: "exact" }).eq("shop_id", shopId)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("staff_invite_suggestions").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("intake_id", intakeId)
        : admin.from("staff_invite_suggestions").select("id", { head: true, count: "exact" }).eq("shop_id", shopId)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin
            .from("staff_invite_candidates")
            .select("id", { head: true, count: "exact" })
            .eq("shop_id", shopId)
            .eq("intake_id", intakeId)
            .eq("source", "shop_boost_import")
        : admin
            .from("staff_invite_candidates")
            .select("id", { head: true, count: "exact" })
            .eq("shop_id", shopId)
            .eq("source", "shop_boost_import")) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("customers").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("source_intake_id", intakeId)
        : admin.from("customers").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).not("source_intake_id", "is", null)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("vehicles").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("source_intake_id", intakeId)
        : admin.from("vehicles").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).not("source_intake_id", "is", null)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("work_orders").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("source_intake_id", intakeId)
        : admin.from("work_orders").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).not("source_intake_id", "is", null)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("work_order_lines").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).eq("source_intake_id", intakeId)
        : admin.from("work_order_lines").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).not("source_intake_id", "is", null)) as any,
    ),
    countExact(
      (intakeScoped
        ? admin.from("invoices").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).contains("metadata", { source_intake_id: intakeId })
        : admin.from("invoices").select("id", { head: true, count: "exact" }).eq("shop_id", shopId).contains("metadata", { imported: true })) as any,
    ),
  ]);

  const provenance: Record<Domain, number> = {
    customer: 0,
    vehicle: 0,
    work_order: 0,
    work_order_line: 0,
    invoice: 0,
  };

  for (const domain of DOMAINS) {
    const query = (admin as any)
      .from("shop_boost_import_provenance")
      .select("id", { head: true, count: "exact" })
      .eq("shop_id", shopId)
      .eq("domain", domain);
    if (intakeScoped) query.eq("intake_id", intakeId);
    provenance[domain] = await countExact(query as any);
  }

  return {
    intakes,
    reviewItems,
    rowResults,
    reviewAuditEvents,
    integrityReports,
    importFiles,
    importRows,
    staffInviteSuggestions,
    staffInviteCandidates,
    provenance,
    legacyTagged: {
      customers: legacyCustomers,
      vehicles: legacyVehicles,
      workOrders: legacyWorkOrders,
      workOrderLines: legacyWorkOrderLines,
      invoices: legacyInvoices,
    },
  };
}

async function loadProvenanceRecordIds(args: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  scope: ResetScope;
  intakeId: string | null;
  domain: Domain;
}): Promise<string[]> {
  const { admin, shopId, scope, intakeId, domain } = args;
  const intakeScoped = scope === "intake" && intakeId;
  const query = (admin as any)
    .from("shop_boost_import_provenance")
    .select("record_id")
    .eq("shop_id", shopId)
    .eq("domain", domain)
    .limit(100000);
  if (intakeScoped) query.eq("intake_id", intakeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { record_id?: string | null }) => String(row.record_id ?? "")).filter(Boolean);
}

async function deleteByIds(args: {
  admin: ReturnType<typeof createAdminSupabase>;
  table: "customers" | "vehicles" | "work_orders" | "work_order_lines" | "invoices";
  shopId: string;
  ids: string[];
}): Promise<number> {
  const { admin, table, shopId, ids } = args;
  if (ids.length === 0) return 0;
  const chunkSize = 500;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await admin.from(table).delete().eq("shop_id", shopId).in("id", chunk);
    if (error) throw new Error(error.message);
    deleted += chunk.length;
  }
  return deleted;
}

async function writeAudit(args: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  intakeId: string | null;
  actorUserId: string;
  scope: ResetScope;
  mode: "preview" | "execute";
  confirmationText: string;
  previewCounts: ResetCounts;
  deletedCounts: Record<string, number>;
}): Promise<void> {
  const { error } = await (args.admin as any).from("shop_boost_import_reset_audit_events").insert({
    shop_id: args.shopId,
    intake_id: args.intakeId,
    actor_user_id: args.actorUserId,
    scope: args.scope,
    mode: args.mode,
    confirmation_text: args.confirmationText,
    preview_counts: args.previewCounts,
    deleted_counts: args.deletedCounts,
  });
  if (error) throw new Error(error.message);
}

async function validateScope(args: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  scope: ResetScope;
  intakeId: string | null;
}): Promise<void> {
  if (args.scope !== "intake" || !args.intakeId) return;
  const { data, error } = await args.admin
    .from("shop_boost_intakes")
    .select("id")
    .eq("shop_id", args.shopId)
    .eq("id", args.intakeId)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Intake not found for this shop");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const url = new URL(req.url);
  const scope = parseScope(url.searchParams.get("scope"));
  const intakeId = normalizeId(url.searchParams.get("intakeId"));
  if (scope === "intake" && !intakeId) {
    return NextResponse.json({ ok: false, error: "intakeId is required when scope=intake" }, { status: 400 });
  }

  try {
    const admin = createAdminSupabase();
    await validateScope({ admin, shopId: access.profile.shop_id as string, scope, intakeId });
    const counts = await collectCounts({ admin, shopId: access.profile.shop_id as string, scope, intakeId });
    return NextResponse.json({
      ok: true,
      scope,
      shopId: access.profile.shop_id,
      intakeId,
      expectedConfirmationText: buildExpectedConfirmation(scope, access.profile.shop_id as string, intakeId),
      counts,
      safety: {
        strongDeletionUsesProvenance: true,
        legacyTaggingCanBeAmbiguous: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reset preview";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as {
    scope?: ResetScope;
    intakeId?: string | null;
    dryRun?: boolean;
    confirmationText?: string;
  };

  const scope = body.scope === "shop" ? "shop" : "intake";
  const intakeId = normalizeId(body.intakeId ?? null);
  const dryRun = body.dryRun !== false;
  const shopId = access.profile.shop_id as string;

  if (scope === "intake" && !intakeId) {
    return NextResponse.json({ ok: false, error: "intakeId is required when scope=intake" }, { status: 400 });
  }

  const expectedConfirmationText = buildExpectedConfirmation(scope, shopId, intakeId);
  if (String(body.confirmationText ?? "").trim() !== expectedConfirmationText) {
    return NextResponse.json(
      {
        ok: false,
        error: "Confirmation text mismatch",
        expectedConfirmationText,
      },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminSupabase();
    await validateScope({ admin, shopId, scope, intakeId });
    const counts = await collectCounts({ admin, shopId, scope, intakeId });

    if (dryRun) {
      await writeAudit({
        admin,
        shopId,
        intakeId,
        actorUserId: access.profile.id,
        scope,
        mode: "preview",
        confirmationText: expectedConfirmationText,
        previewCounts: counts,
        deletedCounts: {},
      });
      return NextResponse.json({ ok: true, dryRun: true, scope, shopId, intakeId, expectedConfirmationText, counts });
    }

    const customerIds = await loadProvenanceRecordIds({ admin, shopId, scope, intakeId, domain: "customer" });
    const vehicleIds = await loadProvenanceRecordIds({ admin, shopId, scope, intakeId, domain: "vehicle" });
    const workOrderIds = await loadProvenanceRecordIds({ admin, shopId, scope, intakeId, domain: "work_order" });
    const workOrderLineIds = await loadProvenanceRecordIds({ admin, shopId, scope, intakeId, domain: "work_order_line" });
    const invoiceIds = await loadProvenanceRecordIds({ admin, shopId, scope, intakeId, domain: "invoice" });

    const deletedCounts: Record<string, number> = {
      reviewItems: 0,
      rowResults: 0,
      reviewAuditEvents: 0,
      integrityReports: 0,
      importRows: 0,
      importFiles: 0,
      staffInviteSuggestions: 0,
      staffInviteCandidates: 0,
      provenanceRows: 0,
      customers: 0,
      vehicles: 0,
      workOrders: 0,
      workOrderLines: 0,
      invoices: 0,
      intakes: 0,
    };

    deletedCounts.invoices = await deleteByIds({ admin, table: "invoices", shopId, ids: invoiceIds });
    deletedCounts.workOrderLines = await deleteByIds({ admin, table: "work_order_lines", shopId, ids: workOrderLineIds });
    deletedCounts.workOrders = await deleteByIds({ admin, table: "work_orders", shopId, ids: workOrderIds });
    deletedCounts.vehicles = await deleteByIds({ admin, table: "vehicles", shopId, ids: vehicleIds });
    deletedCounts.customers = await deleteByIds({ admin, table: "customers", shopId, ids: customerIds });

    {
      const q = (admin as any).from("shop_boost_import_provenance").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.provenanceRows =
        customerIds.length + vehicleIds.length + workOrderIds.length + workOrderLineIds.length + invoiceIds.length;
    }

    {
      const q = admin.from("staff_invite_candidates").delete().eq("shop_id", shopId).eq("source", "shop_boost_import");
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.staffInviteCandidates = counts.staffInviteCandidates;
    }
    {
      const q = admin.from("staff_invite_suggestions").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.staffInviteSuggestions = counts.staffInviteSuggestions;
    }
    {
      const q = admin.from("shop_import_rows").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.importRows = counts.importRows;
    }
    {
      const q = admin.from("shop_import_files").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.importFiles = counts.importFiles;
    }
    {
      const q = (admin as any).from("shop_boost_review_audit_events").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.reviewAuditEvents = counts.reviewAuditEvents;
    }
    {
      const q = (admin as any).from("shop_boost_integrity_reports").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.integrityReports = counts.integrityReports;
    }
    {
      const q = admin.from("shop_boost_row_results").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.rowResults = counts.rowResults;
    }
    {
      const q = admin.from("shop_boost_review_items").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.reviewItems = counts.reviewItems;
    }
    {
      const q = admin.from("shop_boost_intakes").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message);
      deletedCounts.intakes = counts.intakes;
    }

    await writeAudit({
      admin,
      shopId,
      intakeId,
      actorUserId: access.profile.id,
      scope,
      mode: "execute",
      confirmationText: expectedConfirmationText,
      previewCounts: counts,
      deletedCounts,
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      scope,
      shopId,
      intakeId,
      expectedConfirmationText,
      previewCounts: counts,
      deletedCounts,
      notes: {
        deletedUsingStrongProvenance: counts.provenance,
        legacyTaggedNotDeleted: counts.legacyTagged,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import reset failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
