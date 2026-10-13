import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  handoffBeginHref,
  handoffFailureUrl,
  isHandoffHref,
  isTrustedHandoffInitiator,
  isTrustedHandoffNavigation,
  isValidHandoffBind,
  isValidHandoffTokenHash,
  resolveHandoffTarget,
  safeHandoffPath,
} from "@/features/shared/lib/hostHandoff";
import {
  createHandoffState,
  handoffNonceMatches,
  handoffNonceCookieName,
  hashHandoffNonce,
  HANDOFF_NONCE_COOKIE_PREFIX,
  verifyHandoffState,
} from "@/features/shared/lib/server/hostHandoffBinding";
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
import { GET as failedPage } from "../app/api/auth/handoff/failed/route";

const PRIMARY = "https://profixiq.com";
const FLEET = "https://fleet.profixiq.com";

const NAV = {
  "sec-fetch-site": "same-site",
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
};

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
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
    expect(handoffFailureUrl(PRIMARY)).toBe(`${PRIMARY}/api/auth/handoff/failed`);
  });

  it("matches the nonce cookie to its hash only", () => {
    const bind = hashHandoffNonce("nonce-a");
    expect(handoffNonceMatches("nonce-a", bind)).toBe(true);
    expect(handoffNonceMatches("nonce-b", bind)).toBe(false);
    expect(handoffNonceMatches(undefined, bind)).toBe(false);
  });

  it("validates token shape", () => {
    expect(isValidHandoffTokenHash("abcDEF123_-xyz")).toBe(true);
    expect(isValidHandoffTokenHash("short")).toBe(false);
    expect(isValidHandoffTokenHash("has space 12345")).toBe(false);
    expect(isValidHandoffTokenHash(null)).toBe(false);
  });

  it("only trusts top-level navigations from our own origins, failing closed", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(isTrustedHandoffNavigation(h(NAV))).toBe(true);
    expect(isTrustedHandoffNavigation(h({ ...NAV, "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isTrustedHandoffNavigation(h({ ...NAV, "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isTrustedHandoffNavigation(h({ ...NAV, "sec-fetch-site": "none" }))).toBe(false);
    // Embeds from a same-site sibling: img / iframe / fetch.
    expect(isTrustedHandoffNavigation(h({ ...NAV, "sec-fetch-dest": "image", "sec-fetch-mode": "no-cors" }))).toBe(false);
    expect(isTrustedHandoffNavigation(h({ ...NAV, "sec-fetch-dest": "iframe" }))).toBe(false);
    expect(isTrustedHandoffNavigation(h({ ...NAV, "sec-fetch-mode": "cors" }))).toBe(false);
    expect(isTrustedHandoffNavigation(h({}))).toBe(false);
  });
});

describe("handoff initiator", () => {
  const h = (referer?: string) => new Headers(referer ? { referer } : {});

  it("only accepts a referrer on the exact source origin, failing closed", () => {
    expect(isTrustedHandoffInitiator(h(`${FLEET}/portal/fleet`), FLEET)).toBe(true);
    expect(isTrustedHandoffInitiator(h(`${FLEET}/`), FLEET)).toBe(true);
    for (const bad of [
      undefined,
      "not a url",
      "https://shopreel.profixiq.com/page",
      "https://fleet.profixiq.com.evil.io/",
      "http://fleet.profixiq.com/",
      `${PRIMARY}/dashboard`,
    ]) {
      expect(isTrustedHandoffInitiator(h(bad), FLEET)).toBe(false);
    }
  });

  it("names nonce cookies per handoff with the __Host- prefix", () => {
    const a = handoffNonceCookieName(hashHandoffNonce("a"));
    const b = handoffNonceCookieName(hashHandoffNonce("b"));
    expect(a).not.toBe(b);
    expect(a.startsWith(HANDOFF_NONCE_COOKIE_PREFIX)).toBe(true);
    expect(HANDOFF_NONCE_COOKIE_PREFIX.startsWith("__Host-")).toBe(true);
  });
});

