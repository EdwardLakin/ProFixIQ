import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TILES } from "@/features/shared/config/tiles";
import {
  ESTIMATE_ADVISOR_ROLES,
  ESTIMATE_PARTS_ROLES,
  ESTIMATE_VIEW_ROLES,
  estimateActorForRole,
} from "@/features/estimates/lib/access";
import {
  estimateNextOwner,
  estimatePrimaryAction,
  estimateStatusLabel,
} from "@/features/estimates/lib/status";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

const migration = readFileSync(
  "supabase/migrations/20260802024436_advisor_estimate_workflow.sql",
  "utf8",
);
const portalQuote = readFileSync(
  "features/portal/app/quotes/[id]/QuotePageClient.tsx",
  "utf8",
);
const quoteSendRoute = readFileSync("app/api/quotes/send/route.ts", "utf8");
const quoteSaveRoute = readFileSync(
  "app/api/parts/requests/items/[itemId]/quote-save/route.ts",
  "utf8",
);
const portalQuoteList = readFileSync("app/portal/quotes/page.tsx", "utf8");
const portalQuoteListData = readFileSync(
  "features/portal/server/listPortalQuotes.ts",
  "utf8",
);
const portalQuotePresentation = readFileSync(
  "features/portal/lib/quoteApprovalPresentation.ts",
  "utf8",
);
const quoteLifecycleStatus = readFileSync(
  "features/work-orders/lib/quotes/quoteLifecycleStatus.ts",
  "utf8",
);
const roleSidebar = readFileSync(
  "features/shared/components/RoleSidebar.tsx",
  "utf8",
);
const dashboardIdentity = readFileSync(
  "features/dashboard/server/dashboard-shell-data.ts",
  "utf8",
);
const estimateBuilder = readFileSync(
  "features/estimates/components/EstimateBuilder.tsx",
  "utf8",
);
const estimateData = readFileSync("features/estimates/server/data.ts", "utf8");
const estimateRoutes = [
  "app/api/estimates/route.ts",
  "app/api/estimates/[id]/route.ts",
  "app/api/estimates/[id]/submit-parts/route.ts",
  "app/api/estimates/[id]/parts-complete/route.ts",
  "app/api/estimates/[id]/return-to-parts/route.ts",
].map((path) => readFileSync(path, "utf8"));

