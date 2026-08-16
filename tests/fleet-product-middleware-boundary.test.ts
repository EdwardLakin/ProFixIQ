import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "../middleware";

const authFixture = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    app_metadata: Record<string, unknown>;
  },
  profile: null as null | {
    id: string;
    role: string | null;
    shop_id: string | null;
    completed_onboarding: boolean;
  },
  memberships: [] as Array<{
    fleet_id: string;
    shop_id: string;
    role: string;
    created_at: string;
  }>,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    class MockQuery {
      constructor(private readonly table: string) {}

      select() {
        return this;
      }

      eq() {
        return this;
      }

      limit() {
        return this;
      }

      async maybeSingle() {
        return {
          data: this.table === "profiles" ? authFixture.profile : null,
          error: null,
        };
      }

      async order() {
        return {
          data: this.table === "fleet_members" ? authFixture.memberships : [],
          error: null,
        };
      }
    }

    return {
      auth: {
        getUser: async () => ({
          data: { user: authFixture.user },
          error: null,
        }),
      },
      from: (table: string) => new MockQuery(table),
      rpc: async () => ({ data: true, error: null }),
    };
  },
}));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  authFixture.user = null;
  authFixture.profile = null;
  authFixture.memberships = [];

  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }

  if (originalSupabaseAnonKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
  }
});

function fleetRequest(pathname: string): NextRequest {
  return new NextRequest(`https://fleet.profixiq.com${pathname}`, {
    headers: { host: "fleet.profixiq.com" },
  });
}

function shopRequest(pathname: string): NextRequest {
  return new NextRequest(`https://profixiq.com${pathname}`, {
    headers: { host: "profixiq.com" },
  });
}

describe("Product host middleware boundary", () => {
  it("keeps the Shop marketing root public for an incomplete authenticated account", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    authFixture.user = { id: "user-1", app_metadata: {} };
    authFixture.profile = {
      id: "user-1",
      role: null,
      shop_id: null,
      completed_onboarding: false,
    };

    const response = await middleware(shopRequest("/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still routes an incomplete authenticated account from protected Shop routes to onboarding", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    authFixture.user = { id: "user-1", app_metadata: {} };
    authFixture.profile = {
      id: "user-1",
      role: null,
      shop_id: null,
      completed_onboarding: false,
    };

    const response = await middleware(shopRequest("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://profixiq.com/onboarding",
    );
  });

  it("moves legacy Fleet workspace URLs off the Shop hostname", async () => {
    const response = await middleware(
      shopRequest("/portal/fleet/units/unit-42?tab=history"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/assets/unit-42?tab=history",
    );
  });

  it("moves old Shop Fleet operational URLs onto the Fleet product host", async () => {
    const response = await middleware(
      shopRequest("/fleet/units/unit-42?tab=history"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/assets/unit-42?tab=history",
    );
  });

  it("keeps only Fleet relationship setup on the Shop host", async () => {
    const response = await middleware(shopRequest("/fleet/programs"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://profixiq.com/dashboard/owner/fleet-access",
    );
  });

  it("moves legacy Fleet sign-in off the Shop hostname", async () => {
    const response = await middleware(
      shopRequest("/portal/auth/fleet-sign-in?redirect=%2Fportal%2Ffleet"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/sign-in?redirect=%2Fportal%2Ffleet",
    );
  });

  it("moves the dedicated Fleet card route onto the Fleet product host", async () => {
    const response = await middleware(shopRequest("/fleet/sign-in"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/sign-in",
    );
  });

  it("moves legacy Field-flavored Mobile sign-in links to dedicated Field access", async () => {
    const response = await middleware(
      shopRequest("/mobile/sign-in?redirect=%2Fmobile%2Fservice"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://profixiq.com/field/sign-in?redirect=%2Fmobile%2Fservice",
    );
  });

  it("sends anonymous Field routes to Field sign-in", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const response = await middleware(shopRequest("/mobile/service"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://profixiq.com/field/sign-in?redirect=%2Fmobile%2Fservice",
    );
  });

  it("keeps the neutral access chooser visible to authenticated users", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    authFixture.user = { id: "user-1", app_metadata: {} };
    authFixture.profile = {
      id: "user-1",
      role: "owner",
      shop_id: "shop-1",
      completed_onboarding: true,
    };

    const response = await middleware(shopRequest("/sign-in"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("honors explicit Shop sign-in on a phone instead of switching products", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    authFixture.user = { id: "user-1", app_metadata: {} };
    authFixture.profile = {
      id: "user-1",
      role: "owner",
      shop_id: "shop-1",
      completed_onboarding: true,
    };

    const response = await middleware(
      new NextRequest("https://profixiq.com/shop/sign-in", {
        headers: {
          host: "profixiq.com",
          "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://profixiq.com/dashboard",
    );
  });

  it("does not expose the Shop work-order board as a Fleet route", async () => {
    const response = await middleware(fleetRequest("/dispatch"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/",
    );
  });

  it("canonicalizes legacy Fleet paths onto clean Fleet product URLs", async () => {
    const response = await middleware(
      fleetRequest("/portal/fleet/units/unit-42?tab=history"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/assets/unit-42?tab=history",
    );
  });

  it("keeps an authenticated Shop staff member with Fleet membership inside Fleet", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    authFixture.user = { id: "user-1", app_metadata: {} };
    authFixture.profile = {
      id: "user-1",
      role: "owner",
      shop_id: "shop-1",
      completed_onboarding: true,
    };
    authFixture.memberships = [
      {
        fleet_id: "fleet-1",
        shop_id: "shop-1",
        role: "manager",
        created_at: "2026-08-05T00:00:00.000Z",
      },
    ];

    const response = await middleware(fleetRequest("/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://fleet.profixiq.com/portal/fleet",
    );
  });

  it("does not expose Shop routes on the Fleet product host", async () => {
    const response = await middleware(fleetRequest("/dashboard/work-orders"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/",
    );
  });

  it("does not let extension-shaped Shop routes bypass the Fleet boundary", async () => {
    const response = await middleware(
      fleetRequest("/work-orders/forged-route.js"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/",
    );
  });

  it("serves only the Fleet manifest on the Fleet product host", async () => {
    const shopManifest = await middleware(
      fleetRequest("/manifest.webmanifest"),
    );
    const fleetManifest = await middleware(
      fleetRequest("/fleet-manifest.webmanifest"),
    );

    expect(shopManifest.status).toBe(307);
    expect(shopManifest.headers.get("location")).toBe(
      "https://fleet.profixiq.com/",
    );
    expect(fleetManifest.status).toBe(200);
    expect(fleetManifest.headers.get("x-middleware-next")).toBe("1");
  });

  it("rewrites the clean Fleet sign-in route to the existing protected implementation", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await middleware(
      fleetRequest("/sign-in?redirect=%2Fassets"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://fleet.profixiq.com/portal/auth/fleet-sign-in?redirect=%2Fassets",
    );
  });

  it("redirects protected clean routes to sign-in without leaking rewrite control headers", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const response = await middleware(
      fleetRequest("/assets/unit-42?tab=history"),
    );
    const location = new URL(String(response.headers.get("location")));

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("redirect")).toBe(
      "/assets/unit-42?tab=history",
    );
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("registers a host-wide matcher so future Shop routes remain outside Fleet", () => {
    expect(config.matcher).toContainEqual({
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "host", value: "fleet.profixiq.com" }],
    });
  });
});
