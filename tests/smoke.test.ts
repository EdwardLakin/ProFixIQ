import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OperationsDashboardPayload } from "@/features/dashboard/server/getOperationsDashboardPayload";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("@/features/dashboard/server/getOperationsDashboardPayload", () => ({
  getOperationsDashboardPayload: vi.fn(async (): Promise<OperationsDashboardPayload> => ({
    identity: {
      userId: "user-1",
      email: "owner@example.com",
      shopId: "shop-1",
      role: "owner",
      fullName: "Operations Owner",
      profileExists: true,
      shopLoaded: true,
      shop: {
        id: "shop-1",
        name: "ProFixIQ Demo Shop",
        shop_name: null,
        business_name: null,
      },
    },
    viewerScope: "shop",
    topSummary: {
      activeJobs: 8,
      blockedJobs: 2,
      waitingApprovals: 3,
      waitingParts: 4,
    },
    activeJobSummary: [{ label: "In progress", value: 8, pct: 80 }],
    liveShopLoad: [{ label: "Today", count: 8, pct: 80 }],
    dailySummary: [{ label: "Approval queue", value: "3", tone: "accent" }],
    liveWork: [
      {
        id: "work-order-1",
        label: "WO-1001",
        stage: "In progress",
        risk: "normal",
        priority: 1,
      },
    ],
    technicianActivity: [],
    blockerStack: [],
    alerts: [],
    suggestedActions: [],
    flowMix: [{ label: "In Progress", value: 8 }],
    sectionErrors: [],
    fetchAudit: [],
  })),
}));

vi.mock("../app/dashboard/_components/OperationsCharts", () => ({
  ShopLoadChart: () => React.createElement("div", null, "Shop load chart"),
}));

describe("smoke", () => {
  it("runs tests", () => {
    expect(true).toBe(true);
  });

  it("keeps the operations dashboard focused on core command surfaces", async () => {
    const { default: OperationsDashboardView } = await import(
      "../app/dashboard/_components/OperationsDashboardView"
    );

    const markup = renderToStaticMarkup(await OperationsDashboardView());

    expect(markup).not.toContain("SHOP BOOST OPERATIONAL STATUS");
    expect(markup).not.toContain("Materialization running");
    expect(markup).not.toContain("Open legacy guided review");
    expect(markup).not.toContain("Download migration report");

    expect(markup).toMatch(/Active jobs/i);
    expect(markup).toContain("Blocked");
    expect(markup).toContain("Approvals");
    expect(markup).toMatch(/Waiting parts/i);
    expect(markup).toContain("Live Work Command Surface");
  });
});
