import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveInstalledLaunchPath } from "@/features/shared/lib/pwa/launch";

const read = (path: string) => readFileSync(path, "utf8");

describe("PWA install and sync center", () => {
  it("launches installed sessions into the correct role and viewport experience", () => {
    expect(resolveInstalledLaunchPath("customer", false)).toBe("/portal");
    expect(resolveInstalledLaunchPath("fleet_manager", false)).toBe("/fleet");
    expect(resolveInstalledLaunchPath("fleet_manager", true)).toBe(
      "/mobile/fleet",
    );
    expect(resolveInstalledLaunchPath("dispatcher", true)).toBe(
      "/mobile/fleet",
    );
    expect(resolveInstalledLaunchPath("driver", true)).toBe(
      "/mobile/fleet/pretrip",
    );
    expect(resolveInstalledLaunchPath("technician", true)).toBe("/mobile");
    expect(resolveInstalledLaunchPath("service_advisor", false)).toBe(
      "/dashboard",
    );
  });

  it("keeps compact launch recovery inside mobile routes", () => {
    const source = read("app/launch/page.tsx");
    expect(source).toContain('compactViewport ? "/mobile/offline" : "/offline"');
    expect(source).toContain('"/mobile/sign-in?redirect=%2Flaunch"');
  });

  it("precaches desktop and mobile offline route shells", () => {
    const source = read("next.config.ts");
    expect(source).toContain('{ url: "/offline", revision: null }');
    expect(source).toContain('{ url: "/offline/sync", revision: null }');
    expect(source).toContain('{ url: "/mobile", revision: null }');
    expect(source).toContain('{ url: "/mobile/offline", revision: null }');
  });

  it("waits for service worker control before reloading an update", () => {
    const source = read("features/shared/components/pwa/PwaRuntime.tsx");
    expect(source).toContain('"controllerchange"');
    expect(source).toContain('postMessage({ type: "SKIP_WAITING" })');
    expect(source).toContain("Add to Home Screen");
  });

  it("exposes tenant-scoped queue and storage controls", () => {
    const queueSource = read("features/shared/lib/offline/mutations.ts");
    const pageSource = read("app/offline/sync/page.tsx");
    expect(queueSource).toContain("scopeMatches(item, scope)");
    expect(queueSource).toContain("retryOfflineMutation");
    expect(queueSource).toContain("dismissOfflineMutation");
    expect(pageSource).toContain("navigator.storage?.estimate?.()");
    expect(pageSource).toContain("Protect offline storage");
  });
});
