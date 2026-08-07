import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { selectCustomerVisibleQuoteParts } from "@/features/portal/lib/customerVisibleQuoteParts";

const read = (path: string) => readFileSync(path, "utf8");

describe("inspection sign and portal approval regressions", () => {
  it("imports findings through the idempotent canonical command before signing", () => {
    const route = read("app/api/inspections/sign/route.ts");
    const importAt = route.indexOf("insertPrioritizedJobsFromInspection({");
    const signAt = route.indexOf("callSignInspectionRpc(supabase");

    expect(importAt).toBeGreaterThan(-1);
    expect(signAt).toBeGreaterThan(importAt);
    expect(route).toContain(
      "operationKey: `sign:${resolved.inspectionId}:${bodyUnknown.expectedSyncRevision}`",
    );
  });

  it("removes the redundant findings review and per-card submission paths", () => {
    const screen = read("features/inspections/screens/GenericInspectionScreen.tsx");
    const section = read("features/inspections/lib/inspection/SectionDisplay.tsx");
    const tire = read("features/inspections/lib/inspection/ui/TireCornerGrid.tsx");
    const legacyPage = read("app/inspections/findings/page.tsx");

    expect(screen).not.toContain("Open findings list");
    expect(screen).not.toContain("<FinishInspectionButton");
    expect(section).not.toContain("Submit for estimate");
    expect(section).not.toContain("Update estimate");
    expect(tire).not.toContain("Submit for estimate");
    expect(legacyPage).toContain('redirect("/inspections")');
  });

  it("allows edits only when the active reopened signing cycle is unsigned", () => {
    const migration = read(
      "supabase/migrations/20260805145119_allow_reopened_inspection_cycle_edits.sql",
    );

    expect(migration).toContain(
      "s.signing_cycle = coalesce(old.signing_cycle, 0)",
    );
    expect(migration).toContain("v_has_signature_for_cycle");
    expect(migration).toContain(
      "Finalized inspection evidence is immutable; use the authorized reopen operation.",
    );
  });

  it("refreshes Supabase auth cookies for API requests", () => {
    const middleware = read("middleware.ts");
    const apiBranch = middleware.indexOf('pathname.startsWith("/api")');
    const refresh = middleware.indexOf("await supabase.auth.getUser()", apiBranch);

    expect(middleware).toContain('"/api/:path*"');
    expect(apiBranch).toBeGreaterThan(-1);
    expect(refresh).toBeGreaterThan(apiBranch);
  });

  it("uses the shared portal actor and customer-scoped client for quote decisions", () => {
    const route = read(
      "app/api/work-orders/quotes/[id]/approval-decision/route.ts",
    );
    const actions = read("features/portal/components/QuoteApprovalActions.tsx");

    expect(route).toContain("requirePortalCustomerActor(routeSupabase)");
    expect(route).toContain("supabase: routeSupabase");
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(route).toContain('.eq("customer_id", actor.customer.id)');
    expect(route).toContain('result.error?.includes("PART_RELINK_CONFLICT")');
    expect(route).toContain(
      "This quote needs a parts review by the shop before it can be approved. No approval was recorded.",
    );
    expect(actions.match(/credentials: "include"/g)).toHaveLength(2);
  });

  it("prefers canonical priced parts over unpriced requested parts", () => {
    const requested = [{ description: "Front brake pads", qty: 1 }];
    const quoted = [
      { description: "Front brake pads", qty: 1, unitPrice: 98.54 },
      { description: "Front rotors", qty: 2, unitPrice: 222.78 },
    ];
    const metadata = {
      parts: requested,
      parts_quote: { items: quoted },
    };

    expect(selectCustomerVisibleQuoteParts(metadata, true)).toEqual(quoted);
    expect(selectCustomerVisibleQuoteParts(metadata, false)).toEqual(requested);
  });

  it("hides quarantined protected item pricing instead of displaying $0 or stale parts", () => {
    const metadata = {
      parts: [{ description: "Legacy snapshot", qty: 1, unitPrice: 80 }],
      parts_quote: {
        items: [
          {
            description: "Protected item",
            qty: 1,
            unit_price: null,
            line_total: null,
            quote_ready: false,
          },
        ],
        pricing_sanitization: {
          manual_review_required: true,
          customer_pricing_quarantined: true,
        },
      },
    };

    expect(selectCustomerVisibleQuoteParts(metadata, true)).toEqual([]);
    expect(selectCustomerVisibleQuoteParts(metadata, false)).toEqual([]);
  });
});
