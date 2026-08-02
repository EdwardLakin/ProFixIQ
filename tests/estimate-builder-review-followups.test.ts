import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createEstimateSchema } from "@/features/estimates/server/schemas";
import { shopLocalDateTimeToUtc } from "@/features/shared/lib/utils/shopDayWindow";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260802040435_harden_estimate_review_contracts.sql",
);
const builder = source("features/estimates/components/EstimateBuilder.tsx");
const workspace = source(
  "features/estimates/components/EstimatesWorkspace.tsx",
);
const estimateData = source("features/estimates/server/data.ts");
const quoteSend = source("app/api/quotes/send/route.ts");
const portalList = source("app/portal/quotes/page.tsx");

function validEstimate(vin: string | null) {
  return {
    customer: { first_name: "Alex", last_name: "Driver", email: "" },
    vehicle: { year: "2022", make: "Ford", model: "F-150", vin },
    lines: [
      {
        clientKey: "line-1",
        title: "Front brakes",
        customerDescription: "Replace worn front brakes",
        advisorNotes: "",
        laborHours: 1.5,
        laborRate: 150,
        parts: [],
      },
    ],
    expiresOn: "2026-08-01",
  };
}

describe("estimate builder review follow-ups", () => {
  it("advances the draft CAS version and enforces expiration atomically", () => {
    expect(migration).toContain(
      "v_next_revision := v_work_order.estimate_revision + 1",
    );
    expect(migration).toContain("estimate_revision = v_next_revision");
    expect(migration).toContain(
      "This estimate has expired and cannot be sent.",
    );
    expect(migration).toContain(
      "This estimate expired before the decision was submitted.",
    );
    expect(migration).toContain(
      "if coalesce((v_result ->> ''ok'')::boolean, false) = false then",
    );
  });

  it("retries an in-flight Parts submission before making another draft save", () => {
    const retry = builder.indexOf(
      "idempotencyKeysRef.current.has(actionKey) && pendingRevision",
    );
    const save = builder.indexOf("const saved = await saveDraft(false)", retry);
    expect(retry).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(retry);
    expect(builder).toContain(
      "saved.estimateRevision ?? detail.estimate.estimateRevision",
    );
  });

  it("repairs portal notifications idempotently after accepted-send recovery", () => {
    const recover = quoteSend.indexOf("await recoverAcceptedEstimateSend");
    const repair = quoteSend.indexOf(
      "await repairEstimatePortalNotification",
      recover,
    );
    const recoveredResponse = quoteSend.indexOf("recovered: true", recover);
    expect(repair).toBeGreaterThan(recover);
    expect(recoveredResponse).toBeGreaterThan(repair);
    expect(quoteSend).toContain(
      "estimate:quote_ready:${input.workOrderId}:revision:${input.revision}",
    );
    expect(quoteSend).toContain('{ onConflict: "user_id,event_key" }');
  });

  it("filters and paginates estimates on the server", () => {
    expect(estimateData).toContain('"search_estimate_work_order_ids"');
    expect(migration).toContain("returns table(work_order_id uuid)");
    expect(migration).toContain("left join public.customers");
    expect(migration).toContain("left join public.vehicles");
    expect(migration).toContain("offset greatest(coalesce(p_offset, 0), 0)");
    expect(estimateData).not.toContain(".limit(150)");
    expect(workspace).toContain("Load more estimates");
    expect(workspace).toContain("search: search.trim()");
  });

  it("renders one aggregate portal card for a multi-line estimate", () => {
    expect(portalList).toContain("if (workOrder.estimate_number)");
    expect(portalList).toContain("key: `estimate:${workOrder.id}`");
    expect(portalList).toContain("cards.map((card)");
    expect(portalList).toContain('"Review estimate"');
  });

  it("does not offer decided lines in the return-to-Parts picker", () => {
    expect(builder).toContain('"declined"');
    expect(builder).toContain('"deferred"');
    expect(builder).toContain('"customer_declined"');
    expect(builder).toContain('"customer_deferred"');
  });

  it("normalizes valid VINs and rejects non-empty invalid VINs", () => {
    const valid = createEstimateSchema.safeParse(
      validEstimate("1ft-fw1e50-nfa-12345"),
    );
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.vehicle.vin).toBe("1FTFW1E50NFA12345");

    const invalid = createEstimateSchema.safeParse(validEstimate("SHORTVIN"));
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(
        invalid.error.issues.some((issue) => issue.path.includes("vin")),
      ).toBe(true);
    }
  });

  it("serializes the expiry deadline at the end of the shop-local day", () => {
    expect(
      shopLocalDateTimeToUtc("2026-08-01", "23:59:59", "America/Denver"),
    ).toBe("2026-08-02T05:59:59.000Z");
    expect(builder).toContain("expiresOn: expiresOn || null");
    expect(builder).toContain("body.shop.timezone || shopTimezone");
  });
});
