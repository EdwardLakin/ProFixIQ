import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r", "");

const mocks = vi.hoisted(() => ({
  sendDynamic: vi.fn(),
  createServerSupabaseRoute: vi.fn(),
  requirePortalCustomerActor: vi.fn(),
}));

vi.mock("@/features/email/server/sendDynamicTemplateEmail", () => ({
  sendDynamicTemplateEmail: mocks.sendDynamic,
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: mocks.createServerSupabaseRoute,
  createAdminSupabase: vi.fn(),
}));
vi.mock("@/features/portal/server/requirePortalActor", () => ({
  requirePortalCustomerActor: mocks.requirePortalCustomerActor,
}));

const fixSql = read("supabase/migrations/20261004164130_portal_parts_quote_request_review_fixes.sql");
const flowSql = read("supabase/migrations/20261004150000_portal_parts_quote_request_flow.sql");

function decideDefinition(source: string): string {
  const start = source.indexOf("create or replace function public.decide_portal_parts_quote_request_atomic(");
  const end = source.indexOf("\n$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, end + 4);
}
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("review fix migration", () => {
  it("has no DROP statements and no grant changes", () => {
    expect(fixSql).not.toMatch(/^\s*drop\s/im);
    expect(fixSql).not.toMatch(/\b(grant|revoke)\b/i);
  });

  it("re-verifies the reviewed snapshot at approval and sends a changed quote back", () => {
    const body = decideDefinition(fixSql);
    expect(body).toContain("jsonb_array_elements(v_request.priced_items)");
    expect(body).toContain("l.qty is distinct from s.qty");
    expect(body).toContain("l.unit_price is distinct from s.unit_price");
    expect(body).toContain("l.description is distinct from s.description");
    expect(body).toContain("'error', 'quote_changed'");
    // Declines are never blocked by the snapshot check.
    expect(body).toContain("if v_decision = 'approve' and v_request.part_request_id is not null then");
    // The reset clears the send markers so the worker re-prices and re-sends.
    expect(body).toMatch(/set status = 'requested',\s+quoted_at = null,\s+sent_at = null,\s+email_sent_at = null,\s+send_claimed_at = null/);
  });

  it("changes nothing else in the decision function", () => {
    const before = decideDefinition(flowSql);
    const after = decideDefinition(fixSql);
    const start = after.indexOf("  -- The customer reviewed the frozen priced_items snapshot.".replace("priced_items ", ""));
    expect(start).toBeGreaterThan(0);
    const blockEnd = after.indexOf("  if v_decision = 'approve' then\n    v_old_part_request_id");
    const removed = after.slice(start, blockEnd);
    // Undo the approval-time anchoring additions (covered by their own tests).
    const anchorStart = after.indexOf("    v_old_part_request_id := v_request.part_request_id;");
    const anchorEnd = after.indexOf("    v_request.part_request_id := v_new_request_id;\n");
    expect(anchorStart).toBeGreaterThan(0);
    expect(anchorEnd).toBeGreaterThan(anchorStart);
    const withoutAnchor =
      after.slice(0, anchorStart) +
      "    update public.portal_parts_quote_requests\n    set status = 'approved', approved_at = v_now, approval_choice = v_choice\n    where id = v_request.id;\n" +
      after.slice(anchorEnd + "    v_request.part_request_id := v_new_request_id;\n".length);
    const restored = (withoutAnchor.slice(0, start) + withoutAnchor.slice(withoutAnchor.indexOf("  if v_decision = 'approve' then\n    update public.portal_parts_quote_requests")))
      .replace("  v_changed boolean := false;\n", "")
      .replace(/  v_vehicle public\.vehicles%rowtype;\n[\s\S]*?  v_title text;\n/, "")
      .replace("      'work_order_id', v_work_order_id,\n", "")
      .replace("    'workOrderId', v_work_order_id,\n", "");
    expect(removed).toContain("quote_changed");
    expect(blockEnd).toBeGreaterThan(start);
    expect(normalize(restored)).toBe(normalize(before));
  });

  it("hides pre-send quotes from the customer's direct reads", () => {
    expect(fixSql).toContain("alter policy portal_parts_quote_requests_customer_select");
    expect(fixSql).toMatch(/status in \('sent', 'approved', 'declined'\)\s+and public\.profixiq_is_portal_customer_for\(customer_id, shop_id\)/);
  });
});

describe("canonical quote email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendDynamic.mockResolvedValue({ status: "accepted", acceptedAt: "now", emailLogId: "log-1" });
  });

  it("sends through the canonical email service with a delivery key", async () => {
    const { sendPortalPartsQuoteEmail, portalPartsQuoteDeliveryKey } = await import(
      "@/features/email/server/sendPortalPartsQuoteEmail"
    );
    const result = await sendPortalPartsQuoteEmail({
      shopId: "shop-1",
      to: "pat@example.com",
      shopName: "North Garage",
      customerName: "Pat Lee",
      description: "Winter tires",
      totalLabel: "$420.00",
      portalUrl: "https://app.test/portal/parts-quotes/q-1",
      requestId: "q-1",
      deliveryKey: portalPartsQuoteDeliveryKey("q-1", 42000),
    });

    expect(result).toEqual({ status: "accepted", emailLogId: "log-1" });
    const input = mocks.sendDynamic.mock.calls[0][0] as {
      shopId: string;
      templateKey: string;
      content: { text: string };
      metadata: Record<string, unknown>;
    };
    expect(input.shopId).toBe("shop-1");
    expect(input.templateKey).toBe("quote_ready");
    expect(input.content.text).toContain("https://app.test/portal/parts-quotes/q-1");
    expect(input.metadata).toMatchObject({
      portal_parts_quote_request_id: "q-1",
      delivery_key: "portal-parts-quote:q-1:42000",
    });
  });

  it("no longer talks to SendGrid directly", () => {
    const source = read("features/email/server/sendPortalPartsQuoteEmail.ts");
    expect(source).not.toContain("@sendgrid/mail");
    expect(source).toContain("sendDynamicTemplateEmail");
  });

  it("treats queued and failed logs as retryable and everything else as handled", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const chain: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: "log-1" }], error: null }).then(resolve),
    };
    for (const method of ["select", "eq", "not", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      };
    }
    const { portalPartsQuoteEmailAlreadyHandled } = await import("@/features/email/server/sendPortalPartsQuoteEmail");
    const handled = await portalPartsQuoteEmailAlreadyHandled(
      { from: () => chain } as never,
      "shop-1",
      "portal-parts-quote:q-1:42000",
    );
    expect(handled).toBe(true);
    expect(calls).toContainEqual(["eq", ["metadata->>delivery_key", "portal-parts-quote:q-1:42000"]]);
    expect(calls).toContainEqual(["not", ["status", "in", "(queued,failed)"]]);
  });
});

