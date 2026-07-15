import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { isRetryableOfflineError } from "@/features/shared/lib/offline/mutations";

const source = readFileSync(
  "features/shared/lib/offline/mutations.ts",
  "utf8",
);

describe("Phase 6 offline mutation reliability", () => {
  it("stores authenticated user and shop scope on every mutation", () => {
    expect(source).toContain("userId: string");
    expect(source).toContain("shopId: string");
    expect(source).toContain("scopeMatches(item, scope)");
    expect(source).toContain("Offline mutation scope requires userId and shopId.");
  });

  it("quarantines legacy unscoped mutations instead of replaying them", () => {
    expect(source).toContain('status: missingScope && status !== "synced" ? "conflicted" : status');
    expect(source).toContain(
      "Legacy offline mutation has no authenticated user/shop scope",
    );
  });

  it("resolves scope from canonical work-order and line anchors", () => {
    expect(source).toContain('.from("work_order_lines")');
    expect(source).toContain('.from("work_orders")');
    expect(source).toContain('.from("profiles")');
    expect(source).toContain("setOfflineMutationScope(scope)");
  });

  it("does not classify permanent API responses as offline retry failures", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isRetryableOfflineError({ status: 400, message: "Invalid payload" })).toBe(false);
    expect(isRetryableOfflineError({ status: 401, message: "Unauthorized" })).toBe(false);
    expect(isRetryableOfflineError({ status: 403, message: "Forbidden" })).toBe(false);
    expect(isRetryableOfflineError({ status: 409, message: "Conflict" })).toBe(false);
    expect(
      isRetryableOfflineError({ message: "FINANCIALLY_LOCKED: invoice finalized" }),
    ).toBe(false);
    vi.unstubAllGlobals();
  });

  it("queues network and transient service failures for retry", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(isRetryableOfflineError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableOfflineError({ status: 503, message: "Unavailable" })).toBe(true);
    expect(isRetryableOfflineError({ status: 429, message: "Retry later" })).toBe(true);
    vi.unstubAllGlobals();
  });
});
