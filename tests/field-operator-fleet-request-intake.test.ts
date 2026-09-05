import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("verified Field operator fleet-request intake", () => {
  it("lets a verified Field operator convert a request alongside the existing Shop intake roles at the database layer", () => {
    const migration = read(
      "supabase/migrations/20260905193000_allow_field_operator_fleet_request_intake.sql",
    );

    expect(migration).toContain(
      "create or replace function public.convert_owned_fleet_service_request_to_work_order_atomic(",
    );
    expect(migration).toContain(
      "profile.role in ('owner', 'admin', 'manager', 'advisor')",
    );
    expect(migration).toContain(
      "public.mobile_profile_has_field_service_access(",
    );
    expect(migration).toContain(
      "grant execute on function public.convert_owned_fleet_service_request_to_work_order_atomic(uuid)\n  to authenticated, service_role;",
    );
    // The postcheck guards both halves of the boundary: the new Field path
    // exists, and the pre-existing Shop intake roles were not dropped.
    expect(migration).toContain(
      "Fleet conversion does not authorize verified Field operators",
    );
    expect(migration).toContain(
      "Fleet conversion lost its existing Shop intake roles",
    );
    expect(migration).toContain("Anonymous Fleet conversion access is unsafe");
  });

  it("shares one authorization boundary between the API route and the Field page instead of duplicating it", () => {
    const boundary = read("features/fleet/lib/shopFleetRequestIntake.ts");
    const convertRoute = read(
      "app/api/fleet/service-requests/convert-to-work-order/route.ts",
    );
    const listRoute = read("app/api/fleet/service-requests/route.ts");
    const fieldPage = read("app/mobile/service/fleet-requests/page.tsx");
    const shopPage = read("app/work-orders/fleet-requests/page.tsx");
    const inbox = read("features/fleet/components/ShopFleetRequestInbox.tsx");

    expect(boundary).toContain(
      "export async function canAcceptFleetServiceRequests",
    );
    expect(boundary).toContain("getMobileFieldServiceAccess");
    expect(convertRoute).toContain("canAcceptFleetServiceRequests(access)");
    expect(fieldPage).toContain("canAcceptFleetServiceRequests(access)");
    // The desktop Shop route keeps its original, narrower role-only gate —
    // this feature only widens who can act on a request from Field.
    expect(shopPage).toContain("SHOP_FLEET_REQUEST_INTAKE_ROLES");
    expect(shopPage).not.toContain("canAcceptFleetServiceRequests");

    // The list endpoint verifies Field access with the same RPC the
    // migration authorizes with, rather than re-deriving the boundary.
    expect(listRoute).toContain("mobile_profile_has_field_service_access");

    // Field mounts the shared inbox but must not redirect an operator to
    // the desktop work-order route after accepting a request.
    expect(fieldPage).toContain('workOrderBasePath="/mobile/work-orders"');
    expect(inbox).toContain('workOrderBasePath = "/work-orders"');
  });
});
