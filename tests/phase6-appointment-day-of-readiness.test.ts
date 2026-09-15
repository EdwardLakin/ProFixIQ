import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const opsNotificationsModule = readFileSync(
  "features/agent/server/getOpsNotifications.ts",
  "utf8",
);
const shopStateModule = readFileSync(
  "features/shop-assistant/server/state/buildShopState.ts",
  "utf8",
);
const syncShopBlockerObservations = readFileSync(
  "features/operations/server/syncShopBlockerObservations.ts",
  "utf8",
);

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Phase 6 — day-of appointment readiness, the first day-of deterministic-orchestration notification", () => {
  it("registers a durable notification code in the shared ops-notification vocabulary", () => {
    expect(opsNotificationsModule).toContain('"appointment_day_of_readiness"');
  });

  it("resolves the shop's own local 'today' rather than a fixed UTC day or an elapsed-hours window", () => {
    expect(opsNotificationsModule).toContain('.from("shops")');
    expect(opsNotificationsModule).toContain('.select("timezone")');
    expect(opsNotificationsModule).toContain(
      "const todayRange = getShopDayRange(shopRow?.timezone ?? null);",
    );
  });

  it("reads the Phase 4 preparation projection scoped to today's active bookings only", () => {
    expect(opsNotificationsModule).toContain('.from("appointment_preparations")');
    expect(opsNotificationsModule).toContain('.eq("status", "active")');
    expect(opsNotificationsModule).toContain('.gte("starts_at", todayRange.start)');
    expect(opsNotificationsModule).toContain('.lt("starts_at", todayRange.end)');
  });

  describe("detection block", () => {
    const block = section(
      opsNotificationsModule,
      "for (const row of dayOfPreparationRows) {",
      "const loadMetrics = await getTechnicianLoadMetricsWithClient",
    );

    it("only fires when something needs attention — missing info or short required parts — not on every active booking", () => {
      expect(block).toContain("if (missingInfo.length === 0 && !partsShort) continue;");
    });

    it("uses the same required-parts-first verdict rule as the staff-facing preparation list, so the two surfaces never disagree", () => {
      expect(block).toContain("line.isRequired");
      expect(block).toContain(
        "requiredPartsLines.length > 0 ? requiredPartsLines : allPartsLines",
      );
      expect(block).toContain('line.status === "short"');
    });

    it("links to the same create-work-order-from-booking flow the preparation list itself links to", () => {
      expect(block).toContain(
        'const hrefParams = new URLSearchParams({ bookingId: row.booking_id });',
      );
      expect(block).toContain('hrefParams.set("vehicleId", row.vehicle_id)');
      expect(block).toContain("href: `/work-orders/create?${hrefParams.toString()}`");
    });

    it("carries booking entity identity and the appointment time as createdAt", () => {
      expect(block).toContain('code: "appointment_day_of_readiness"');
      expect(block).toContain('entityType: "booking"');
      expect(block).toContain("entityId: row.booking_id");
      expect(block).toContain("createdAt: row.starts_at");
    });

    it("never includes pricing in the message or evidence — this pipeline has no per-viewer pricing redaction, unlike the staff-facing preparation route", () => {
      expect(block.toLowerCase()).not.toMatch(/priceestimate|price_estimate|\$\{.*price/);
    });
  });

  it("never mutates the preparation projection, a booking, or a work order — purely a read/detect signal like every other ops notification", () => {
    const block = section(
      opsNotificationsModule,
      "for (const row of dayOfPreparationRows) {",
      "const loadMetrics = await getTechnicianLoadMetricsWithClient",
    );
    expect(block).not.toMatch(
      /\.from\(\s*["'](appointment_preparations|bookings|work_orders|work_order_lines)["']\)[\s\S]{0,200}\.\s*(insert|update|upsert|delete)\(/,
    );
  });

  it("flows automatically through the shadow-mode blocker observer with no extra wiring — it consumes getOpsNotifications generically", () => {
    expect(syncShopBlockerObservations).toContain("getOpsNotifications(");
    expect(syncShopBlockerObservations).not.toContain(
      '"appointment_day_of_readiness"',
    );
  });

  it("is visible on the shop-assistant alert surface to booking-facing and work-order-facing roles, not silently dropped by the default gate", () => {
    expect(shopStateModule).toContain(
      'if (alert.code === "appointment_day_of_readiness") {\n    return visibility.bookings || visibility.workOrders;',
    );
  });
});
