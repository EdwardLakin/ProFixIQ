// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hostnameMatchesAuthCookieDomain,
  migrateHostOnlyAuthCookies,
  readAuthCookieDomain,
  withAuthCookieDomain,
} from "@/features/shared/lib/supabase/auth-cookie-domain";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  document.cookie.split("; ").forEach((c) => {
    const name = c.split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  });
});

describe("shared auth cookie domain", () => {
  it("is off unless configured, leaving cookies host-only", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_COOKIE_DOMAIN", "");
    expect(readAuthCookieDomain()).toBeUndefined();
    expect(withAuthCookieDomain({ path: "/" })).toEqual({ path: "/" });
    expect(withAuthCookieDomain(undefined)).toBeUndefined();
  });

  it("normalizes a valid domain and rejects malformed values", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_COOKIE_DOMAIN", "profixiq.com");
    expect(readAuthCookieDomain()).toBe(".profixiq.com");
    expect(withAuthCookieDomain({ path: "/" })).toEqual({
      path: "/",
      domain: ".profixiq.com",
    });
    for (const bad of ["localhost", "evil.com; Path=/x", "http://a.com", ".."]) {
      vi.stubEnv("NEXT_PUBLIC_AUTH_COOKIE_DOMAIN", bad);
      expect(readAuthCookieDomain()).toBeUndefined();
    }
  });

  it("matches only the domain and its subdomains", () => {
    const d = ".profixiq.com";
    expect(hostnameMatchesAuthCookieDomain("profixiq.com", d)).toBe(true);
    expect(hostnameMatchesAuthCookieDomain("fleet.profixiq.com", d)).toBe(true);
    expect(hostnameMatchesAuthCookieDomain("notprofixiq.com", d)).toBe(false);
    expect(hostnameMatchesAuthCookieDomain("profixiq.com.evil.io", d)).toBe(false);
    expect(hostnameMatchesAuthCookieDomain("fleet.localhost", undefined)).toBe(false);
  });

  it("does not touch cookies when the domain is unset or does not cover the host", () => {
    document.cookie = "sb-abc-auth-token=keep; Path=/";
    vi.stubEnv("NEXT_PUBLIC_AUTH_COOKIE_DOMAIN", "");
    migrateHostOnlyAuthCookies();
    expect(document.cookie).toContain("sb-abc-auth-token=keep");

    vi.stubEnv("NEXT_PUBLIC_AUTH_COOKIE_DOMAIN", "profixiq.com"); // jsdom host is localhost
    migrateHostOnlyAuthCookies();
    expect(document.cookie).toContain("sb-abc-auth-token=keep");
  });

  it("applies the domain in the browser, server, pages-API and middleware clients", () => {
    expect(source("features/shared/lib/supabase/client.ts")).toContain("cookieOptions: { domain }");
    const server = source("features/shared/lib/supabase/server.ts");
    expect(server).toContain("cookieStore.set(name, value, withAuthCookieDomain(options))");
    expect(server).toContain("Domain=${domain}");
    expect(source("middleware.ts")).toContain("withAuthCookieDomain(options)");
  });
});
