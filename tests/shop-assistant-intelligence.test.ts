import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterShopAssistantBaseStateForActor } from "@/features/assistant/server/shopStateStore";
import type { ShopAssistantBaseState } from "@/features/assistant/types/shopState";

const read = (path: string) => readFileSync(path, "utf8");

const BASE_STATE: ShopAssistantBaseState = {
  shopId: "00000000-0000-4000-8000-000000000001",
  timezone: "UTC",
  localDayKey: "2026-07-21",
  generatedAt: "2026-07-21T12:00:00.000Z",
  staleAfter: "2026-07-21T12:01:00.000Z",
  metrics: [
    {
      key: "active_work_orders",
      label: "Active work orders",
      value: 8,
      tone: "info",
    },
    {
      key: "idle_technicians",
      label: "Idle technicians",
      value: 2,
      tone: "warning",
    },
    {
      key: "ready_to_invoice",
      label: "Ready to invoice",
      value: 3,
      tone: "warning",
    },
  ],
  alerts: [
    {
      id: "wo:1",
      level: "warning",
      code: "work_order_waiting_too_long",
      title: "Queued too long",
      message: "WO #1 is stale.",
    },
    {
      id: "invoice:1",
      level: "warning",
      code: "invoice_unsent_too_long",
      title: "Invoice unsent",
      message: "Invoice needs attention.",
    },
  ],
};

describe("shop assistant intelligence", () => {
  it("keeps owner metrics and alerts shop-wide", () => {
    const state = filterShopAssistantBaseStateForActor({
      base: BASE_STATE,
      role: "owner",
    });
    expect(state.scope).toBe("shop");
    expect(state.metrics).toHaveLength(3);
    expect(state.alerts).toHaveLength(2);
  });

  it("preserves the existing in-work-order technician assistant boundary", () => {
    const state = filterShopAssistantBaseStateForActor({
      base: BASE_STATE,
      role: "mechanic",
    });
    expect(state.scope).toBe("technician");
    expect(state.metrics).toEqual([]);
    expect(state.alerts).toEqual([]);
  });

  it("adds a persisted live shop-state cache and role-aware route", () => {
    const migration = read(
      "supabase/migrations/20260721110000_shop_assistant_state.sql",
    );
    expect(migration).toContain(
      "create table if not exists public.assistant_shop_states",
    );
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "grant all on table public.assistant_shop_states to service_role",
    );

    const route = read("app/api/assistant/shop-state/route.ts");
    expect(route).toContain("requireShopScopedApiAccess");
    expect(route).toContain("getShopAssistantStateForActor");

    const desktop = read("app/assistant/page.tsx");
    const mobile = read("app/mobile/assistant/page.tsx");
    expect(desktop).toContain("ShopAssistantOverview");
    expect(mobile).toContain("ShopAssistantOverview");
  });
});
