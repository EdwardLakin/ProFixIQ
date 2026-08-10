import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260810153000_fleet_handoff_certification.sql",
);

describe("Fleet handoff certification", () => {
  it("makes Fleet request retries atomic and rejects operation-key drift", () => {
    expect(migration).toContain("request_fingerprint text");
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain("pg_catalog.hashtextextended");
    expect(migration).toContain(
      "Operation key was already used for a different Fleet request payload",
    );

    const builder = read("app/portal/fleet/request/build/page.tsx");
    expect(builder).toContain(
      "const [operationKey] = useState(() => crypto.randomUUID())",
    );
    expect(builder).toContain("operationKey,");
    expect(builder).not.toContain("operationKey: crypto.randomUUID()\n");
  });

  it("allows only one Shop work order per Fleet request", () => {
    expect(migration).toContain(
      "create unique index if not exists work_orders_fleet_service_request_uidx",
    );
    expect(migration).toContain("source_fleet_service_request_id is not null");

    const conversion = read(
      "app/api/fleet/service-requests/convert-to-work-order/route.ts",
    );
    expect(conversion).toContain("isFleetProductHostname(requestHost)");
    expect(conversion).toContain("Work orders are created in ProFixIQ Shop.");
  });

  it("round-trips a simplified Shop status into Fleet", () => {
    expect(migration).toContain(
      "sync_fleet_service_request_progress_from_work_order",
    );
    expect(migration).toContain("after insert or update of status");
    expect(migration).toContain("then 'completed'");
    expect(migration).toContain("then 'cancelled'");
    expect(migration).toContain("else 'scheduled'");

    const requestApi = read("app/api/fleet/service-requests/route.ts");
    expect(requestApi).toContain("function projectedRequestStatus");
    expect(requestApi).toContain(
      'if (["completed", "closed", "invoiced", "paid"].includes(repair))',
    );
  });

  it("gives drivers a timestamped status timeline without Shop identifiers", () => {
    const driverApi = read("app/api/fleet/driver/dashboard/route.ts");
    const dashboard = read(
      "features/fleet/components/FleetDriverDashboard.tsx",
    );
    const types = read("features/fleet/types/driverPortal.ts");

    expect(driverApi).toContain('.select("id,status,created_at,updated_at")');
    expect(driverApi).toContain("const timeline:");
    expect(driverApi).toContain(
      '{ status: "submitted", reachedAt: reportedAt }',
    );
    expect(driverApi).not.toContain("workOrderId: text(defect.work_order_id)");
    expect(driverApi).not.toContain(
      "serviceRequestId: text(defect.service_request_id)",
    );
    expect(types).not.toContain("workOrderId: string | null");
    expect(types).not.toContain("serviceRequestId: string | null");
    expect(dashboard).toContain("issue.timeline.map");
    expect(dashboard).toContain("{dateTime(issue.lastUpdatedAt)}");
    expect(dashboard.toLowerCase()).not.toContain("work order");
  });
});
