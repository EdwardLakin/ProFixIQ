import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replaceAll("\r", "");

const migration = read("supabase/migrations/20261004222440_portal_parts_quote_payment_ledger.sql");
const previousFinalize = read("supabase/migrations/20260803174543_fix_invoice_financial_integrity.sql");
const previousDecide = read("supabase/migrations/20261004164130_portal_parts_quote_request_review_fixes.sql");

function definition(source: string, name: string, terminator = "\n$$;"): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(terminator, start);
  return source.slice(start, end + terminator.length);
}

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("parts quote payment migration", () => {
  it("has no DROP statements", () => {
    expect(migration).not.toMatch(/^\s*drop\s/im);
  });

  it("only grants execute on its three new service-role functions", () => {
    const grants = [...migration.matchAll(/grant execute on function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(grants.sort()).toEqual([
      "apply_portal_parts_quote_prepayments",
      "record_portal_parts_quote_payment_event",
      "record_portal_parts_quote_request_ledger_payment",
    ]);
    expect(migration.match(/to service_role;/g)?.length ?? 0).toBe(3);
    expect(migration).not.toMatch(/\)\s+to\s+(authenticated|anon|public)\b/);
    // Nothing is granted or revoked on the pre-existing functions it redefines.
    expect(migration).not.toMatch(/(grant|revoke)[^;]*finalize_invoice_version/);
    expect(migration).not.toMatch(/(grant|revoke)[^;]*decide_portal_parts_quote_request_atomic/);
  });

  it("adds a guarded prepayment step to finalize_invoice_version and changes nothing else", () => {
    const before = definition(previousFinalize, "finalize_invoice_version", "\n$function$;");
    const after = definition(migration, "finalize_invoice_version", "\n$function$;");
    const start = after.indexOf("  -- Customer prepayments");
    const end = after.indexOf("  return v_version;\nend;");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const added = after.slice(start, end);
    // The new step is isolated so it can never block invoicing.
    expect(added).toContain("begin\n    perform public.apply_portal_parts_quote_prepayments(");
    expect(added).toContain("exception when others then");
    expect(added).toContain("raise warning");
    expect(added).toContain("where iv.id = v_version.id;");
    expect(normalize(after.slice(0, start) + after.slice(end))).toBe(normalize(before));
  });

  it("keeps finalize security definer with an empty search_path", () => {
    const after = definition(migration, "finalize_invoice_version", "\n$function$;");
    expect(after).toContain("security definer");
    expect(after).toContain("set search_path = ''");
  });

  it("changes decide_portal_parts_quote_request_atomic only to record the work order", () => {
    const before = definition(previousDecide, "decide_portal_parts_quote_request_atomic");
    const after = definition(migration, "decide_portal_parts_quote_request_atomic");
    expect(after).toContain("part_request_id = v_new_request_id, work_order_id = v_work_order_id");
    expect(normalize(after.replace(", work_order_id = v_work_order_id", ""))).toBe(normalize(before));
  });

  it("posts prepayments and events only through post_payment_event", () => {
    const apply = definition(migration, "apply_portal_parts_quote_prepayments");
    const reconcile = definition(migration, "portal_parts_quote_reconcile_invoice");
    const event = definition(migration, "record_portal_parts_quote_payment_event");
    expect(apply).toContain("perform public.post_payment_event(");
    expect(reconcile).toContain("perform public.post_payment_event(");
    expect(event).toContain("portal_parts_quote_reconcile_invoice(");
    // The canonical ledger tables are never written directly.
    for (const body of [apply, reconcile, event]) {
      expect(body).not.toMatch(/insert into public\.(payment_events|payment_receipts|invoice_versions)/);
      expect(body).not.toMatch(/update public\.invoice_versions/);
    }
  });

  it("is idempotent per payment and invoice version, and mirrors from state", () => {
    const apply = definition(migration, "apply_portal_parts_quote_prepayments");
    expect(apply).toContain("'portal-parts-quote-prepay:' || v_quote.id::text || ':' || p_invoice_version_id::text");
    expect(apply).toContain("v_quote.prepaid_applied_version_id is not null and exists");
    const reconcile = definition(migration, "portal_parts_quote_reconcile_invoice");
    expect(reconcile).toContain("v_desired_refund > v_quote.prepaid_refund_posted_cents");
    expect(reconcile).toContain("v_desired_hold > v_quote.prepaid_hold_posted_cents");
    const event = definition(migration, "record_portal_parts_quote_payment_event");
    expect(event).toContain("portal_parts_quote_reconcile_invoice(v_quote.id)");
    expect(event).toContain("greatest(");
  });

  it("does not credit disputed, lost or refunded money and caps at the outstanding balance", () => {
    const apply = definition(migration, "apply_portal_parts_quote_prepayments");
    expect(apply).toContain("coalesce(v_quote.dispute_status, '') in ('open', 'lost')");
    expect(apply).toContain("v_available := v_quote.amount_paid_cents - v_quote.refunded_cents;");
    expect(apply).toContain("least(v_available, floor(greatest(v_version.outstanding_total, 0) * 100)::integer)");
    expect(apply).toContain("prepaid_leftover = true");
  });

  it("flags ledger problems for staff, retries transient errors and keeps lock order", () => {
    const apply = definition(migration, "apply_portal_parts_quote_prepayments");
    const reconcile = definition(migration, "portal_parts_quote_reconcile_invoice");
    for (const body of [apply, reconcile]) {
      expect(body).toContain("payment_ledger_issue = true");
      expect(body).toContain("when lock_not_available or serialization_failure or deadlock_detected or query_canceled then");
    }
    for (const name of ["record_portal_parts_quote_payment_event", "record_portal_parts_quote_request_ledger_payment"]) {
      const body = definition(migration, name);
      expect(body.indexOf("from public.work_orders where id = v_")).toBeGreaterThan(0);
      expect(body.indexOf("from public.work_orders where id = v_")).toBeLessThan(body.lastIndexOf("for update;"));
    }
  });

  it("is exercised by a runtime test in the clean replay workflow", () => {
    expect(read(".github/workflows/supabase-clean-replay-audit.yml")).toContain(
      "tests/security/portal-parts-quote-payment-ledger.runtime.sql",
    );
    const runtime = read("tests/security/portal-parts-quote-payment-ledger.runtime.sql");
    for (const covered of [
      "finalize_invoice_version",
      "evt_ledger_refund_1",
      "evt_ledger_dispute_open",
      "credit_unapplied",
      "pi_not_a_parts_quote",
    ]) {
      expect(runtime).toContain(covered);
    }
  });
});

describe("recordPortalPartsQuoteCheckoutSession ledger step", () => {
  const REQUEST_ID = "5c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a11";
  const SHOP_ID = "6c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a22";
  const CUSTOMER_ID = "7c1d7f70-3a38-4ed0-8a43-6f6c1f6b0a33";

  function client(rpc: (fn: string, args: Record<string, unknown>) => unknown) {
    const rpcMock = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      const value = rpc(fn, args);
      if (value instanceof Error) return { data: null, error: { message: value.message } };
      return { data: value, error: null };
    });
    const chain = (data: unknown) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) c[m] = () => c;
      c.maybeSingle = async () => ({ data, error: null });
      return c;
    };
    return {
      rpcMock,
      client: {
        rpc: rpcMock,
        from: (table: string) =>
          chain(
            table === "shops"
              ? { stripe_account_id: "acct_shop" }
              : { id: REQUEST_ID, shop_id: SHOP_ID, customer_id: CUSTOMER_ID },
          ),
      },
    };
  }

  const session = (metadata: Record<string, string> = {}) =>
    ({
      id: "cs_test_1",
      mode: "payment",
      payment_status: "paid",
      amount_total: 42000,
      payment_intent: "pi_1",
      metadata: {
        purpose: "portal_parts_quote_payment",
        parts_quote_request_id: REQUEST_ID,
        shop_id: SHOP_ID,
        customer_id: CUSTOMER_ID,
        ...metadata,
      },
    }) as never;

  async function record(c: ReturnType<typeof client>, s: never) {
    const { recordPortalPartsQuoteCheckoutSession } = await import(
      "@/features/portal/server/recordPortalPartsQuotePayment"
    );
    return recordPortalPartsQuoteCheckoutSession({
      supabase: c.client as never,
      session: s,
      connectedAccountId: "acct_shop",
    });
  }

  it("writes the payments ledger row with the platform fee after recording the payment", async () => {
    const c = client(() => ({ ok: true }));
    await expect(record(c, session({ platform_fee_cents: "630" }))).resolves.toEqual({ recorded: true });
    const calls = c.rpcMock.mock.calls.map(([fn]) => fn);
    expect(calls).toEqual([
      "record_portal_parts_quote_request_payment",
      "record_portal_parts_quote_request_ledger_payment",
    ]);
    expect(c.rpcMock.mock.calls[1][1]).toEqual({
      p_request_id: REQUEST_ID,
      p_platform_fee_cents: 630,
      p_at: expect.any(String),
    });
  });

  it("ignores a missing or invalid platform fee", async () => {
    const c = client(() => ({ ok: true }));
    await record(c, session({ platform_fee_cents: "abc" }));
    expect(c.rpcMock.mock.calls[1][1]).toMatchObject({ p_platform_fee_cents: 0 });
  });

  it("completes the ledger write on an idempotent replay of the payment", async () => {
    const c = client((fn) => (fn === "record_portal_parts_quote_request_payment" ? { ok: true, idempotent: true } : { ok: true }));
    await record(c, session());
    expect(c.rpcMock.mock.calls.map(([fn]) => fn)).toContain("record_portal_parts_quote_request_ledger_payment");
  });

  it("throws, so Stripe retries, when the ledger write fails", async () => {
    const failing = client((fn) => (fn === "record_portal_parts_quote_request_ledger_payment" ? new Error("ledger down") : { ok: true }));
    await expect(record(failing, session())).rejects.toThrow("ledger down");
    const rejected = client((fn) => (fn === "record_portal_parts_quote_request_ledger_payment" ? { ok: false, error: "ledger_conflict" } : { ok: true }));
    await expect(record(rejected, session())).rejects.toThrow("ledger_conflict");
  });
});

