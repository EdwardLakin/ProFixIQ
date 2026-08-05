import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "../middleware";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
}));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
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

describe("Fleet product middleware boundary", () => {
  it("moves legacy Fleet workspace URLs off the Shop hostname", async () => {
    const response = await middleware(
      shopRequest("/portal/fleet/units/unit-42?tab=history"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/assets/unit-42?tab=history",
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

  it("does not expose Shop routes on the Fleet product host", async () => {
    const response = await middleware(fleetRequest("/dashboard/work-orders"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://fleet.profixiq.com/",
    );
  });

  it("rewrites the clean Fleet sign-in route to the existing protected implementation", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await middleware(fleetRequest("/sign-in?redirect=%2Fassets"));

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
