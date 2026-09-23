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

    expect(computeDemoAccessState(future)).toBe("active");
    expect(computeDemoAccessState(past)).toBe("expired");
    expect(computeDemoAccessState(new Date().toISOString())).toBe("expired");
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
  it("extends demo_access_expires_at for a genuine tracked prospect", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        shops: [{ data: internalDemoShopRow, error: null }],
        profiles: [
          { data: { id: PROSPECT_PROFILE_ID }, error: null },
          { data: null, error: null },
        ],
      }),
    );

    const { extendDemoProspect } = await import("@/features/ops/server/demoAccess");
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await expect(
      extendDemoProspect({ profileId: PROSPECT_PROFILE_ID, expiresAt: future }),
    ).resolves.toEqual({ expiresAt: future });
  });

  it("rejects extending a profileId that is not a tracked prospect of the configured demo shop", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        shops: [{ data: internalDemoShopRow, error: null }],
        // The verification select finds nothing: either a different shop,
        // a non-owner role, or a permanent (non-demo) account.
        profiles: [{ data: null, error: null }],
      }),
    );

    const { extendDemoProspect } = await import("@/features/ops/server/demoAccess");
    const future = new Date(Date.now() + 86_400_000).toISOString();

    await expect(
      extendDemoProspect({ profileId: OTHER_SHOP_ID, expiresAt: future }),
    ).rejects.toThrow("This account is not a tracked Demo Shop prospect.");
  });

  it("rejects extending to a non-future expiration", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({ shops: [{ data: internalDemoShopRow, error: null }] }),
    );

    const { extendDemoProspect } = await import("@/features/ops/server/demoAccess");
    const past = new Date(Date.now() - 60_000).toISOString();

    await expect(
      extendDemoProspect({ profileId: PROSPECT_PROFILE_ID, expiresAt: past }),
    ).rejects.toThrow("Expiration must be a valid date/time in the future.");
  });

  it("revokes by setting demo_access_expires_at to now, without deleting the user", async () => {
    const admin = createAdminMock({
      shops: [{ data: internalDemoShopRow, error: null }],
      profiles: [
        { data: { id: PROSPECT_PROFILE_ID }, error: null },
        { data: null, error: null },
      ],
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

  it("rejects revoking a profileId that is not a tracked prospect of the configured demo shop", async () => {
    createAdminSupabaseMock.mockReturnValue(
      createAdminMock({
        shops: [{ data: internalDemoShopRow, error: null }],
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
      source.indexOf("async function requireDemoProspectProfile"),
    );
    expect(createFn).toContain("tempPassword,");
    expect(createFn).not.toContain("tempPassword: null");
  });

  it("revoke never deletes the prospect's auth user", () => {
    const revokeFn = source.slice(source.indexOf("export async function revokeDemoProspect"));
    expect(revokeFn).not.toContain("deleteUser");
  });

  it("sets demo_access_expires_at from validated input on create and extend", () => {
    expect(source).toContain("demo_access_expires_at: input.expiresAt");
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