describe("advisor estimate workflow", () => {
  it("keeps one canonical work-order record and uses valid base work-order states", () => {
    expect(migration).toContain(
      "record_type text not null default 'work_order'",
    );
    expect(migration).toContain("'estimate', v_estimate_number, 'draft'");
    expect(migration).toContain("v_custom_id, 'new', 'repair'");
    expect(migration).toContain("p_expires_at, null, 'pending'");
    expect(migration).toContain(
      "create table if not exists public.estimate_internal_details",
    );
    expect(migration).toContain("Staff-only estimate notes");
    expect(migration).toContain("line_notes = excluded.line_notes");
    expect(migration).not.toContain("v_custom_id, 'estimate', 'estimate'");
    expect(migration).not.toContain("status = 'authorized'");
    expect(migration).not.toContain(
      "status = case when v_declined > 0 then 'cancelled'",
    );
  });

  it("guards every mutation by shop membership, role, revision, and idempotency", () => {
    expect(migration).toContain("v_actor_user_id uuid := auth.uid()");
    expect(migration).toContain(
      "p.id = (select auth.uid()) or p.user_id = (select auth.uid())",
    );
    expect(migration).toContain(
      "where id = p_work_order_id and shop_id = p_shop_id",
    );
    expect(migration).toContain(
      "v_work_order.estimate_revision <> p_expected_revision",
    );
    expect(migration).toContain("unique (shop_id, idempotency_key)");
    expect(migration).toContain(
      "work_order_id uuid references public.work_orders(id) on delete set null",
    );
    expect(migration).toContain("part_requests_estimate_revision_key");
    expect(migration).toContain("part_request_items_request_source_key");
    expect(migration).toContain("estimate_events_sent_revision_key");
    expect(migration).toContain(
      "where event_type in ('send_reserved', 'send_failed', 'sent')",
    );
    expect(migration).toContain(
      "length(btrim(idempotency_key)) between 1 and 200",
    );
    expect(migration).toContain("A valid expected revision is required.");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("to authenticated;");
    expect(migration).toContain(
      "create policy part_request_items_update_same_shop_parent_request",
    );
    expect(migration).toContain(
      "public.can_update_part_request_items(pr.shop_id)",
    );
    expect(migration).toContain("'parts', 'lead_hand', 'foreman'");
    expect(migration).toContain(
      "create or replace function public.can_update_estimate_part_request_items",
    );
    expect(migration).toContain("'parts', 'lead_hand', 'foreman'");
    expect(migration).toContain("e.event_type = 'send_reserved'");
    expect(migration).toContain("e.event_type = 'send_failed'");
  });

  it("derives RLS shop and role context from either supported profile identity", () => {
    expect(migration).toContain(
      "create or replace function public.current_shop_id()",
    );
    expect(migration).toContain(
      "create or replace function public.profixiq_current_role()",
    );
    expect(migration).toContain(
      "create or replace function public.set_current_shop_id(p_shop_id uuid)",
    );
    expect(migration).toContain("p.user_id = (select auth.uid())");
    expect(migration).toContain(
      "without relying on mutable request-local settings",
    );
    expect(migration).toContain("create policy estimate_staff_shop_read");
    expect(migration).toContain("create policy estimate_staff_customer_read");
  });

  it("keeps Parts provenance on auth-user ids while lifecycle audit uses profile ids", () => {
    expect(migration).toContain(
      "p_shop_id, p_work_order_id, v_quote.id, v_actor_user_id",
    );
    expect(migration).toContain(
      "p_shop_id, p_work_order_id, v_new_quote_line_id, v_actor_user_id",
    );
    expect(migration).toContain("'parts_completed', v_actor_profile_id");
  });

  it("preserves immutable revisions and releases only canonical approval behavior", () => {
    expect(migration).toContain(
      "v_new_revision := v_work_order.estimate_revision + 1",
    );
    expect(migration).toContain(
      "Rebuild from the canonical current request items",
    );
    expect(migration).toContain("'item:' || pri.id::text");
    expect(migration).toContain("'requested_parts', v_parts");
    expect(migration).toContain("'superseded_by_quote_line_id'");
    expect(migration).toContain(
      "'superseded_prior_sent_to_customer_at', sent_to_customer_at",
    );
    expect(migration).toContain("sent_to_customer_at = null");
    expect(migration).toContain(
      "Lines with inventory or purchase activity cannot be revised.",
    );
    expect(migration).toContain("estimate_status = 'waiting_for_parts'");
    expect(migration).toContain("approval_state = case");
    expect(migration).toContain(
      "estimate_converted_at = coalesce(estimate_converted_at, now())",
    );
    expect(migration).toContain(
      "v_work_order.estimate_status = 'waiting_for_parts'",
    );
    expect(quoteSaveRoute).toContain(
      'estimate.estimate_status !== "waiting_for_parts"',
    );
    expect(quoteSaveRoute).toContain(
      "estimate.estimate_revision !== parentRequest.source_revision",
    );
    expect(quoteSaveRoute).toContain("ESTIMATE_PARTS_ROLES.some");
    expect(migration).toContain(
      "prevent_estimate_part_quote_changes_after_handoff",
    );
    expect(migration).toContain("prevent_estimate_part_item_structure_changes");
    expect(migration).toContain(
      "create policy part_request_items_estimate_role_update",
    );
    expect(migration).toContain(
      "create policy work_order_quote_lines_estimate_update",
    );
    expect(migration).toContain(
      "create or replace function public.can_select_estimate_quote_line",
    );
    expect(migration).toContain(
      "create or replace function public.can_select_estimate_work_order",
    );
    expect(migration).toContain("create policy work_orders_estimate_insert");
    expect(migration).toContain("create policy work_orders_estimate_update");
    expect(migration).toContain("or record_type = 'work_order'");
    expect(migration).toContain("Draft, Parts, and superseded revisions");
    expect(migration).toContain(
      "v_status not in ('cancelled', 'canceled', 'rejected', 'superseded', 'voided')",
    );
    expect(migration).toContain("p_sent_to_customer_at is not null");
    expect(migration).toContain(
      "prevent_estimate_quote_commercial_changes_after_handoff",
    );
    expect(migration).toContain("as restrictive");
    expect(migration).toContain(
      "v_estimate_status is distinct from 'waiting_for_parts'",
    );
  });

  it("reuses mutation keys after ambiguous network failures", () => {
    expect(estimateBuilder).toContain(
      "idempotencyKeysRef.current.get(actionKey)",
    );
    expect(estimateBuilder).toContain(
      "idempotencyKeysRef.current.set(actionKey, idempotencyKey)",
    );
    expect(estimateBuilder).toContain(
      "idempotencyKeysRef.current.delete(actionKey)",
    );
    expect(estimateBuilder).toContain(
      "const existingCreated = createdEstimateRef.current",
    );
    expect(estimateBuilder).toMatch(
      /existingCreated\s*\?\?\s*\(\s*await runMutation/,
    );
    expect(estimateBuilder).toContain(
      "if (existingCreated || created.idempotent)",
    );
    expect(estimateBuilder).toContain("save-created-draft:");
    expect(estimateBuilder).toContain(
      'stateBody.estimate.estimateStatus !== "draft"',
    );
  });

  it("hides superseded revisions and never prices customer parts from internal cost", () => {
    expect(portalQuotePresentation).toContain("isHiddenQuoteLifecycleStatus");
    for (const status of [
      "cancelled",
      "canceled",
      "voided",
      "rejected",
      "superseded",
    ]) {
      expect(quoteLifecycleStatus).toContain(`"${status}"`);
    }
    expect(portalQuote).toContain(
      "part.unitPrice ?? part.unit_price ?? part.quoted_price ?? part.price",
    );
    expect(portalQuote).toContain(
      "getQuoteParts(line, Boolean(wo.estimate_number))",
    );
    expect(portalQuote).toMatch(
      /const customerLineNotes\s*=\s*wo\.estimate_number\s*\?\s*""\s*:\s*safeTrim\(line\.notes\)/,
    );
    const quoteParts = portalQuote.slice(
      portalQuote.indexOf("function getQuoteParts"),
      portalQuote.indexOf("function getEvidencePhotos"),
    );
    expect(quoteParts).not.toContain("part.unit_cost");
    expect(quoteParts).not.toContain("part.unitCost");
    expect(portalQuoteList).toContain("listPortalQuotesForCustomer");
    expect(portalQuoteListData).toContain("isCustomerVisibleQuoteLine");
    expect(portalQuoteListData).toContain("isHiddenQuoteRevision");
    expect(portalQuoteListData).not.toContain(
      'or("external_id.like.portal_quote:%,estimate_number.not.is.null")',
    );
    expect(estimateData).toMatch(
      /const includeInternalCost\s*=\s*\["owner",\s*"admin",\s*"manager",\s*"parts"\]\.includes\(\s*input\.role,?\s*\)/,
    );
    expect(estimateData).toContain(
      "unitCost: includeInternalCost ? asNullableNumber(row.unit_cost) : null",
    );
    expect(estimateData).toContain('.from("estimate_internal_details")');
    expect(migration).toContain("'items', coalesce((");
    expect(migration).not.toContain("'adjustment_note', nullif");
  });

  it("keeps auth-user and canonical-profile audit identities distinct", () => {
    expect(quoteSendRoute).toContain("sent_by: access.authUserId");
    expect(quoteSendRoute).toContain('req.headers.get("Idempotency-Key")');
    expect(quoteSendRoute).toContain("estimateSendReplayResponse");
    expect(quoteSendRoute).toContain("findAcceptedEstimateEmail");
    expect(quoteSendRoute).toContain("recoverAcceptedEstimateSend");
    expect(quoteSendRoute).toContain("reservationResult.accepted_at");
    expect(quoteSendRoute).toContain('delivery_state: "accepted"');
    expect(quoteSendRoute).toContain("QuoteDeliveryBlockedError");
    expect(quoteSendRoute).toContain('"reserve_estimate_send_atomic"');
    expect(quoteSendRoute).toContain('"finalize_estimate_send_atomic"');
    expect(quoteSendRoute).toContain("p_actor_profile_id: access.profile.id");
    expect(quoteSendRoute).toContain("p_actor_user_id: access.authUserId");
    expect(quoteSendRoute).toMatch(
      /approval_state:\s*estimateHasApprovedLines\s*\?\s*"partial"\s*:\s*"pending"/,
    );
    expect(migration).toContain("to service_role;");
    expect(migration).toContain("'delivery_uncertain'");
    expect(migration).not.toContain(
      "estimate_sent_by = coalesce(estimate_sent_by, new.sent_by)",
    );
  });

  it("derives estimate delivery context from canonical tenant data", () => {
    expect(quoteSendRoute).toContain("let customerEmail = wo.estimate_number");
    expect(quoteSendRoute).toContain('.eq("shop_id", wo.shop_id)');
    expect(quoteSendRoute).toContain(
      'let shopName = wo.estimate_number ? "" : safeStr(body?.shopName).trim()',
    );
    expect(quoteSendRoute).toContain(
      "let quoteTotal: number | undefined = wo.estimate_number",
    );
    expect(quoteSendRoute).toMatch(
      /const pdfUrl\s*=\s*wo\.estimate_number\s*\?\s*null\s*:\s*\(body\?\.pdfUrl\s*\?\?\s*null\)/,
    );
    expect(quoteSendRoute).toContain(
      "const shouldSkipAsDuplicate = legacyReservationAccepted",
    );
    expect(quoteSendRoute).toContain(
      '"transition_legacy_quote_send_atomic"',
    );
    expect(quoteSendRoute).toContain(
      "shopSuppliesTaxableSubtotal(shopSupplies)",
    );
    expect(quoteSendRoute).toContain("isProvinceCode(province)");
    expect(quoteSendRoute).toContain("getTaxAmount(fallbackTax)");
    expect(quoteSendRoute).toContain("estimatePortalQuoteUrl");
    expect(migration).toContain(
      "lower(btrim(coalesce(c.email, ''))) = v_customer_email",
    );
    expect(migration).toContain(
      "regexp_replace(coalesce(c.phone, c.phone_number, ''), '[^0-9]', '', 'g')",
    );
    expect(migration).toContain(
      "This VIN is already assigned to another customer. Contact shop/admin to move vehicle.",
    );
  });

  it("gates sidebar visibility and actions by shop role", () => {
    const estimateTiles = TILES.filter((tile) => tile.href === "/estimates");
    const visibleRoles = new Set(estimateTiles.flatMap((tile) => tile.roles));

    for (const role of ESTIMATE_VIEW_ROLES)
      expect(visibleRoles.has(role)).toBe(true);
    expect(visibleRoles.has("mechanic")).toBe(false);
    expect(visibleRoles.has("driver")).toBe(false);

    expect(estimateActorForRole("advisor")).toMatchObject({
      canCreate: true,
      canSend: true,
      canCompleteParts: false,
    });
    expect(estimateActorForRole("parts")).toMatchObject({
      canCreate: false,
      canSend: false,
      canCompleteParts: true,
      mode: "parts",
    });
    expect(estimateActorForRole("lead_hand")).toMatchObject({
      canCreate: false,
      canSend: false,
      canCompleteParts: true,
      mode: "parts",
    });
    expect(estimateActorForRole("foreman")).toMatchObject({
      canCreate: true,
      canSend: true,
      canCompleteParts: true,
      mode: "advisor",
    });
    expect(ESTIMATE_ADVISOR_ROLES).not.toContain("parts");
    expect(ESTIMATE_PARTS_ROLES).not.toContain("advisor");
    expect(canonicalizeRole("service_advisor")).toBe("service");
    expect(canonicalizeRole("service advisor")).toBe("service");
    expect(migration).toContain("when 'service_advisor' then 'service'");
    expect(roleSidebar).not.toContain(
      'canonical === "customer" || canonical === "service"',
    );
    expect(roleSidebar).toContain(
      "if (profile?.role) setRole(normalizeRole(profile.role))",
    );
    expect(dashboardIdentity).toContain("resolveAuthenticatedStaffProfile");
  });

  it("enforces server and API gates in addition to sidebar visibility", () => {
    for (const route of estimateRoutes) {
      expect(route).toContain("requireShopScopedApiAccess");
    }
    for (const route of estimateRoutes.filter(
      (source) =>
        source.includes("export async function POST") ||
        source.includes("export async function PATCH"),
    )) {
      expect(route).toContain("requireIdempotencyKey");
    }
    expect(estimateRoutes.join("\n")).not.toContain(
      '.from("work_orders").insert',
    );
    expect(estimateRoutes.join("\n")).toContain('rpc("create_estimate_atomic"');
    expect(estimateRoutes.join("\n")).toMatch(
      /\.rpc\(\s*"complete_estimate_parts_quote_atomic"/,
    );
  });

  it("makes ownership and the next action explicit", () => {
    expect(estimateStatusLabel("ready_for_advisor")).toBe("Ready for Advisor");
    expect(estimateNextOwner("waiting_for_parts")).toBe("Parts");
    expect(estimateNextOwner("sent")).toBe("Customer");
    expect(estimatePrimaryAction("waiting_for_parts", "parts")).toBe(
      "Complete Parts Quote",
    );
    expect(estimatePrimaryAction("ready_for_advisor", "advisor")).toBe(
      "Send Estimate",
    );
    expect(estimateBuilder).toContain("const hasDeliveryEmail");
    expect(estimateBuilder).toContain(
      "Add an email address to the customer record",
    );
    expect(estimateBuilder).toContain("href={`/customers/${customer.id}`}");
    expect(estimateBuilder).toContain("Repair subtotal");
  });
});
