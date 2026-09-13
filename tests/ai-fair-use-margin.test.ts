import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_FAIR_USE_COGS_RATIO,
  MAX_AI_FAIR_USE_COGS_RATIO,
  calculateAIFairUseBudgetUsd,
  calculateShopMonthlyRecurringRevenueUsd,
} from "../features/shared/lib/server/ai-fair-use";

const MIGRATION =
  "supabase/migrations/20260913194000_unify_shop_ai_fair_use_budget.sql";

describe("AI fair-use margin guard", () => {
  it("caps AI at 20% of Shop revenue and scales by $10 for each $50 staff seat", () => {
    const tenUsers = calculateShopMonthlyRecurringRevenueUsd({
      stripePricingModel: "product_packages_v1",
      subscriptionPackage: "shop_operations",
      billableUserCount: 10,
    });
    const fifteenUsers = calculateShopMonthlyRecurringRevenueUsd({
      stripePricingModel: "product_packages_v1",
      subscriptionPackage: "shop_operations",
      billableUserCount: 15,
    });

    expect(tenUsers).toBe(299);
    expect(fifteenUsers).toBe(549);
    expect(
      calculateAIFairUseBudgetUsd({
        monthlyRecurringRevenueUsd: tenUsers,
        ratio: DEFAULT_AI_FAIR_USE_COGS_RATIO,
      }),
    ).toBe(59.8);
    expect(
      calculateAIFairUseBudgetUsd({
        monthlyRecurringRevenueUsd: fifteenUsers,
        ratio: DEFAULT_AI_FAIR_USE_COGS_RATIO,
      }),
    ).toBe(109.8);
  });

  it("gives Complete its higher revenue envelope while preserving the same ratio", () => {
    const tenUsers = calculateShopMonthlyRecurringRevenueUsd({
      stripePricingModel: "product_packages_v1",
      subscriptionPackage: "complete_operations",
      billableUserCount: 10,
    });
    const fifteenUsers = calculateShopMonthlyRecurringRevenueUsd({
      stripePricingModel: "product_packages_v1",
      subscriptionPackage: "complete_operations",
      billableUserCount: 15,
    });

    expect(tenUsers).toBe(499);
    expect(fifteenUsers).toBe(749);
    expect(
      calculateAIFairUseBudgetUsd({
        monthlyRecurringRevenueUsd: tenUsers,
        ratio: 0.2,
      }),
    ).toBe(99.8);
    expect(
      calculateAIFairUseBudgetUsd({
        monthlyRecurringRevenueUsd: fifteenUsers,
        ratio: 0.2,
      }),
    ).toBe(149.8);
  });

  it("does not inflate the fair-use budget from Field or Fleet capacity add-ons", () => {
    expect(
      calculateShopMonthlyRecurringRevenueUsd({
        stripePricingModel: "product_packages_v1",
        subscriptionPackage: "field_service",
        billableUserCount: 40,
      }),
    ).toBe(199);
    expect(
      calculateShopMonthlyRecurringRevenueUsd({
        stripePricingModel: "product_packages_v1",
        subscriptionPackage: "fleet_maintenance",
        billableUserCount: 40,
      }),
    ).toBe(149);
  });

  it("never allows a configured AI cost ratio above the 25% economic safety rail", () => {
    expect(MAX_AI_FAIR_USE_COGS_RATIO).toBe(0.25);
    expect(
      calculateAIFairUseBudgetUsd({
        monthlyRecurringRevenueUsd: 1_000,
        ratio: 0.9,
      }),
    ).toBe(250);
  });

  it("makes the database monthly spend ceiling shop-wide while keeping rate limits feature-scoped", async () => {
    const sql = await readFile(MIGRATION, "utf8");
    const monthlyBudgetQuery = sql.slice(
      sql.indexOf("select coalesce(\n    sum("),
      sql.indexOf("if v_monthly_cost + p_reservation_cost_usd"),
    );

    expect(monthlyBudgetQuery).toContain("where receipt.shop_id = p_shop_id");
    expect(monthlyBudgetQuery).not.toContain("receipt.feature = p_feature");
    expect(sql).toContain("receipt.actor_id = p_actor_id");
    expect(sql).toContain("receipt.feature = p_feature");
    expect(sql).toContain(":ai-fair-use-budget");
  });
});
