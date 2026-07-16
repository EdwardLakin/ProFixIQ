import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveInstalledLaunchPath } from "@/features/shared/lib/pwa/launch";

const read = (path: string) => readFileSync(path, "utf8");

describe("PWA install and sync center", () => {
  it("launches installed sessions into the correct role and viewport experience", () => {
    expect(resolveInstalledLaunchPath("customer", false)).toBe("/portal");
    expect(resolveInstalledLaunchPath("fleet_manager", false)).toBe("/fleet");
    expect(resolveInstalledLaunchPath("technician", true)).toBe("/mobile");
    expect(resolveInstalledLaunchPath("service_advisor", false)).toBe(
      "/dashboard",
    );
  });

  it("precaches the offline fallback and sync center", () => {
    const source = read("next.config.ts");
    expect(source).toContain('{ url: "/offline", revision: null }');
    expect(source).toContain('{ url: "/offline/sync", revision: null }');
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
