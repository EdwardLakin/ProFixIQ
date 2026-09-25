import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("previous deferred work panel role gate", () => {
  it("only mounts the panel for roles the deferred-history API allows, instead of always rendering it and letting it fail with Forbidden", () => {
    const client = read("app/work-orders/[id]/Client.tsx");

    expect(client).toContain(
      "{vehicle?.id && currentActor.canManageWorkOrders ? (",
    );
  });

  it("keeps the client gate aligned with the GET /api/work-orders/deferred-history role allowlist", () => {
    const route = read("app/api/work-orders/deferred-history/route.ts");

    // canManageWorkOrders (features/shared/lib/rbac.ts) is true for exactly
    // owner, admin, manager, advisor, service, lead_hand, foreman -- the same
    // set this route allows. If either list changes, the other must too.
    expect(route).toContain(`const ALLOWED_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "lead_hand",
  "foreman",
] as const;`);
  });
});