describe("approval of a changed quote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePortalCustomerActor.mockResolvedValue({
      userId: "user-1",
      customer: { id: "cust-1", shop_id: "shop-1" },
      inviteEvidence: {},
    });
  });

  it("returns a conflict with a clear message when the shop changed the quote", async () => {
    mocks.createServerSupabaseRoute.mockReturnValue({
      rpc: async () => ({ data: { ok: false, error: "quote_changed" }, error: null }),
    });
    const { POST } = await import("../app/api/portal/parts-quotes/[id]/decision/route");
    const response = await POST(
      new Request("https://x.test", { method: "POST", body: JSON.stringify({ decision: "approve" }) }),
      { params: Promise.resolve({ id: "5c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a11" }) },
    );
    expect(response.status).toBe(409);
    const json = (await response.json()) as { error: string };
    expect(json.error).toContain("updated this quote");
  });
});

describe("payments, client and staff workbench wiring", () => {
  it("offers immediate payment methods only and handles delayed success defensively", () => {
    expect(read("features/stripe/lib/server/portal-parts-quote-checkout.ts")).toContain('payment_method_types: ["card"]');
    const webhook = read("features/stripe/api/stripe/webhook/route.ts");
    const asyncCase = webhook.slice(webhook.indexOf('case "checkout.session.async_payment_succeeded"'));
    expect(asyncCase).toContain("isPortalPartsQuoteSession(session)");
    expect(asyncCase.indexOf("recordPortalPartsQuoteCheckoutSession")).toBeLessThan(asyncCase.indexOf('case "payment_intent.payment_failed"'));
  });

  it("reports network failures from quote mutations and reloads the quote", () => {
    const client = read("features/portal/components/parts-quotes/PortalPartsQuoteClient.tsx");
    expect(client.match(/} catch \{/g)?.length).toBeGreaterThanOrEqual(3);
    expect(client).toContain("We could not confirm your decision");
    expect(client).toContain("We could not start your payment");
  });

  it("lets the request detail page load a request that has no work order", () => {
    const page = read("app/parts/requests/[id]/page.tsx");
    expect(page).toContain("standaloneRequest");
    expect(page).toContain('.select("id, work_order_id, shop_id")');
    expect(page).toContain("const activeShopId = wo?.shop_id ?? standaloneShopId;");
    expect(page).not.toMatch(/!wo\?\.shop_id/);
    expect(page).toContain("!wo && !standaloneShopId");
  });

  it("links work-order-less queue cards to their own request page", () => {
    const queue = read("app/parts/requests/page.tsx");
    expect(queue).toContain("const requestId = bucket.models[0]?.request.id;");
    expect(queue).toContain("/parts/requests/${encodeURIComponent(requestId)}");
  });
});

describe("work order is created only on approval", () => {
  const decide = normalize(decideDefinition(fixSql));

  it("anchors the approved quote to a work order, approved line and new request", () => {
    expect(decide).toContain("insert into public.work_orders");
    expect(decide).toContain("insert into public.work_order_lines");
    expect(decide).toContain("'repair', 'job', 'awaiting', 'authorized', 'approved'");
    expect(decide).toContain("insert into public.part_requests");
    expect(decide).toContain("part_request_id = v_new_request_id");
    expect(decide).toContain("set status = 'cancelled'");
  });

  it("never creates a work order on request, pricing, send or decline", () => {
    expect(flowSql).not.toContain("insert into public.work_orders");
    const approveBranch = decide.slice(decide.indexOf("if v_decision = 'approve' then v_old_part_request_id"));
    expect(approveBranch.indexOf("insert into public.work_orders")).toBeGreaterThan(-1);
    expect(decide.split("insert into public.work_orders").length - 1).toBe(1);
  });

  it("runs the anchoring runtime proof in clean replay", () => {
    expect(read(".github/workflows/supabase-clean-replay-audit.yml")).toContain(
      "tests/security/portal-parts-quote-approval-anchor.runtime.sql",
    );
  });
});
