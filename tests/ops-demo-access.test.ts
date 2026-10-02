import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PR2 scope: manage temporary Owner prospect accounts for the one
// server-configured Demo Shop (DEMO_SHOP_ID), reusing the existing
// Auth/profile/shop_members provisioning shape. This is not a general
// shop-provisioning tool — the hard safety boundary is that every action
// resolves its target shop from DEMO_SHOP_ID only, and verifies
// shops.billing_entitlement_override = 'internal_demo' before touching
// anything, never accepting a shop id from the client.

const DEMO_SHOP_ID = "10101010-1010-4101-8101-101010101010";
const OTHER_SHOP_ID = "20202020-2020-4202-8202-202020202020";
const PROSPECT_PROFILE_ID = "30303030-3030-4303-8303-303030303030";
const PROSPECT_SHOP_ID = "40404040-4040-4404-8404-404040404040";

type MockResult = { data?: unknown; error?: unknown };

function makeBuilder(result: MockResult) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.not = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.ilike = vi.fn(chain);
  builder.upsert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.delete = vi.fn(chain);
  builder.returns = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: (value: MockResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function createAdminMock(routes: Record<string, MockResult[]>) {
  const from = vi.fn((table: string) => {
    const queue = routes[table];
    const result = queue?.shift() ?? { data: null, error: null };
    return makeBuilder(result);
  });
  return {
    from,
    auth: {
      admin: {
        createUser: vi.fn(),
        getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        deleteUser: vi.fn(),
      },
    },
  };
}

const createAdminSupabaseMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
}));

vi.mock("@/features/email/server", () => ({
  sendUserInviteEmail: vi.fn(),
}));

const requireOpsOperatorPageAccessMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/ops/server/operator-access", () => ({
  requireOpsOperatorPageAccess: requireOpsOperatorPageAccessMock,
}));

const ORIGINAL_DEMO_SHOP_ID = process.env.DEMO_SHOP_ID;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DEMO_SHOP_ID = DEMO_SHOP_ID;
  requireOpsOperatorPageAccessMock.mockResolvedValue({
    ok: true,
    profile: { id: "operator-profile-id" },
  });
});

afterEach(() => {
  if (ORIGINAL_DEMO_SHOP_ID === undefined) {
    delete process.env.DEMO_SHOP_ID;
  } else {
    process.env.DEMO_SHOP_ID = ORIGINAL_DEMO_SHOP_ID;
  }
});

const internalDemoShopRow = {
  id: DEMO_SHOP_ID,
  name: "ProFixIQ Demo",
  shop_name: "ProFixIQ Demo Shop",
  billing_entitlement_override: "internal_demo",
};

describe("computeDemoAccessState", () => {
  it("is active for a future timestamp and expired for a past one", async () => {
    const { computeDemoAccessState } = await import("@/features/ops/server/demoAccess");
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    expect(computeDemoAccessState(future, null)).toBe("active");
    expect(computeDemoAccessState(past, null)).toBe("expired");
    expect(computeDemoAccessState(new Date().toISOString(), null)).toBe("expired");
  });

  it("is archived whenever an archive timestamp is present, regardless of expiresAt", async () => {
    const { computeDemoAccessState } = await import("@/features/ops/server/demoAccess");
    const future = new Date(Date.now() + 60_000).toISOString();
    const archivedAt = new Date().toISOString();

    expect(computeDemoAccessState(future, archivedAt)).toBe("archived");
  });
});

