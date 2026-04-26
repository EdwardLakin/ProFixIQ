import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type ResetScope = "intake" | "shop";
type Domain = "customer" | "vehicle" | "work_order" | "work_order_line" | "invoice";
type PreviewCode =
  | "UNSUPPORTED_SCOPE"
  | "INTAKE_REQUIRED"
  | "INTAKE_NOT_FOUND"
  | "SHOP_INTAKE_MISMATCH"
  | "NO_PROVENANCE_ROWS"
  | "LEGACY_TAGGED_ONLY"
  | "PROVENANCE_QUERY_FAILED"
  | "AUTH_RBAC_FAILURE"
  | "PREVIEW_COLLECTION_FAILED";

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

type PreviewDiagnostics = {
  code: PreviewCode;
  message: string;
  context?: Record<string, unknown>;
};

const RESET_CONFIRM_PREFIX = "RESET SHOP BOOST IMPORT";
const DOMAINS: Domain[] = ["customer", "vehicle", "work_order", "work_order_line", "invoice"];

function parseScope(raw: string | null): { ok: true; scope: ResetScope } | { ok: false } {
  if (!raw || raw === "intake") return { ok: true, scope: "intake" };
  if (raw === "shop") return { ok: true, scope: "shop" };
  return { ok: false };
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

function errorDetails(error: unknown): { message: string; stack?: string; cause?: unknown } {
  if (error instanceof Error) {
    const message = error.message?.trim() || "Unexpected error with empty message";
    return { message, stack: error.stack };
  }
  const message = typeof error === "string" && error.trim() ? error : JSON.stringify(error);
  return { message: message || "Unknown non-error thrown", cause: error };
}

async function countExact(query: PromiseLike<{ count: number | null; error: { message?: string | null; code?: string | null; details?: string | null; hint?: string | null } | null }>): Promise<number> {
  const { count, error } = await query;
  if (error) {
    const message = [error.message, error.code, error.details, error.hint].filter((token) => typeof token === "string" && token.trim().length > 0).join(" | ");
    throw new Error(message || "Database query failed with empty error metadata");
  }
  return Number(count ?? 0);
}

async function collectCounts(args: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  scope: ResetScope;
  intakeId: string | null;
}): Promise<{ counts: ResetCounts; diagnostics: PreviewDiagnostics[] }> {
  const { admin, shopId, scope, intakeId } = args;
  const intakeScoped = scope === "intake" && intakeId;
  const diagnostics: PreviewDiagnostics[] = [];

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
    try {
      const query = (admin as any)
        .from("shop_boost_import_provenance")
        .select("id", { head: true, count: "exact" })
        .eq("shop_id", shopId)
        .eq("domain", domain);
      if (intakeScoped) query.eq("intake_id", intakeId);
      provenance[domain] = await countExact(query as any);
    } catch (error) {
      const details = errorDetails(error);
      diagnostics.push({
        code: "PROVENANCE_QUERY_FAILED",
        message: details.message,
        context: { domain, intakeId, shopId },
      });
      provenance[domain] = 0;
    }
  }

  const counts: ResetCounts = {
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

  const totalProvenanceRows = Object.values(counts.provenance).reduce((acc, value) => acc + Number(value ?? 0), 0);
  const totalLegacyRows = Object.values(counts.legacyTagged).reduce((acc, value) => acc + Number(value ?? 0), 0);

  if (totalProvenanceRows === 0 && totalLegacyRows === 0) {
    diagnostics.push({
      code: "NO_PROVENANCE_ROWS",
      message: "No provenance-tagged records were found for this scope.",
      context: { scope, intakeId },
    });
  }
  if (totalProvenanceRows === 0 && totalLegacyRows > 0) {
    diagnostics.push({
      code: "LEGACY_TAGGED_ONLY",
      message: "Only legacy-tagged rows were found. Provenance-backed deletions will delete zero artifacts.",
      context: { legacyTagged: counts.legacyTagged },
    });
  }

  return { counts, diagnostics };
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
  if (error) {
    const message = [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
    throw new Error(message || `Failed to load provenance IDs for domain=${domain}`);
  }
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
    if (error) throw new Error(error.message || `Failed deleting chunk from ${table}`);
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
  if (error) throw new Error(error.message || "Failed writing reset audit event");
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
    .select("id,shop_id")
    .eq("id", args.intakeId)
    .maybeSingle<{ id: string; shop_id: string }>();
  if (error) throw new Error(error.message || "Failed validating intake scope");
  if (!data?.id) {
    const err = new Error("Intake not found");
    err.name = "INTAKE_NOT_FOUND";
    throw err;
  }
  if (data.shop_id !== args.shopId) {
    const err = new Error("Intake belongs to a different shop");
    err.name = "SHOP_INTAKE_MISMATCH";
    throw err;
  }
}

function rbacFailureResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "Owner/admin role required.",
      diagnostics: [{ code: "AUTH_RBAC_FAILURE", message: "Owner/admin role required for import reset." }],
    },
    { status: 403 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return rbacFailureResponse();

  const url = new URL(req.url);
  const scopeParsed = parseScope(url.searchParams.get("scope"));
  if (!scopeParsed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported scope. Use intake or shop.",
        diagnostics: [{ code: "UNSUPPORTED_SCOPE", message: "scope must be intake or shop" }],
      },
      { status: 400 },
    );
  }
  const scope = scopeParsed.scope;
  const intakeId = normalizeId(url.searchParams.get("intakeId"));
  if (scope === "intake" && !intakeId) {
    return NextResponse.json(
      {
        ok: false,
        error: "intakeId is required when scope=intake",
        diagnostics: [{ code: "INTAKE_REQUIRED", message: "intakeId is required when scope=intake" }],
      },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminSupabase();
    await validateScope({ admin, shopId: access.profile.shop_id as string, scope, intakeId });
    const { counts, diagnostics } = await collectCounts({ admin, shopId: access.profile.shop_id as string, scope, intakeId });

    return NextResponse.json({
      ok: true,
      scope,
      shopId: access.profile.shop_id,
      intakeId,
      expectedConfirmationText: buildExpectedConfirmation(scope, access.profile.shop_id as string, intakeId),
      counts,
      diagnostics,
      previewSource: {
        artifactCounts: "shop tables (customers/vehicles/work_orders/invoices with intake linkage)",
        provenanceCounts: "shop_boost_import_provenance by domain",
        resetDeletionSource: "provenance only",
      },
      safety: {
        strongDeletionUsesProvenance: true,
        legacyTaggingCanBeAmbiguous: true,
      },
    });
  } catch (error) {
    const details = errorDetails(error);
    const code: PreviewCode =
      error instanceof Error && error.name === "INTAKE_NOT_FOUND"
        ? "INTAKE_NOT_FOUND"
        : error instanceof Error && error.name === "SHOP_INTAKE_MISMATCH"
          ? "SHOP_INTAKE_MISMATCH"
          : "PREVIEW_COLLECTION_FAILED";
    console.error("[shop-boost/import-reset] preview collection failed", {
      shopId: access.profile.shop_id,
      scope,
      intakeId,
      code,
      errorMessage: details.message,
      stack: details.stack,
    });
    return NextResponse.json(
      {
        ok: false,
        error: details.message,
        diagnostics: [{ code, message: details.message, context: { scope, intakeId } }],
      },
      { status: code === "INTAKE_NOT_FOUND" ? 404 : code === "SHOP_INTAKE_MISMATCH" ? 409 : 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return rbacFailureResponse();

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
    const { counts, diagnostics } = await collectCounts({ admin, shopId, scope, intakeId });

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
      return NextResponse.json({ ok: true, dryRun: true, scope, shopId, intakeId, expectedConfirmationText, counts, diagnostics });
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
      if (error) throw new Error(error.message || "Failed deleting provenance rows");
      deletedCounts.provenanceRows =
        customerIds.length + vehicleIds.length + workOrderIds.length + workOrderLineIds.length + invoiceIds.length;
    }

    {
      const q = admin.from("staff_invite_candidates").delete().eq("shop_id", shopId).eq("source", "shop_boost_import");
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting staff invite candidates");
      deletedCounts.staffInviteCandidates = counts.staffInviteCandidates;
    }
    {
      const q = admin.from("staff_invite_suggestions").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting staff invite suggestions");
      deletedCounts.staffInviteSuggestions = counts.staffInviteSuggestions;
    }
    {
      const q = admin.from("shop_import_rows").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting import rows");
      deletedCounts.importRows = counts.importRows;
    }
    {
      const q = admin.from("shop_import_files").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting import files");
      deletedCounts.importFiles = counts.importFiles;
    }
    {
      const q = (admin as any).from("shop_boost_review_audit_events").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting review audit events");
      deletedCounts.reviewAuditEvents = counts.reviewAuditEvents;
    }
    {
      const q = (admin as any).from("shop_boost_integrity_reports").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting integrity reports");
      deletedCounts.integrityReports = counts.integrityReports;
    }
    {
      const q = admin.from("shop_boost_row_results").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting row results");
      deletedCounts.rowResults = counts.rowResults;
    }
    {
      const q = admin.from("shop_boost_review_items").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("intake_id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting review items");
      deletedCounts.reviewItems = counts.reviewItems;
    }
    {
      const q = admin.from("shop_boost_intakes").delete().eq("shop_id", shopId);
      if (scope === "intake" && intakeId) q.eq("id", intakeId);
      const { error } = await q;
      if (error) throw new Error(error.message || "Failed deleting intake rows");
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
      diagnostics,
      notes: {
        deletedUsingStrongProvenance: counts.provenance,
        legacyTaggedNotDeleted: counts.legacyTagged,
      },
    });
  } catch (error) {
    const details = errorDetails(error);
    console.error("[shop-boost/import-reset] execute failed", {
      shopId,
      scope,
      intakeId,
      errorMessage: details.message,
      stack: details.stack,
    });
    return NextResponse.json({ ok: false, error: details.message }, { status: 500 });
  }
}
