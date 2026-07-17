import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = fs.readFileSync(
  path.join(root, "app/api/work-orders/quotes/[id]/authorize/route.ts"),
  "utf8",
);
const helper = fs.readFileSync(
  path.join(root, "features/work-orders/server/workOrderQuoteLineApproval.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260717003000_shop_recorded_quote_decisions.sql",
  ),
  "utf8",
);

describe("shop quote decision contract", () => {
  it("accepts all three advisor decisions and records the shop source", () => {
    expect(route).toContain('"approve"');
    expect(route).toContain('"decline"');
    expect(route).toContain('"defer"');
    expect(route).toContain('decisionSource: "shop"');
    expect(helper).toContain('"apply_shop_quote_decision_atomic"');
  });

  it("keeps materialization in the canonical atomic decision function", () => {
    expect(migration).toContain("public.apply_customer_quote_decision_atomic");
    expect(migration).toContain("decision_origin', 'shop_recorded'");
    expect(migration).toContain("operation_name = 'shop_quote_decision'");
    expect(migration).toContain("p_operation_key || ':canonical'");
  });

  it("enforces actor, tenant, role, and non-reversal checks in SQL", () => {
    expect(migration).toContain("auth.uid() <> p_actor_user_id");
    expect(migration).toContain("p.shop_id = p_shop_id");
    expect(migration).toContain(
      "'owner', 'admin', 'manager', 'advisor', 'service', 'foreman'",
    );
    expect(migration).toContain(
      "Approved work cannot be reversed from quote review",
    );
  });
});