describe("recordPortalPartsQuoteStripeEvent", () => {
  async function run(rpcData: unknown, error: { message: string } | null = null, intent: string | null = "pi_1") {
    const rpc = vi.fn(async () => ({ data: rpcData, error }));
    const { recordPortalPartsQuoteStripeEvent } = await import(
      "@/features/portal/server/recordPortalPartsQuoteStripeEvent"
    );
    const result = await recordPortalPartsQuoteStripeEvent({
      supabase: { rpc } as never,
      paymentIntentId: intent,
      eventKind: "refund_succeeded",
      amountCents: 2500,
      eventId: "evt_1",
      occurredAtSeconds: 1_700_000_000,
    });
    return { result, rpc };
  }

  it("reports a parts quote charge as handled and sends the event details", async () => {
    const { result, rpc } = await run({ handled: true });
    expect(result).toEqual({ handled: true });
    expect(rpc).toHaveBeenCalledWith("record_portal_parts_quote_payment_event", {
      p_payment_intent_id: "pi_1",
      p_event_kind: "refund_succeeded",
      p_amount_cents: 2500,
      p_processor_event_id: "evt_1",
      p_at: "2023-11-14T22:13:20.000Z",
      p_request_id: null,
      p_connected_account_id: null,
    });
  });

  it("lets other charges fall through to the invoice handling", async () => {
    expect((await run({ handled: false })).result).toEqual({ handled: false });
    const noIntent = await run({ handled: true }, null, null);
    expect(noIntent.result).toEqual({ handled: false });
    expect(noIntent.rpc).not.toHaveBeenCalled();
  });

  it("throws on a database failure so the webhook is retried", async () => {
    await expect(run(null, { message: "db down" })).rejects.toThrow("db down");
  });

  it("throws when the invoice mirror was rejected so Stripe redelivers", async () => {
    await expect(run({ handled: true, ledgerIssue: true, ledgerError: "bad state" })).rejects.toThrow("bad state");
  });
});

