import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isSafePrivateNavigationShell,
  PRIVATE_NAVIGATION_REUSABLE_HEADER,
} from "@/features/shared/lib/pwa/privateNavigationCache";

const read = (path: string) => readFileSync(path, "utf8");

function html(body: string, headers: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      [PRIVATE_NAVIGATION_REUSABLE_HEADER]: "reusable",
      ...headers,
    },
  });
}

describe("private navigation cache isolation", () => {
  it("accepts only reusable session-free HTML", async () => {
    await expect(
      isSafePrivateNavigationShell(
        html("<html><body>Offline shell</body></html>"),
      ),
    ).resolves.toBe(true);
    await expect(
      isSafePrivateNavigationShell(
        new Response("<html><body>Unmarked shell</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    ).resolves.toBe(false);
    await expect(
      isSafePrivateNavigationShell(
        html("<html></html>", { "Cache-Control": "private, no-store" }),
      ),
    ).resolves.toBe(false);
    await expect(
      isSafePrivateNavigationShell(
        html("<html></html>", { Vary: "Accept-Encoding, Cookie" }),
      ),
    ).resolves.toBe(false);
    await expect(
      isSafePrivateNavigationShell(
        html(
          '<script>{"access_token":"redacted","refresh_token":"redacted"}</script>',
        ),
      ),
    ).resolves.toBe(false);
    await expect(
      isSafePrivateNavigationShell(
        html('<script>"sb-project-auth-token"</script>'),
      ),
    ).resolves.toBe(false);
    await expect(
      isSafePrivateNavigationShell(
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ).resolves.toBe(false);
  });

  it("applies the privacy gate to service-worker reads, writes, and every warmer", () => {
    const worker = read("app/sw.ts");
    const runtime = read("features/shared/components/pwa/PwaRuntime.tsx");
    expect(worker).toContain("cacheWillUpdate");
    expect(worker).toContain("cachedResponseWillBeUsed");
    expect(worker).toContain("privateNavigationCachePlugin");
    expect(worker).toContain("PRIVATE_NAVIGATION_CACHE_CLEAR_MESSAGE");
    expect(worker).toContain("includeCurrent: false");
    expect(runtime).toContain(
      "clearPrivateNavigationCaches({ includeCurrent: false })",
    );

    for (const path of [
      "features/work-orders/mobile/technicianOfflineDownload.ts",
      "features/work-orders/mobile/advisorOffline.ts",
      "features/chat/offline/messageDrafts.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("isSafePrivateNavigationShell");
      expect(
        source.indexOf("isSafePrivateNavigationShell(response)"),
      ).toBeLessThan(source.indexOf("cache.put(url, response.clone())"));
    }
  });

  it("requires a session-matched scope before sensitive offline views read", () => {
    for (const path of [
      "features/mobile/work-orders/MobileWorkOrderQueue.tsx",
      "features/mobile/technician/MobileTechnicianQueue.tsx",
      "features/work-orders/mobile/MobileFocusedJob.tsx",
      "app/mobile/appointments/page.tsx",
      "app/mobile/offline/page.tsx",
      "app/offline/page.tsx",
      "app/offline/sync/page.tsx",
      "features/mobile/components/MobileShiftTracker.tsx",
      "features/mobile/service/FieldInvoicesHistory.tsx",
      "features/mobile/service/useTruckInventorySnapshot.ts",
      "features/chat/offline/messageDrafts.ts",
    ]) {
      expect(read(path)).toContain("getSessionMatchedOfflineScope");
    }
  });
});
