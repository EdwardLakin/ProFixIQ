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
    "supabase/migrations/20260717011000_quote_decision_integrity_fixes.sql",
  ),
  "utf8",
);
const legacyDecline = fs.readFileSync(
  path.join(root, "app/api/work-orders/quotes/[id]/decline/route.ts"),
  "utf8",
);
const sentCheckFix = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260929000000_shop_recorded_decisions_skip_sent_check.sql",
  ),
  "utf8",
);
const shopAssistantWorkOrders = fs.readFileSync(
  path.join(root, "features/shop-assistant/server/tools/domains/workOrders.ts"),
  "utf8",
);
const quoteReviewView = fs.readFileSync(
  path.join(root, "features/work-orders/quote-review/QuoteReviewView.tsx"),
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
    expect(migration).toContain("q.approved_at is not null");
    expect(migration).toContain("q.stage::text, '')) = 'customer_approved'");
  });

  it("supports deferred stages and delegates legacy decline", () => {
    expect(migration).toContain("'customer_deferred'::text");
    expect(legacyDecline).toContain("applyWorkOrderQuoteLineDecision");
    expect(legacyDecline).toContain('decisionSource: "shop"');
    expect(legacyDecline).not.toContain('.update({ status: "declined"');
  });

  it("lets a shop-recorded (phone/in-person/email) decision skip the customer-sent precondition", () => {
    // Regression: "Classic Shop Approval" delegated straight into the
    // customer-portal engine, which rejected any quote line that had never
    // been sent to the customer -- exactly the case a phone approval exists
    // to cover. The fix flags the delegated call so only shop-recorded
    // decisions bypass that precondition; ordinary customer/portal decisions
    // must still be rejected (see the SQL contract test and the runtime
    // integration in tests/security/quote-review-shop-recorded-sent-check.runtime.sql).
    expect(sentCheckFix).toContain("profixiq.quote_decision_shop_recorded");
    expect(sentCheckFix).toContain("Quote line has not been sent to the customer.");
    expect(sentCheckFix).toContain(
      "set_config(\\'profixiq.quote_decision_shop_recorded\\', \\'true\\', true)",
    );
    expect(sentCheckFix).toContain(
      "apply_customer_quote_decision_engine_atomic(uuid,uuid,uuid[],text,boolean,uuid,uuid,text,timestamptz)",
    );
    expect(sentCheckFix).toContain(
      "apply_shop_quote_decision_atomic(uuid,uuid,uuid[],text,uuid,text,text,text,timestamptz)",
    );
    expect(sentCheckFix).toContain(
      "shop_assistant_record_approval_decision_atomic(uuid,uuid,uuid,uuid,uuid[],boolean,text,text,text)",
    );
  });

  it("does not re-block shop-recorded approval at the Shop Assistant preview layer", () => {
    // The preview step used to hard-fail with a 409 for any not-yet-sent
    // quote line before the RPC (which now allows it) ever ran, making the
    // database fix unreachable through the assistant tool.
    expect(shopAssistantWorkOrders).not.toContain(
      "has not been sent or made ready for customer approval yet",
    );
  });

  it("decouples the Quote Review Approve button from send-eligibility", () => {
    // The Approve button used to reuse canSendLine (digital-send readiness),
    // which also disabled it for states like "pending_parts" that a phone
    // approval never needed to be gated on. canRecordShopApproval only blocks
    // already-decided (or pricing-quarantined) lines.
    expect(quoteReviewView).toContain("function canRecordShopApproval(line");
    expect(quoteReviewView).toContain("disabled={!canRecordShopApproval(line)}");
    expect(quoteReviewView).not.toContain(
      "disabled={!canSendLine(line) && !isSentForDecision(line)}",
    );
  });
});
