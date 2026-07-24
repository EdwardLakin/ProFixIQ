import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  aggregateFinancialWindow,
  buildOwnerReportTrend,
} from "@/features/owner/reports/server/buildOwnerIntelligenceReport";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("owner intelligence metric contract", () => {
  it("dates issued revenue by issued_at instead of import created_at", () => {
    const invoices = [
      {
        id: "historical",
        invoice_number: "INV-OLD",
        issued_at: "2024-03-18T18:00:00.000Z",
        total: 1_000,
        labor_cost: 200,
        parts_cost: 300,
        status: "paid",
      },
      {
        id: "current",
        invoice_number: "INV-NOW",
        issued_at: "2026-07-23T18:00:00.000Z",
        total: 500,
        labor_cost: 100,
        parts_cost: 50,
        status: "issued",
      },
      {
        id: "voided",
        invoice_number: "INV-VOID",
        issued_at: "2026-07-22T18:00:00.000Z",
        total: 2_000,
        labor_cost: 100,
        parts_cost: 100,
        status: "voided",
      },
    ];

    const current = aggregateFinancialWindow(
      invoices,
      [],
      [],
      "2026-07-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    );

    expect(current.revenue).toBe(500);
    expect(current.invoiceCount).toBe(1);
    expect(current.knownContribution).toBe(350);
  });

  it("keeps known contribution separate from collected revenue and refunds", () => {
    const financial = aggregateFinancialWindow(
      [
        {
          id: "invoice",
          invoice_number: "INV-1",
          issued_at: "2026-07-10T18:00:00.000Z",
          total: 1_000,
          labor_cost: 250,
          parts_cost: 150,
          status: "paid",
        },
      ],
      [{ amount: 50, created_at: "2026-07-12T18:00:00.000Z" }],
      [
        {
          event_kind: "payment_succeeded",
          amount: 1_000,
          occurred_at: "2026-07-13T18:00:00.000Z",
        },
        {
          event_kind: "refund_succeeded",
          amount: 100,
          occurred_at: "2026-07-14T18:00:00.000Z",
        },
      ],
      "2026-07-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    );

    expect(financial.collected).toBe(900);
    expect(financial.knownCosts).toBe(450);
    expect(financial.knownContribution).toBe(550);
  });

  it("places historical invoices into their actual shop-local trend bucket", () => {
    const trend = buildOwnerReportTrend(
      [
        {
          id: "first",
          invoice_number: "INV-1",
          issued_at: "2026-07-02T05:30:00.000Z",
          total: 400,
          labor_cost: 100,
          parts_cost: 50,
          status: "issued",
        },
      ],
      [],
      "2026-07-01",
      "2026-07-04T00:00:00.000Z",
      "monthly",
      "America/Edmonton",
    );

    expect(trend.find((point) => point.key === "2026-07-01")?.revenue).toBe(400);
    expect(trend.find((point) => point.key === "2026-07-02")?.revenue).toBe(0);
  });
});

describe("owner intelligence authorization and AI boundaries", () => {
  it("requires financial-report capability on desktop, mobile, data, and AI routes", () => {
    const combined = [
      "app/api/reports/owner/route.ts",
      "app/api/ai/summarize-stats/route.ts",
      "app/dashboard/owner/reports/page.tsx",
      "app/dashboard/performance/page.tsx",
      "app/mobile/reports/page.tsx",
    ]
      .map(source)
      .join("\n");

    expect(combined.match(/requiredCapability: "canViewFinancials"/g)?.length).toBe(5);
    expect(combined).toContain('allowRoles: ["owner", "admin", "manager"]');
  });

  it("builds AI input on the server and rejects the old client-stats contract", () => {
    const route = source("app/api/ai/summarize-stats/route.ts");
    const desktop = source(
      "features/owner/reports/OwnerIntelligenceClient.tsx",
    );

    expect(route).toContain("buildOwnerIntelligenceReport");
    expect(route).not.toContain("body?.stats");
    expect(route).not.toContain("shopId: null");
    expect(route).toContain("ignoreDuplicates: false");
    expect(desktop).toContain('JSON.stringify({ range, force })');
    expect(desktop).not.toContain("stats:");
  });

  it("caches summaries behind tenant- and role-scoped RLS", () => {
    const migration = source(
      "supabase/migrations/20260724120000_owner_intelligence_summary_cache.sql",
    );

    expect(migration).toContain("alter table public.owner_report_summaries enable row level security");
    expect(migration).toContain("shop_id = public.current_shop_id()");
    expect(migration).toContain("generated_by = auth.uid()");
    expect(migration).toContain("('owner', 'admin', 'manager')");
    expect(migration).not.toContain("to anon");
  });

  it("keeps the legacy summary route delegated to the canonical implementation", () => {
    const legacy = source("app/api/stats/summarize/route.ts");
    expect(legacy).toContain(
      'import { POST as canonicalPost } from "../../ai/summarize-stats/route"',
    );
    expect(legacy).toContain("return canonicalPost(request)");
    expect(legacy).not.toContain("chat.completions");
  });
});
