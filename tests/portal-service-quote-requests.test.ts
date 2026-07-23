import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDiagnosticRequestNotes,
  diagnosticRequestIsComplete,
} from "../features/portal/lib/request/diagnosticDetails";

const source = (path: string) => readFileSync(path, "utf8");

describe("customer portal service and quote requests", () => {
  it("keeps known services fast and stores detail on only the diagnostic line", () => {
    const page = source("app/portal/request/build/page.tsx");
    expect(page).toContain("Add menu items");
    expect(page).toContain("Something needs diagnosis");
    expect(page).toContain("buildDiagnosticRequestNotes");
    expect(page).not.toContain("Please complete the intake form first");
    expect(page).not.toContain("PORTAL INTAKE");
  });

  it("formats the technician-facing diagnostic story without empty answers", () => {
    const details = {
      concern: "Steering wheel shakes",
      timing: "At 90–110 km/h",
      frequency: "Every time",
      conditions: "Light acceleration",
      warningLights: "None",
      drivable: "unsure" as const,
      additionalNotes: "Started last week",
    };
    expect(diagnosticRequestIsComplete(details)).toBe(true);
    expect(buildDiagnosticRequestNotes(details)).toBe([
      "When it happens: At 90–110 km/h",
      "How often: Every time",
      "Conditions: Light acceleration",
      "Warning lights / codes: None",
      "Safe to drive: unsure",
      "Customer notes: Started last week",
    ].join("\n"));
    expect(buildDiagnosticRequestNotes({ concern: "Noise" })).toBe("");
  });

  it("creates repair and parts-only quote requests atomically and tenant-scoped", () => {
    const migration = source("supabase/migrations/20260723010000_portal_service_quote_requests.sql");
    expect(migration).toContain("create_portal_quote_request_atomic");
    expect(migration).toContain("add_portal_diagnostic_line_atomic");
    expect(migration).toContain("set job_type = 'diagnostic'");
    expect(migration).toContain("work_orders_portal_quote_external_id_unique");
    expect(migration).toContain("external_id, notes, created_at");
    expect(migration).not.toMatch(/source_row_id\s+like\s+'portal_quote:%'/i);
    expect(migration).toContain("auth.uid() is distinct from p_actor_user_id");
    expect(migration).toContain("v.customer_id = p_customer_id");
    expect(migration).toContain("v.shop_id = p_shop_id");
    expect(migration).toContain("'request_kind', v_kind");
    expect(migration).toContain("insert into public.part_requests");
    expect(migration).toContain("insert into public.part_request_items");
    expect(migration).toContain("portal_lifecycle_operation_keys");
  });

  it("books an approved repair quote on its existing work order", () => {
    const migration = source("supabase/migrations/20260723010000_portal_service_quote_requests.sql");
    const startRoute = source("app/api/portal/request/start/route.ts");
    expect(migration).toContain("book_portal_repair_quote_atomic");
    expect(migration).toContain("Approve this repair quote before booking it.");
    expect(migration).toContain("v_quote_line.work_order_id");
    expect(startRoute).toContain('rpc("book_portal_repair_quote_atomic"');
    expect(startRoute).toContain("quoteBooking: true");
  });

  it("uses the canonical quote approval and invoice payment paths", () => {
    const approval = source("features/portal/components/QuoteApprovalActions.tsx");
    const quotePage = source("features/portal/app/quotes/[id]/QuotePageClient.tsx");
    const submit = source("app/api/portal/request/submit/route.ts");
    expect(approval).toContain('"Idempotency-Key": operationKey');
    expect(quotePage).toContain("PortalInvoicePayButton");
    expect(quotePage).toContain("Book appointment for this quote");
    expect(submit).not.toContain("extractPortalIntakeConcern");
    expect(submit).not.toContain("create_part_request_with_items");
  });
});
