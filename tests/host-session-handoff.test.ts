import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  handoffBeginHref,
  isHandoffHref,
  isTrustedHandoffNavigation,
  isValidHandoffBind,
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

import { GET as begin } from "../app/api/auth/handoff/begin/route";
import { GET as start } from "../app/api/auth/handoff/start/route";
import { GET as redeem } from "../app/api/auth/handoff/redeem/route";

import {
  handoffNonceMatches,
  hashHandoffNonce,
  HANDOFF_NONCE_COOKIE,
} from "@/features/shared/lib/server/hostHandoffBinding";

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

  it("validates bind values and recognizes handoff hrefs", () => {
    expect(isValidHandoffBind("a".repeat(64))).toBe(true);
    for (const bad of [null, "", "a".repeat(63), "A".repeat(64), "g".repeat(64)]) {
      expect(isValidHandoffBind(bad)).toBe(false);
    }
    expect(isHandoffHref(handoffBeginHref(PRIMARY, FLEET, "/dashboard"))).toBe(true);
    expect(isHandoffHref("/dashboard")).toBe(false);
  });

  it("matches the nonce cookie to its hash only", () => {
    const bind = hashHandoffNonce("nonce-a");
    expect(handoffNonceMatches("nonce-a", bind)).toBe(true);
    expect(handoffNonceMatches("nonce-b", bind)).toBe(false);
    expect(handoffNonceMatches(undefined, bind)).toBe(false);
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

  it("route entitled workspaces through the handoff, beginning on the target", () => {
    expect(workspaceProductHref(shop, true, "fleet")).toBe(
      handoffBeginHref(PRIMARY, FLEET, "/dashboard"),
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
  const BIND = "a".repeat(64);
  const url = (target: string, next: string, bind: string | null = BIND) =>
    new NextRequest(
      `${FLEET}/api/auth/handoff/start?target=${encodeURIComponent(target)}&next=${encodeURIComponent(next)}${bind ? `&bind=${bind}` : ""}`,
    );

  it("rejects unknown targets and unsafe paths without minting", async () => {
    expect((await start(url("https://evil.io", "/dashboard"))).status).toBe(400);
    expect((await start(url(PRIMARY, "//evil.io"))).status).toBe(400);
    expect((await start(url(PRIMARY, "/dashboard", null))).status).toBe(400);
    expect((await start(url(PRIMARY, "/dashboard", "xyz"))).status).toBe(400);
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
    expect(loc.searchParams.get("bind")).toBe(BIND);
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

describe("GET /api/auth/handoff/begin", () => {
  const url = (source: string, next: string, origin = PRIMARY) =>
    new NextRequest(
      `${origin}/api/auth/handoff/begin?source=${encodeURIComponent(source)}&next=${encodeURIComponent(next)}`,
    );

  it("sets a host-only nonce cookie and sends the browser to the source with its hash", async () => {
    const res = await begin(url(FLEET, "/dashboard"));
    const loc = new URL(res.headers.get("location")!);
    const cookie = res.cookies.get(HANDOFF_NONCE_COOKIE);
    expect(res.status).toBe(303);
    expect(loc.origin).toBe(FLEET);
    expect(loc.pathname).toBe("/api/auth/handoff/start");
    expect(loc.searchParams.get("target")).toBe(PRIMARY);
    expect(loc.searchParams.get("next")).toBe("/dashboard");
    expect(cookie?.value).toBeTruthy();
    expect(loc.searchParams.get("bind")).toBe(hashHandoffNonce(cookie!.value));
    const setCookie = res.headers.get("set-cookie")!.toLowerCase();
    expect(setCookie).toContain("httponly");
    expect(setCookie).toContain("secure");
    expect(setCookie).toContain("path=/");
    expect(setCookie).not.toContain("domain=");
    expect(HANDOFF_NONCE_COOKIE.startsWith("__Host-")).toBe(true);
  });

  it("rejects unknown sources, same-host sources, unsafe paths and unknown hosts", async () => {
    for (const r of [
      url("https://evil.io", "/dashboard"),
      url(PRIMARY, "/dashboard"),
      url(FLEET, "//evil.io"),
      url(FLEET, "/dashboard", "https://evil.io"),
    ]) {
      const res = await begin(r);
      expect(res.status).toBe(400);
      expect(res.cookies.get(HANDOFF_NONCE_COOKIE)).toBeUndefined();
    }
  });
});

describe("GET /api/auth/handoff/redeem", () => {
  const NONCE = "victim-nonce";
  const BIND = hashHandoffNonce(NONCE);
  const req = (
    query: string,
    opts: { site?: string; nonce?: string } = { site: "same-site", nonce: NONCE },
  ) =>
    new NextRequest(`${PRIMARY}/api/auth/handoff/redeem?${query}`, {
      headers: {
        ...(opts.site ? { "sec-fetch-site": opts.site } : {}),
        ...(opts.nonce ? { cookie: `${HANDOFF_NONCE_COOKIE}=${opts.nonce}` } : {}),
      },
    });
  const good = `token_hash=tok_1234567890&next=/dashboard&bind=${BIND}`;

  it("exchanges the token for a session when the nonce matches, and clears the nonce", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
    const res = await redeem(req(good));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "tok_1234567890",
    });
    expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
    expect(res.cookies.get(HANDOFF_NONCE_COOKIE)?.value).toBe("");
  });

  it("does not log a victim in with an attacker-minted token (login CSRF)", async () => {
    // Attacker begins on their own browser, so the link carries bind=H(attackerNonce).
    const attackerBind = hashHandoffNonce("attacker-nonce");
    const link = `token_hash=tok_1234567890&next=/dashboard&bind=${attackerBind}`;

    // Victim has no nonce, or a different one, or tries a same-site-planted link.
    for (const r of [
      req(link, { site: "same-site" }),
      req(link, { site: "same-site", nonce: NONCE }),
    ]) {
      const res = await redeem(r);
      expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("does not log in for untrusted or malformed requests", async () => {
    for (const r of [
      req(good, { site: "cross-site", nonce: NONCE }),
      req(good, { nonce: NONCE }),
      req(`token_hash=bad&next=/dashboard&bind=${BIND}`),
      req("token_hash=tok_1234567890&next=/dashboard"),
      req(`token_hash=tok_1234567890&next=/dashboard&bind=zz`),
    ]) {
      const res = await redeem(r);
      expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("never redirects off-origin, even with a hostile next", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null });
    const res = await redeem(
      req(`token_hash=tok_1234567890&next=//evil.io&bind=${BIND}`),
    );
    expect(res.headers.get("location")).toBe(`${PRIMARY}/`);
  });

  it("still lands on next when the exchange throws", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("boom"));
    const res = await redeem(req(good));
    expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
  });
});

describe("switcher renders handoff links as plain anchors", () => {
  it("does not use a prefetched router Link for handoff hrefs", () => {
    const src = readFileSync(
      join(process.cwd(), "features/shared/components/WorkspaceProductSwitcher.tsx"),
      "utf8",
    );
    expect(src).toContain("isHandoffHref(href)");
    expect(src).toMatch(/<a\s+key=\{product\.surface\}\s+href=\{href\}/);
  });
});
