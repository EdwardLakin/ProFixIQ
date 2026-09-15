import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const alertsModule = readFileSync(
  "features/operations/server/deliverUrgentExceptionAlerts.ts",
  "utf8",
);
const cronRoute = readFileSync(
  "app/api/internal/urgent-exception-alerts/route.ts",
  "utf8",
);
const vercelConfig = readFileSync("vercel.json", "utf8");

describe("Phase 7 — event-driven exception alerts delivered into the durable assistant thread", () => {
  it("reuses the existing shop-assistant conversation tables — no new schema", () => {
    expect(alertsModule).toContain('.from("shop_assistant_threads")');
    expect(alertsModule).toContain('.from("shop_assistant_messages")');
    expect(alertsModule).not.toMatch(/create table|create trigger|alter table/i);
  });

  it("never mutates a work order, approval, invoice, or parts request — purely informational", () => {
    expect(alertsModule).not.toMatch(
      /\.from\(\s*["'](work_orders|work_order_lines|approvals|invoices|part_requests|part_request_items)["']\)\s*\.\s*(insert|update|upsert|delete)/,
    );
  });

  it("only ever inserts new rows into the conversation surface — never updates or deletes an existing message or thread", () => {
    expect(alertsModule).not.toMatch(
      /\.from\(\s*["'](shop_assistant_threads|shop_assistant_messages)["']\)[\s\S]{0,200}\.\s*(update|delete)\(/,
    );
  });

  it("never mutates the notification itself — reads the canonical persisted list rather than writing to assistant_notifications directly", () => {
    expect(alertsModule).not.toContain('.from("assistant_notifications")');
    expect(alertsModule).toContain("syncAssistantNotifications(");
  });

  it("delivers only currently-active, critical-level notifications — not every persisted notification", () => {
    expect(alertsModule).toContain('notification.level === "critical"');
    expect(alertsModule).toContain('notification.status === "active"');
  });

  it("is idempotent forever per (recipient, notification) via the notification's own durable id, not a day-scoped key", () => {
    expect(alertsModule).toContain("`exception:${notification.id}`");
    expect(alertsModule).toContain('error?.code !== "23505"');
    expect(alertsModule).toContain("already_delivered");
  });

  it("scopes the idempotency check across every thread a recipient has, not just whichever thread this run picks as latest", () => {
    const fn = alertsModule.slice(
      alertsModule.indexOf("async function hasDeliveredAlert"),
      alertsModule.indexOf("async function deliverAlertToStaffMember"),
    );
    expect(fn).toContain('.from("shop_assistant_threads")');
    expect(fn).toContain('.from("shop_assistant_messages")');
    expect(fn).toContain(".in(");
  });

  it("extends to mechanics, unlike the shop-wide morning digest — syncAssistantNotifications already scopes their own view", () => {
    expect(alertsModule).toContain("canAccessAssistantNotifications(");
    expect(alertsModule).not.toContain("ROLE_GROUPS.shopWideOperators");
  });

  it("resolves each profile's auth user id the same way the rest of the app does — user_id first, falling back to id", () => {
    expect(alertsModule).toContain("profile.user_id ?? profile.id");
  });

  it("passes the injected admin client through to syncAssistantNotifications so it never falls back to an unauthenticated cookie-backed client from a cron context", () => {
    expect(alertsModule).toContain("supabaseClient: admin");
  });

  it("has no morning-window gate — an exception is delivered as soon as it is detected, any time of day", () => {
    expect(alertsModule).not.toContain("MORNING_WINDOW_START_HOUR");
    expect(alertsModule).not.toContain("inMorningWindow");
  });

  it("is authenticated as an internal cron route, not a user-facing one", () => {
    expect(cronRoute).toContain("requireInternalApiSecret");
    expect(cronRoute).toContain("INTERNAL_CRON_SECRET");
    expect(cronRoute).toContain("CRON_SECRET");
  });

  it("sweeps every shop on a short interval so an exception surfaces promptly, distinct from the once-daily morning digest schedule", () => {
    expect(cronRoute).toContain("fetchAllShopIds(");
    expect(vercelConfig).toMatch(
      /"path":\s*"\/api\/internal\/urgent-exception-alerts",\s*\n\s*"schedule":\s*"\*\/10 \* \* \* \*"/,
    );
  });
});
