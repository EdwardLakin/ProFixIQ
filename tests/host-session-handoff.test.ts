import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  handoffStartHref,
  isTrustedHandoffNavigation,
  isValidHandoffTokenHash,
  resolveHandoffTarget,
  safeHandoffPath,
} from "@/features/shared/lib/hostHandoff";
import {
  WORKSPACE_PRODUCTS,
  workspaceProductHref,
} from "@/features/shared/lib/workspaceProducts";

const mocks = vi.hoisted(() => ({
  user: null as null | { email?: string | null },
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: () => ({
    auth: {
      getUser: async () => ({ data: { user: mocks.user } }),
      verifyOtp: mocks.verifyOtp,
    },
  }),
  createAdminSupabase: () => ({
    auth: { admin: { generateLink: mocks.generateLink } },
  }),
}));

import { GET as start } from "../app/api/auth/handoff/start/route";
import { GET as redeem } from "../app/api/auth/handoff/redeem/route";

const PRIMARY = "https://profixiq.com";
const FLEET = "https://fleet.profixiq.com";

beforeEach(() => {
  mocks.user = null;
  mocks.generateLink.mockReset();
  mocks.verifyOtp.mockReset();
});

describe("handoff helpers", () => {
  it("only accepts exact allowlisted target origins", () => {
    expect(resolveHandoffTarget(PRIMARY)).toBe(PRIMARY);
    expect(resolveHandoffTarget(FLEET)).toBe(FLEET);
    for (const bad of [
      null,
      "",
      "https://shopreel.profixiq.com",
      "https://profixiq.com.evil.io",
      "https://evil.io/https://profixiq.com",
      "http://profixiq.com",
      "https://profixiq.com/",
    ]) {
      expect(resolveHandoffTarget(bad)).toBeNull();
    }
  });

  it("only accepts same-origin paths outside the handoff routes", () => {
    expect(safeHandoffPath("/dashboard")).toBe("/dashboard");
    expect(safeHandoffPath("/equipment?x=1")).toBe("/equipment?x=1");
    for (const bad of [
      null,
      "",
      "dashboard",
      "//evil.io",
      "/\\evil.io",
      "https://evil.io",
      "/a\nb",
      "/api/auth/handoff/start?next=/x",
    ]) {
      expect(safeHandoffPath(bad)).toBeNull();
    }
  });

  it("validates token shape and fails closed on missing fetch metadata", () => {
    expect(isValidHandoffTokenHash("abcDEF123_-xyz")).toBe(true);
    expect(isValidHandoffTokenHash("short")).toBe(false);
    expect(isValidHandoffTokenHash("has space 12345")).toBe(false);
    expect(isValidHandoffTokenHash(null)).toBe(false);

    const h = (site?: string) =>
      new Headers(site ? { "sec-fetch-site": site } : {});
    expect(isTrustedHandoffNavigation(h("same-site"))).toBe(true);
    expect(isTrustedHandoffNavigation(h("same-origin"))).toBe(true);
    expect(isTrustedHandoffNavigation(h("cross-site"))).toBe(false);
    expect(isTrustedHandoffNavigation(h("none"))).toBe(false);
    expect(isTrustedHandoffNavigation(h())).toBe(false);
  });
});

describe("switcher links leaving the Fleet host", () => {
  const shop = WORKSPACE_PRODUCTS.find((p) => p.surface === "shop")!;

  it("route entitled workspaces through the handoff", () => {
    expect(workspaceProductHref(shop, true, "fleet")).toBe(
      handoffStartHref(PRIMARY, "/dashboard"),
    );
  });

  it("send acquisition pages straight to the primary site", () => {
    expect(workspaceProductHref(shop, false, "fleet")).toBe(
      `${PRIMARY}${shop.marketingHref}`,
    );
  });

  it("leave other hosts' links relative", () => {
    expect(workspaceProductHref(shop, true, "field")).toBe("/dashboard");
  });
});

describe("GET /api/auth/handoff/start", () => {
  const url = (target: string, next: string) =>
    new NextRequest(
      `${FLEET}/api/auth/handoff/start?target=${encodeURIComponent(target)}&next=${encodeURIComponent(next)}`,
    );

  it("rejects unknown targets and unsafe paths without minting", async () => {
    expect((await start(url("https://evil.io", "/dashboard"))).status).toBe(400);
    expect((await start(url(PRIMARY, "//evil.io"))).status).toBe(400);
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it("redirects to the target redeem route with a one-time token", async () => {
    mocks.user = { email: "a@b.co" };
    mocks.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "tok_1234567890" } },
      error: null,
    });
    const res = await start(url(PRIMARY, "/dashboard"));
    const loc = new URL(res.headers.get("location")!);
    expect(res.status).toBe(303);
    expect(loc.origin).toBe(PRIMARY);
    expect(loc.pathname).toBe("/api/auth/handoff/redeem");
    expect(loc.searchParams.get("token_hash")).toBe("tok_1234567890");
    expect(loc.searchParams.get("next")).toBe("/dashboard");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "a@b.co",
    });
  });

  it("falls back to a plain navigation when signed out or minting fails", async () => {
    let res = await start(url(PRIMARY, "/dashboard"));
    expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);

    mocks.user = { email: "a@b.co" };
    mocks.generateLink.mockResolvedValue({ data: null, error: new Error("x") });
    res = await start(url(PRIMARY, "/dashboard"));
    expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
  });
});

describe("GET /api/auth/handoff/redeem", () => {
  const req = (query: string, site?: string) =>
    new NextRequest(`${PRIMARY}/api/auth/handoff/redeem?${query}`, {
      headers: site ? { "sec-fetch-site": site } : {},
    });

  it("exchanges the token for a session and redirects to next", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
    const res = await redeem(req("token_hash=tok_1234567890&next=/dashboard", "same-site"));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "tok_1234567890",
    });
    expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
  });

  it("does not log in for untrusted or malformed requests", async () => {
    for (const r of [
      req("token_hash=tok_1234567890&next=/dashboard", "cross-site"),
      req("token_hash=tok_1234567890&next=/dashboard"),
      req("token_hash=bad&next=/dashboard", "same-site"),
    ]) {
      const res = await redeem(r);
      expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("never redirects off-origin, even with a hostile next", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
    const res = await redeem(req("token_hash=tok_1234567890&next=//evil.io", "same-site"));
    expect(res.headers.get("location")).toBe(`${PRIMARY}/`);
  });

  it("still lands on next when the exchange throws", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("boom"));
    const res = await redeem(req("token_hash=tok_1234567890&next=/dashboard", "same-site"));
    expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
  });
});
