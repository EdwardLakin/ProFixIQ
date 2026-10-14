import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EquipmentWorkOrderActions from "@/features/equipment/components/EquipmentWorkOrderActions";
import EquipmentWorkOrdersView from "@/features/equipment/components/EquipmentWorkOrdersView";
import type { EquipmentWorkOrderRow } from "@/features/equipment/lib/equipmentWorkOrders";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const BASE: EquipmentWorkOrderRow = {
  id: "wo-1",
  title: "WO 1001",
  status: "in_progress",
  statusLabel: "in_progress",
  href: "/work-orders/wo-1",
  assetId: "asset-1",
  assetHref: "/equipment/asset-1",
  assetLabel: "Unit EX-12 · 2024 CAT 320",
  customerName: "North Yard",
  createdAt: "2026-10-14T12:00:00Z",
  scheduledAt: null,
};

describe("Equipment work orders", () => {
  it("renders every canonical work order even when multiple belong to the same asset", () => {
    const rows: EquipmentWorkOrderRow[] = [
      BASE,
      {
        ...BASE,
        id: "wo-2",
        title: "WO 1002",
        href: "/work-orders/wo-2",
      },
    ];

    const markup = renderToStaticMarkup(<EquipmentWorkOrdersView rows={rows} truncated={false} />);

    expect(markup).toContain("WO 1001");
    expect(markup).toContain("WO 1002");
    expect(markup).toContain('href="/work-orders/wo-1"');
    expect(markup).toContain('href="/work-orders/wo-2"');
    expect(markup).toContain('href="/equipment/asset-1"');
  });

  it("preserves read-only work-order rows when the canonical role cannot open them", () => {
    const markup = renderToStaticMarkup(
      <EquipmentWorkOrdersView rows={[{ ...BASE, href: null }]} truncated={false} />,
    );

    expect(markup).toContain("WO 1001");
    expect(markup).not.toContain('href="/work-orders/wo-1"');
  });

  it("only offers creation when the canonical vehicle workspace supplies a handoff", () => {
    const allowed = renderToStaticMarkup(
      <EquipmentWorkOrderActions
        createWorkOrderHref="/work-orders/create?autostart=1&amp;customerId=customer-1&amp;vehicleId=asset-1"
      />,
    );
    const blocked = renderToStaticMarkup(<EquipmentWorkOrderActions createWorkOrderHref={null} />);

    expect(allowed).toContain("Create work order");
    expect(allowed).toContain("/work-orders/create?");
    expect(blocked).not.toContain("Create work order");
    expect(blocked).toContain("View Equipment work");
  });

  it("labels a bounded feed honestly when more than 100 Equipment work orders exist", () => {
    const markup = renderToStaticMarkup(<EquipmentWorkOrdersView rows={[BASE]} truncated />);
    expect(markup).toContain("Showing the 100 most recent Equipment work orders.");
  });
});