describe("signed handoff state", () => {
  const fields = { target: PRIMARY, next: "/dashboard", bind: "a".repeat(64) };

  it("verifies only state the server issued, unmodified and unexpired", () => {
    const now = 1_800_000_000_000;
    const { sig, ...state } = createHandoffState(fields, now);
    expect(verifyHandoffState(state, sig, now)).toBe(true);

    expect(verifyHandoffState({ ...state, next: "/equipment" }, sig, now)).toBe(false);
    expect(verifyHandoffState({ ...state, bind: "b".repeat(64) }, sig, now)).toBe(false);
    expect(verifyHandoffState({ ...state, target: FLEET }, sig, now)).toBe(false);
    expect(verifyHandoffState(state, "0".repeat(64), now)).toBe(false);
    expect(verifyHandoffState(state, null, now)).toBe(false);
    expect(verifyHandoffState(state, sig, now + 301_000)).toBe(false);
    // An attacker cannot extend the lifetime of a signature.
    expect(verifyHandoffState({ ...state, exp: state.exp + 10_000 }, sig, now)).toBe(false);
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

describe("GET /api/auth/handoff/begin", () => {
  const req = (
    source: string,
    next: string,
    origin = PRIMARY,
    headers: Record<string, string> = { ...NAV, referer: `${FLEET}/portal/fleet` },
  ) =>
    new NextRequest(
      `${origin}/api/auth/handoff/begin?source=${encodeURIComponent(source)}&next=${encodeURIComponent(next)}`,
      { headers },
    );

  it("sets a host-only nonce cookie and sends the browser to the source with signed state", async () => {
    const res = await begin(req(FLEET, "/dashboard"));
    const loc = new URL(res.headers.get("location")!);
    const bind = loc.searchParams.get("bind")!;
    const cookie = res.cookies.get(handoffNonceCookieName(bind));
    expect(res.status).toBe(303);
    expect(loc.origin).toBe(FLEET);
    expect(loc.pathname).toBe("/api/auth/handoff/start");
    expect(loc.searchParams.get("target")).toBe(PRIMARY);
    expect(loc.searchParams.get("next")).toBe("/dashboard");
    expect(cookie?.value).toBeTruthy();
    expect(loc.searchParams.get("bind")).toBe(hashHandoffNonce(cookie!.value));
    expect(
      verifyHandoffState(
        {
          target: PRIMARY,
          next: "/dashboard",
          bind: loc.searchParams.get("bind")!,
          exp: Number(loc.searchParams.get("exp")),
        },
        loc.searchParams.get("sig"),
      ),
    ).toBe(true);
    const setCookie = res.headers.get("set-cookie")!.toLowerCase();
    expect(setCookie).toContain("httponly");
    expect(setCookie).toContain("secure");
    expect(setCookie).toContain("path=/");
    expect(setCookie).not.toContain("domain=");
    expect(cookie!.name.startsWith("__Host-")).toBe(true);
  });

  it("rejects unknown sources, same-host sources, unsafe paths and unknown hosts", async () => {
    for (const r of [
      req("https://evil.io", "/dashboard"),
      req(PRIMARY, "/dashboard"),
      req(FLEET, "//evil.io"),
      req(FLEET, "/dashboard", "https://evil.io"),
    ]) {
      const res = await begin(r);
      expect(res.status).toBe(400);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("refuses embeds and sends the user to sign-in without setting a nonce", async () => {
    const res = await begin(
      req(FLEET, "/dashboard", PRIMARY, { ...NAV, "sec-fetch-dest": "image" }),
    );
    expect(res.headers.get("location")).toBe(handoffFailureUrl(PRIMARY));
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("refuses to start a handoff from a same-site sibling such as shopreel", async () => {
    // A script on shopreel assigns top.location to begin: Fetch Metadata says
    // same-site + navigate + document, but the referrer is not the Fleet origin.
    for (const referer of [
      "https://shopreel.profixiq.com/embed",
      undefined,
      `${PRIMARY}/dashboard`,
    ]) {
      const headers: Record<string, string> = { ...NAV };
      if (referer) headers.referer = referer;
      const res = await begin(req(FLEET, "/dashboard", PRIMARY, headers));
      expect(res.headers.get("location")).toBe(handoffFailureUrl(PRIMARY));
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  it("gives concurrent handoffs separate nonce cookies", async () => {
    const a = await begin(req(FLEET, "/dashboard"));
    const b = await begin(req(FLEET, "/equipment"));
    const nameOf = (r: Response) =>
      r.headers.get("set-cookie")!.split("=")[0]!;
    expect(nameOf(a)).not.toBe(nameOf(b));
  });
});

describe("GET /api/auth/handoff/start", () => {
  const BIND = "a".repeat(64);
  const signed = (over: Partial<{ target: string; next: string; bind: string }> = {}) => {
    const state = createHandoffState({
      target: PRIMARY,
      next: "/dashboard",
      bind: BIND,
      ...over,
    });
    return state;
  };
  const urlFor = (
    state: ReturnType<typeof signed>,
    tweak: (p: URLSearchParams) => void = () => {},
    headers: Record<string, string> = NAV,
  ) => {
    const u = new URL(`${FLEET}/api/auth/handoff/start`);
    u.searchParams.set("target", state.target);
    u.searchParams.set("next", state.next);
    u.searchParams.set("bind", state.bind);
    u.searchParams.set("exp", String(state.exp));
    u.searchParams.set("sig", state.sig);
    tweak(u.searchParams);
    return new NextRequest(u, { headers });
  };

  it("rejects forged, tampered or unsigned requests without minting", async () => {
    for (const r of [
      urlFor(signed(), (p) => p.delete("sig")),
      urlFor(signed(), (p) => p.set("sig", "0".repeat(64))),
      urlFor(signed(), (p) => p.set("bind", "b".repeat(64))),
      urlFor(signed(), (p) => p.set("next", "/equipment")),
      urlFor(signed(), (p) => p.set("target", "https://evil.io")),
      urlFor(signed(), (p) => p.set("next", "//evil.io")),
      urlFor(signed(), (p) => p.set("exp", "1")),
      urlFor(signed(), (p) => p.delete("bind")),
    ]) {
      expect((await start(r)).status).toBe(400);
    }
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it("does not mint for embeds from a same-site sibling, even with valid state", async () => {
    mocks.user = { email: "a@b.co" };
    const res = await start(
      urlFor(signed(), () => {}, { ...NAV, "sec-fetch-dest": "image", "sec-fetch-mode": "no-cors" }),
    );
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(handoffFailureUrl(PRIMARY));
  });

  it("redirects to the target redeem route with a one-time token", async () => {
    mocks.user = { email: "a@b.co" };
    mocks.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "tok_1234567890" } },
      error: null,
    });
    const res = await start(urlFor(signed()));
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

  it("sends every failure to the target sign-in, never to next", async () => {
    // Signed out
    let res = await start(urlFor(signed()));
    expect(res.headers.get("location")).toBe(handoffFailureUrl(PRIMARY));

    // Mint error
    mocks.user = { email: "a@b.co" };
    mocks.generateLink.mockResolvedValue({ data: null, error: new Error("x") });
    res = await start(urlFor(signed()));
    expect(res.headers.get("location")).toBe(handoffFailureUrl(PRIMARY));

    // Mint throws
    mocks.generateLink.mockRejectedValue(new Error("boom"));
    res = await start(urlFor(signed()));
    expect(res.headers.get("location")).toBe(handoffFailureUrl(PRIMARY));
  });
});

describe("GET /api/auth/handoff/redeem", () => {
  const NONCE = "victim-nonce";
  const BIND = hashHandoffNonce(NONCE);
  const FAIL = handoffFailureUrl(PRIMARY);
  const COOKIE = handoffNonceCookieName(BIND);
  const req = (
    query: string,
    opts: { headers?: Record<string, string>; nonce?: string } = {
      headers: NAV,
      nonce: NONCE,
    },
  ) =>
    new NextRequest(`${PRIMARY}/api/auth/handoff/redeem?${query}`, {
      headers: {
        ...(opts.headers ?? {}),
        ...(opts.nonce ? { cookie: `${COOKIE}=${opts.nonce}` } : {}),
      },
    });
  const good = `token_hash=tok_1234567890&next=/dashboard&bind=${BIND}`;
  const ok = { data: { session: { access_token: "x" } }, error: null };

  it("exchanges the token for a session when the nonce matches, and clears the nonce", async () => {
    mocks.verifyOtp.mockResolvedValue(ok);
    const res = await redeem(req(good));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "tok_1234567890",
    });
    expect(res.headers.get("location")).toBe(`${PRIMARY}/dashboard`);
    expect(res.cookies.get(COOKIE)?.value).toBe("");
  });

  it("does not log a victim in with an attacker-minted token (login CSRF)", async () => {
    // Attacker begins on their own browser, so the link carries bind=H(attackerNonce).
    const link = `token_hash=tok_1234567890&next=/dashboard&bind=${hashHandoffNonce("attacker-nonce")}`;
    for (const r of [
      req(link, { headers: NAV }),
      req(link, { headers: NAV, nonce: NONCE }),
    ]) {
      const res = await redeem(r);
      expect(res.headers.get("location")).toBe(FAIL);
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("sends untrusted or malformed requests to sign-in without redeeming", async () => {
    for (const r of [
      req(good, { headers: { ...NAV, "sec-fetch-site": "cross-site" }, nonce: NONCE }),
      req(good, { headers: {}, nonce: NONCE }),
      req(good, { headers: { ...NAV, "sec-fetch-dest": "iframe" }, nonce: NONCE }),
      req(`token_hash=bad&next=/dashboard&bind=${BIND}`),
      req("token_hash=tok_1234567890&next=/dashboard"),
      req(`token_hash=tok_1234567890&next=/dashboard&bind=zz`),
      req(`token_hash=tok_1234567890&next=//evil.io&bind=${BIND}`),
    ]) {
      const res = await redeem(r);
      expect(res.headers.get("location")).toBe(FAIL);
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("clears only its own handoff's nonce, never another tab's", async () => {
    const otherBind = hashHandoffNonce("other-tab-nonce");
    const link = `token_hash=tok_1234567890&next=/dashboard&bind=${otherBind}`;
    // A stale/mismatched attempt for one handoff...
    const res = await redeem(req(link, { headers: NAV, nonce: NONCE }));
    const cleared = res.headers.getSetCookie().map((c) => c.split("=")[0]);
    // ...touches only that handoff's cookie name, not this tab's.
    expect(cleared).toEqual([handoffNonceCookieName(otherBind)]);
    expect(cleared).not.toContain(COOKIE);
  });

  it("never opens next when the exchange fails, even if the host holds another session", async () => {
    // Supabase reports expired/invalid OTPs via a resolved { error }, not a throw.
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });
    expect((await redeem(req(good))).headers.get("location")).toBe(FAIL);

    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    expect((await redeem(req(good))).headers.get("location")).toBe(FAIL);

    mocks.verifyOtp.mockRejectedValue(new Error("boom"));
    expect((await redeem(req(good))).headers.get("location")).toBe(FAIL);
  });
});

describe("GET /api/auth/handoff/failed", () => {
  it("is a neutral page that needs a click, not a redirect into a session", async () => {
    const res = await failedPage();
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain("Could not switch products");
  });
});

describe("switcher renders handoff links as plain anchors", () => {
  it("does not use a prefetched router Link for handoff hrefs", () => {
    const src = readFileSync(
      join(process.cwd(), "features/shared/components/WorkspaceProductSwitcher.tsx"),
      "utf8",
    );
    expect(src).toContain("isHandoffHref(href)");
    expect(src).toMatch(/<a\s+key=\{product\.surface\}\s+href=\{href\}\s+referrerPolicy="origin"/);
  });
});