describe("resolveDemoShopOrFail — hard safety boundary", () => {
  it("fails closed when DEMO_SHOP_ID is not configured", async () => {
    delete process.env.DEMO_SHOP_ID;
    createAdminSupabaseMock.mockReturnValue(createAdminMock({}));

    const { resolveDemoShopOrFail } = await import("@/features/ops/server/demoAccess");
    const admin = createAdminSupabaseMock();

    await expect(resolveDemoShopOrFail(admin)).rejects.toThrow(
      "DEMO_SHOP_ID is not configured.",
    );
  });

  it("fails closed when the configured shop does not exist", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({ shops: [{ data: null, error: null }] }),
    );

    const { resolveDemoShopOrFail } = await import("@/features/ops/server/demoAccess");
    const admin = createAdminSupabaseMock();

    await expect(resolveDemoShopOrFail(admin)).rejects.toThrow(
      "billing_entitlement_override = 'internal_demo'",
    );
  });

  it("fails closed when billing_entitlement_override is not internal_demo", async () => {
    for (const override of [null, "active", "read_only", "suspended"]) {
      createAdminSupabaseMock.mockReturnValue(
        createAdminMock({
          shops: [{ data: { ...internalDemoShopRow, billing_entitlement_override: override }, error: null }],
        }),
      );

      const { resolveDemoShopOrFail } = await import("@/features/ops/server/demoAccess");
      const admin = createAdminSupabaseMock();

      await expect(resolveDemoShopOrFail(admin)).rejects.toThrow(
        "billing_entitlement_override = 'internal_demo'",
      );
    }
  });

  it("resolves the shop only when billing_entitlement_override is internal_demo", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({ shops: [{ data: internalDemoShopRow, error: null }] }),
    );

    const { resolveDemoShopOrFail } = await import("@/features/ops/server/demoAccess");
    const admin = createAdminSupabaseMock();

    await expect(resolveDemoShopOrFail(admin)).resolves.toEqual({
      shopId: DEMO_SHOP_ID,
      shopDisplayName: "ProFixIQ Demo Shop",
    });
  });
});

describe("extendDemoProspect / revokeDemoProspect — profile ownership boundary", () => {
  // Each prospect now owns their own cloned shop, so extend/revoke resolve
  // it via resolveProspectShopId(): a "profiles" select (id, shop_id) for
  // the prospect, then a "shops" select confirming demo_prospect_profile_id
  // = that profile and billing_entitlement_override = 'internal_demo' --
  // never resolveDemoShopOrFail()/the template shop.
  it("extends demo_access_expires_at for a genuine tracked prospect", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        profiles: [
          { data: { id: PROSPECT_PROFILE_ID, shop_id: PROSPECT_SHOP_ID }, error: null },
          { data: null, error: null },
        ],
        shops: [{ data: { id: PROSPECT_SHOP_ID, demo_shop_archived_at: null }, error: null }],
      }),
    );

    const { extendDemoProspect } = await import("@/features/ops/server/demoAccess");
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await expect(
      extendDemoProspect({ profileId: PROSPECT_PROFILE_ID, expiresAt: future }),
    ).resolves.toEqual({ expiresAt: future });
  });

  it("un-archives the prospect's shop when extending past an already-archived expiry", async () => {
    const admin = createAdminMock({
      profiles: [
        { data: { id: PROSPECT_PROFILE_ID, shop_id: PROSPECT_SHOP_ID }, error: null },
        { data: null, error: null },
      ],
      shops: [
        { data: { id: PROSPECT_SHOP_ID, demo_shop_archived_at: "2026-01-01T00:00:00.000Z" }, error: null },
        { data: null, error: null },
      ],
    });
    createAdminSupabaseMock.mockReturnValue(admin);

    const { extendDemoProspect } = await import("@/features/ops/server/demoAccess");
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await expect(
      extendDemoProspect({ profileId: PROSPECT_PROFILE_ID, expiresAt: future }),
    ).resolves.toEqual({ expiresAt: future });
    // Two "shops" reads/writes: resolveProspectShopId's select, then the
    // archived_at-clearing update.
    expect(admin.from).toHaveBeenCalledWith("shops");
  });

  it("rejects extending a profileId that is not a tracked prospect", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        // The profile verification select finds nothing: either a
        // non-owner role or a permanent (non-demo) account.
        profiles: [{ data: null, error: null }],
      }),
    );

    const { extendDemoProspect } = await import("@/features/ops/server/demoAccess");
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await expect(
      extendDemoProspect({ profileId: OTHER_SHOP_ID, expiresAt: future }),
    ).rejects.toThrow("This account is not a tracked Demo Shop prospect.");
  });

  it("rejects extending when the profile's shop is no longer a tracked demo prospect shop", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        profiles: [{ data: { id: PROSPECT_PROFILE_ID, shop_id: PROSPECT_SHOP_ID }, error: null }],
        // e.g. demo_prospect_profile_id no longer matches, or the shop's
        // internal_demo override was removed.
        shops: [{ data: null, error: null }],
      }),
    );

    const { extendDemoProspect } = await import("@/features/ops/server/demoAccess");
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await expect(
      extendDemoProspect({ profileId: PROSPECT_PROFILE_ID, expiresAt: future }),
    ).rejects.toThrow("This account is not a tracked Demo Shop prospect.");
  });

  it("rejects extending to a non-future expiration", async () => {
    createAdminSupabaseMock.mockReturnValue(createAdminMock({}));

    const { extendDemoProspect } = await import("@/features/ops/server/demoAccess");
    const past = new Date(Date.now() - 60_000).toISOString();

    await expect(
      extendDemoProspect({ profileId: PROSPECT_PROFILE_ID, expiresAt: past }),
    ).rejects.toThrow("Expiration must be a valid date/time in the future.");
  });

  it("revokes by setting demo_access_expires_at to now, without deleting the user", async () => {
    const admin = createAdminMock({
      profiles: [
        { data: { id: PROSPECT_PROFILE_ID, shop_id: PROSPECT_SHOP_ID }, error: null },
        { data: null, error: null },
      ],
      shops: [{ data: { id: PROSPECT_SHOP_ID, demo_shop_archived_at: null }, error: null }],
    });
    createAdminSupabaseMock.mockReturnValue(admin);

    const { revokeDemoProspect } = await import("@/features/ops/server/demoAccess");
    const before = Date.now();
    const result = await revokeDemoProspect({ profileId: PROSPECT_PROFILE_ID });
    const after = Date.now();

    const revokedAtMs = Date.parse(result.expiresAt);
    expect(revokedAtMs).toBeGreaterThanOrEqual(before);
    expect(revokedAtMs).toBeLessThanOrEqual(after);
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects revoking a profileId that is not a tracked prospect", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        profiles: [{ data: null, error: null }],
      }),
    );

    const { revokeDemoProspect } = await import("@/features/ops/server/demoAccess");

    await expect(revokeDemoProspect({ profileId: OTHER_SHOP_ID })).rejects.toThrow(
      "This account is not a tracked Demo Shop prospect.",
    );
  });
});

