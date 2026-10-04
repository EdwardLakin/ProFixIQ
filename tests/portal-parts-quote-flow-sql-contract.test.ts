import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261004150000_portal_parts_quote_request_flow.sql",
  "utf8",
);

function fn(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("create or replace function public.", start + 10);
  return sql.slice(start, end === -1 ? undefined : end);
}

const SERVICE_ONLY = [
  "price_portal_parts_quote_request",
  "claim_portal_parts_quote_request_send",
  "mark_portal_parts_quote_request_sent",
  "release_portal_parts_quote_request_send_claim",
  "record_portal_parts_quote_request_payment",
];
const CUSTOMER_FACING = [
  "create_portal_parts_quote_request_atomic",
  "decide_portal_parts_quote_request_atomic",
];

describe("portal parts quote request flow migration", () => {
  it("contains no DROP statements so the connector can apply it", () => {
    expect(sql).not.toMatch(/^\s*drop\s/im);
  });

  it("defines every function as pinned security definer", () => {
    const definitions = sql.match(/create or replace function public\./g) ?? [];
    expect(definitions).toHaveLength(SERVICE_ONLY.length + CUSTOMER_FACING.length);
    expect(sql.match(/security definer/g)).toHaveLength(definitions.length);
    expect(sql.match(/set search_path = public/g)).toHaveLength(definitions.length);
  });

  it("limits worker and payment functions to service_role", () => {
    for (const name of SERVICE_ONLY) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\)\\s+from public, anon, authenticated;`),
      );
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([^)]*\\)\\s+to service_role;`),
      );
      expect(sql).not.toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([^)]*\\)\\s+to[^;]*authenticated`),
      );
    }
  });

  it("binds customer-facing functions to the verified portal actor and invite", () => {
    for (const name of CUSTOMER_FACING) {
      const body = fn(name);
      expect(body).toContain("auth.uid() is distinct from p_actor_user_id");
      expect(body).toContain("profixiq_is_portal_customer_for");
      expect(body).toContain("v_customer.user_id is distinct from p_actor_user_id");
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\)\\s+from public, anon;`),
      );
    }
  });

  it("creates parts-only requests without a work order or service quote line", () => {
    const body = fn("create_portal_parts_quote_request_atomic");
    expect(body).not.toMatch(/insert into public\.work_orders/);
    expect(body).not.toMatch(/insert into public\.work_order_quote_lines/);
    expect(body).toContain("insert into public.part_requests");
    expect(body).toContain("insert into public.part_request_items");
    expect(body).toContain("insert into public.portal_parts_quote_requests");
    expect(body).toMatch(/p_shop_id, null, null, p_actor_user_id/);
  });

  it("is idempotent per operation key and checks vehicle ownership", () => {
    const body = fn("create_portal_parts_quote_request_atomic");
    expect(body).toContain("where operation_key = v_key");
    expect(body).toContain("'idempotent', true");
    expect(body).toContain("v.customer_id = p_customer_id");
    expect(body).toContain("v.shop_id = p_shop_id");
    expect(body.indexOf("for update")).toBeLessThan(body.indexOf("where operation_key = v_key"));
  });

  it("prices only quote-ready items and freezes prices once sent", () => {
    const body = fn("price_portal_parts_quote_request");
    expect(body).toContain("part_request_item_is_quote_ready");
    expect(body).toContain("v_request.status not in ('requested', 'quoted')");
    expect(body).toContain("v_ready < v_count");
    expect(body).toContain("v_subtotal <= 0");
    expect(body).not.toMatch(/cost/i);
    expect(body).toContain("set pricing_checked_at = now()");
  });

  it("adds a rotation stamp so pending requests are checked fairly", () => {
    expect(sql).toContain("add column if not exists pricing_checked_at timestamptz");
  });

  it("lets exactly one worker claim a send and releases it on failure", () => {
    const claim = fn("claim_portal_parts_quote_request_send");
    expect(claim).toContain("status = 'quoted'");
    expect(claim).toContain("email_sent_at is null");
    expect(claim).toContain("send_claimed_at < now()");
    expect(fn("mark_portal_parts_quote_request_sent")).toContain("and status = 'quoted'");
    expect(fn("release_portal_parts_quote_request_send_claim")).toContain("send_claimed_at = null");
  });

  it("releases parts for ordering only through the shared reconciler on approval", () => {
    const body = fn("decide_portal_parts_quote_request_atomic");
    expect(body).toContain("v_request.status <> 'sent'");
    expect(body).toContain("perform public.parts_reconcile_request_lifecycle(v_request.part_request_id)");
    expect(body).toContain("v_request.status = 'approved' and v_decision = 'approve'");
    expect(body).toContain("v_request.status = 'declined' and v_decision = 'decline'");
    expect(body).not.toMatch(/update public\.part_request/);
  });

  it("records payment once, only for approved quotes, and only in full", () => {
    const body = fn("record_portal_parts_quote_request_payment");
    expect(body).toContain("v_request.paid_at is not null");
    expect(body).toContain("v_request.status <> 'approved'");
    expect(body).toContain("coalesce(p_amount_cents, 0) < v_expected_cents");
    expect(body).toContain("'duplicate'");
  });

  it("does not alter pre-existing objects", () => {
    expect(sql).not.toMatch(/alter table public\.(part_requests|part_request_items|work_orders)/i);
    expect(sql).not.toMatch(/create trigger/i);
    expect(sql).not.toMatch(/create or replace function public\.parts_reconcile_request_lifecycle/);
    expect(sql).toContain("portal_parts_quote_requests_vehicle_idx");
  });
});