describe("Stripe webhook wiring", () => {
  const webhook = read("features/stripe/api/stripe/webhook/route.ts");

  it("tries the parts quote handler before the invoice handling for refunds and disputes", () => {
    const refund = webhook.slice(webhook.indexOf('case "charge.refunded"'), webhook.indexOf('case "charge.dispute.created"'));
    expect(refund.indexOf("recordPortalPartsQuoteStripeEvent")).toBeGreaterThan(0);
    expect(refund.indexOf("recordPortalPartsQuoteStripeEvent")).toBeLessThan(refund.indexOf("postStripeFinancialEvent"));
    expect(refund).toContain('eventKind: "refund_succeeded"');

    const dispute = webhook.slice(webhook.indexOf('case "charge.dispute.created"'), webhook.indexOf('case "customer.subscription.created"'));
    expect(dispute.indexOf("recordPortalPartsQuoteStripeEvent")).toBeGreaterThan(0);
    expect(dispute.indexOf("recordPortalPartsQuoteStripeEvent")).toBeLessThan(dispute.indexOf("postStripeFinancialEvent"));
    for (const kind of ['"dispute_opened"', '"dispute_won"', '"dispute_lost"']) {
      expect(dispute).toContain(kind);
    }
  });

  it("imports the handler without pulling in a server-only module", () => {
    expect(read("features/portal/server/recordPortalPartsQuoteStripeEvent.ts")).not.toContain("server-only");
  });
});