describe("demoAccess.ts — provisioning contract", () => {
  const source = readFileSync("features/ops/server/demoAccess.ts", "utf8");

  it("provisions prospects as canonical owner, never a demo_owner role", () => {
    expect(source).not.toContain("demo_owner");
    expect(source).toContain('role: "owner"');
  });

  it("never derives the target shop from anything other than resolveDemoShopOrFail", () => {
    expect(source).not.toMatch(/input\.shopId|input\.shop_id/);
    expect(source).toContain("resolveDemoShopOrFail(admin)");
  });

  it("mirrors shop_members and people_workforce_profiles like the existing provisioning flow", () => {
    expect(source).toContain('.from("shop_members")');
    expect(source).toContain('onConflict: "shop_id,user_id"');
    expect(source).toContain('.from("people_workforce_profiles")');
  });

  it("rolls back the created auth user and dependent rows on provisioning failure", () => {
    expect(source).toContain("rollbackCreatedProspect");
    expect(source).toContain('["shop_members", "user_id"]');
    expect(source).toContain('["people_workforce_profiles", "user_id"]');
    expect(source).toContain('["profiles", "id"]');
  });

  it("emails the prospect their real temporary password, unlike the internal staff invite flow", () => {
    const createFn = source.slice(
      source.indexOf("export async function createDemoProspect"),
      source.indexOf("async function resolveProspectShopId"),
    );
    expect(createFn).toContain("tempPassword,");
    expect(createFn).not.toContain("tempPassword: null");
  });

  it("revoke never deletes the prospect's auth user", () => {
    const revokeFn = source.slice(
      source.indexOf("export async function revokeDemoProspect"),
      source.indexOf("export async function archiveExpiredDemoProspects"),
    );
    expect(revokeFn).not.toContain("deleteUser");
  });

  it("sets demo_access_expires_at from validated input on create and extend", () => {
    expect(source).toContain("demo_access_expires_at: input.expiresAt");
  });

  it("clones every prospect into their own shop instead of sharing the template", () => {
    expect(source).toContain("cloneDemoShopForProspect");
    expect(source).toContain("demo_prospect_profile_id: newUserId");
    expect(source).toContain("seedDemoShopFixtures");
  });

  it("the cloned-shop field allow-list never includes Stripe identifiers or other cross-tenant references", () => {
    const listStart = source.indexOf("const CLONED_SHOP_DISPLAY_FIELDS = [");
    const listEnd = source.indexOf("] as const;", listStart);
    const list = source.slice(listStart, listEnd);

    for (const forbidden of [
      "stripe_account_id",
      "stripe_customer_id",
      "stripe_subscription_id",
      "stripe_checkout_session_id",
      "organization_id",
      "default_stock_location_id",
      "owner_pin",
      '"slug"',
      "owner_id",
    ]) {
      expect(list).not.toContain(forbidden);
    }
    // stripe_pricing_model is a model label, not an external identifier --
    // it's expected and safe to clone.
    expect(list).toContain("stripe_pricing_model");
  });

  it("rollback clears fixture tables (deepest dependency first) before deleting the cloned shop", () => {
    const rollbackFn = source.slice(
      source.indexOf("async function rollbackCreatedProspect"),
      source.indexOf("async function cloneDemoShopForProspect"),
    );
    const workOrderLinesIdx = rollbackFn.indexOf('"work_order_lines"');
    const workOrdersIdx = rollbackFn.indexOf('"work_orders"');
    const customersIdx = rollbackFn.indexOf('"customers"');
    const shopsDeleteIdx = rollbackFn.indexOf('.from("shops").delete()');

    expect(workOrderLinesIdx).toBeGreaterThan(-1);
    expect(shopsDeleteIdx).toBeGreaterThan(-1);
    expect(workOrderLinesIdx).toBeLessThan(workOrdersIdx);
    expect(workOrdersIdx).toBeLessThan(customersIdx);
    expect(customersIdx).toBeLessThan(shopsDeleteIdx);
  });

  it("archiving only ever marks shops, never deletes prospect data", () => {
    const archiveFn = source.slice(source.indexOf("export async function archiveExpiredDemoProspects"));
    expect(archiveFn).toContain("demo_shop_archived_at: new Date().toISOString()");
    expect(archiveFn).not.toContain(".delete(");
  });
});

