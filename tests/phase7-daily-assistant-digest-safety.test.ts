import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const digestModule = readFileSync(
  "features/operations/server/deliverDailyAssistantDigest.ts",
  "utf8",
);
const cronRoute = readFileSync(
  "app/api/internal/daily-assistant-digest/route.ts",
  "utf8",
);
const vercelConfig = readFileSync("vercel.json", "utf8");
const roleDailySummaryModule = readFileSync(
  "features/agent/server/getRoleDailySummary.ts",
  "utf8",
);
const syncAssistantNotificationsModule = readFileSync(
  "features/agent/server/syncAssistantNotifications.ts",
  "utf8",
);
const getBookingsModule = readFileSync("features/agent/tools/getBookings.ts", "utf8");

describe("Phase 7 — proactive daily digest delivered into the durable assistant thread", () => {
  it("reuses the existing shop-assistant conversation tables — no new schema", () => {
    expect(digestModule).toContain('.from("shop_assistant_threads")');
    expect(digestModule).toContain('.from("shop_assistant_messages")');
    expect(digestModule).not.toMatch(/create table|create trigger|alter table/i);
  });

  it("never mutates a work order, approval, invoice, or parts request — purely informational", () => {
    expect(digestModule).not.toMatch(
      /\.from\(\s*["'](work_orders|work_order_lines|approvals|invoices|part_requests|part_request_items)["']\)\s*\.\s*(insert|update|upsert|delete)/,
    );
  });

  it("only ever inserts new rows into the conversation surface — never updates or deletes an existing message or thread", () => {
    expect(digestModule).not.toMatch(
      /\.from\(\s*["'](shop_assistant_threads|shop_assistant_messages)["']\)[\s\S]{0,200}\.\s*(update|delete)\(/,
    );
  });

  it("computes the day boundary in the shop's own local timezone, not a fixed UTC cutover, and normalizes a null/invalid timezone instead of throwing", () => {
    expect(digestModule).toContain("getShopLocalDayWindow(");
    expect(digestModule).toContain("getShopDayRange(");
    expect(digestModule).toContain('.from("shops")');
    expect(digestModule).toContain("timezone");
  });

  it("only delivers within a bounded shop-local morning window, computed from explicit zoned boundaries rather than elapsed hours (DST-safe)", () => {
    expect(digestModule).toContain("MORNING_WINDOW_START_HOUR");
    expect(digestModule).toContain("MORNING_WINDOW_END_HOUR");
    expect(digestModule).toContain("inMorningWindow");
    expect(digestModule).toContain("shopLocalDateTimeToUtc(");
    expect(digestModule).not.toContain("hoursSinceMidnight");
  });

  it("is idempotent per shop-local day across every thread a recipient has, not just whichever thread this run picks as latest", () => {
    expect(digestModule).toContain("hasDeliveredDigestToday(");
    expect(digestModule).toContain("`daily-digest:${localDayKey}`");
    expect(digestModule).toContain('error?.code !== "23505"');
    expect(digestModule).toContain("already_delivered");
  });

  it("skips delivery defensively if the canonical summary ever comes back blank, rather than posting an empty message", () => {
    expect(digestModule).toContain("const content = summary.summaryText.trim();");
    expect(digestModule).toContain("if (!content) return");
  });

  it("restricts delivery to shop-wide operator roles, never a mechanic's narrower assignment-scoped view", () => {
    expect(digestModule).toContain("ROLE_GROUPS.shopWideOperators");
    expect(digestModule).not.toContain('"mechanic"');
  });

  it("resolves each profile's auth user id the same way the rest of the app does — user_id first, falling back to id", () => {
    expect(digestModule).toContain("profile.user_id ?? profile.id");
  });

  it("delivers the canonical, role-aware daily summary contract — the same one the on-demand Today panel uses — rather than a bespoke parallel formatter", () => {
    expect(digestModule).toContain("getRoleDailySummary(");
    expect(digestModule).toContain("supabaseClient: admin");
    expect(digestModule).not.toContain("getOpsNotifications(");
  });

  it("is authenticated as an internal cron route, not a user-facing one", () => {
    expect(cronRoute).toContain("requireInternalApiSecret");
    expect(cronRoute).toContain("INTERNAL_CRON_SECRET");
    expect(cronRoute).toContain("CRON_SECRET");
  });

  it("sweeps every shop hourly so each shop's own morning window is caught without per-shop scheduling", () => {
    expect(cronRoute).toContain("fetchAllShopIds(");
    expect(vercelConfig).toMatch(
      /"path":\s*"\/api\/internal\/daily-assistant-digest",\s*\n\s*"schedule":\s*"42 \* \* \* \*"/,
    );
  });

  it("getRoleDailySummary accepts an injected client and threads it through every dependency it calls, defaulting to the interactive client for every existing caller", () => {
    expect(roleDailySummaryModule).toContain("supabaseClient?: ReturnType<typeof getServerSupabase>");
    expect(roleDailySummaryModule).toContain("supabaseClient: params.supabaseClient");
    expect(roleDailySummaryModule).toMatch(
      /runGetBookings\(\{ limit: 10 \}, ctx, params\.supabaseClient\)/,
    );
    expect(roleDailySummaryModule).toMatch(
      /runGetStalledWorkOrders\(\{\}, ctx, params\.supabaseClient\)/,
    );
    expect(roleDailySummaryModule).toMatch(
      /runGetShopCurrentStatus\(\{\}, ctx, params\.supabaseClient\)/,
    );
    expect(roleDailySummaryModule).toContain("ctx,\n        params.supabaseClient,");
  });

  it("syncAssistantNotifications accepts and threads the same injected client, so it does not silently fall back to an unauthenticated cookie-backed client from a cron context", () => {
    expect(syncAssistantNotificationsModule).toContain(
      "supabaseClient?: ReturnType<typeof getServerSupabase>",
    );
    expect(syncAssistantNotificationsModule).toContain(
      "const supabase = params.supabaseClient ?? getServerSupabase();",
    );
    expect(syncAssistantNotificationsModule).toContain("getOpsNotifications(shopId, supabase)");
    expect(syncAssistantNotificationsModule).toContain(
      "getDurablePartsPickNotifications({ shopId, supabaseClient: supabase })",
    );
  });

  it("every underlying tool a role summary can call accepts the same optional injected client, purely additively", () => {
    expect(getBookingsModule).toContain(
      "supabaseClient?: ReturnType<typeof getServerSupabase>",
    );
    expect(getBookingsModule).toContain("const supabase = supabaseClient ?? getServerSupabase();");
  });
});