describe("ops/demo-access API routes — never accept a client-supplied shop id", () => {
  const routes = [
    "app/api/ops/demo-access/create/route.ts",
    "app/api/ops/demo-access/extend/route.ts",
    "app/api/ops/demo-access/revoke/route.ts",
  ];

  it("every route checks requireOpsOperatorApiAccess() and returns its response on failure", () => {
    for (const routePath of routes) {
      const source = readFileSync(routePath, "utf8");
      expect(source).toContain("requireOpsOperatorApiAccess");
      expect(source).toContain("if (!access.ok) return access.response;");
    }
  });

  it("never reads a shopId/shop_id field from the parsed request body", () => {
    for (const routePath of routes) {
      const source = readFileSync(routePath, "utf8");
      expect(source).not.toMatch(/body\.shopId|body\.shop_id/);
    }
  });

  it("create route only accepts fullName, email, and expiresAt from the client", () => {
    const source = readFileSync("app/api/ops/demo-access/create/route.ts", "utf8");
    expect(source).toContain("body.fullName");
    expect(source).toContain("body.email");
    expect(source).toContain("body.expiresAt");
    expect(source).toContain("access.profile?.id ?? null");
  });

  it("extend and revoke routes key off profileId, resolved server-side to the demo shop", () => {
    for (const routePath of [
      "app/api/ops/demo-access/extend/route.ts",
      "app/api/ops/demo-access/revoke/route.ts",
    ]) {
      const source = readFileSync(routePath, "utf8");
      expect(source).toContain("body.profileId");
    }
  });
});

describe("ops nav and page wiring", () => {
  it("adds the Demo Access page to the ops navigation", () => {
    const shell = readFileSync("features/ops/components/OpsShell.tsx", "utf8");
    expect(shell).toContain('href: "/ops/demo-access"');
  });

  it("the demo-access page renders under the existing ops layout gate, not a new access model", () => {
    const layout = readFileSync("app/ops/layout.tsx", "utf8");
    expect(layout).toContain("requireOpsOperatorPageAccess");

    const page = readFileSync("app/ops/demo-access/page.tsx", "utf8");
    expect(page).toContain("listDemoProspects");
    expect(page).not.toContain("is_internal_staff");
  });
});


describe("demo temporary password policy", () => {
  it("generates passwords with every required character class", async () => {
    const { generateTempPassword } = await import("@/features/ops/server/demoAccess");
    const passwords = Array.from({ length: 200 }, () => generateTempPassword());
    for (const password of passwords) {
      expect(password).toHaveLength(32);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^a-zA-Z0-9]/);
    }
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});
