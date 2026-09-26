import React from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/work-orders/WO-000018",
  useRouter: () => ({ push }),
}));

import { TabsProvider, useTabs } from "@/features/shared/components/tabs/TabsProvider";

const WORK_ORDER_ID = "1f106d72-f596-4a31-9e71-b1e2a3b8ded2";
const CUSTOM_ID_KEY = "work-order:WO-000018";
const CANONICAL_KEY = `work-order:${WORK_ORDER_ID}`;

function wrapper({ children }: { children: React.ReactNode }) {
  return <TabsProvider>{children}</TabsProvider>;
}

describe("TabsProvider.canonicalizeActiveTab", () => {
  it("purges a stale alias-keyed duplicate even when the active tab is already canonical", () => {
    const { result } = renderHook(() => useTabs(), { wrapper });

    // Simulate the two ways this repo lets a technician reach the same
    // work order: once through its friendly custom_id (e.g. a link built
    // from ActiveJobWidget), once through its real database id (e.g. the
    // Resume list's mobileHref). Each produces its own open-work key.
    act(() => {
      result.current.openTab(`/work-orders/WO-000018`);
    });
    act(() => {
      result.current.openTab(`/work-orders/${WORK_ORDER_ID}`);
    });

    const workOrderKeys = () =>
      result.current.tabs
        .filter((item) => item.kind === "work-order")
        .map((item) => item.key);
    expect(workOrderKeys().sort()).toEqual(
      [CUSTOM_ID_KEY, CANONICAL_KEY].sort(),
    );

    // The technician is now looking at the database-id tab, which is
    // already canonical — the regression was that this made the gateway
    // treat there as "nothing to do" and leave the custom_id-keyed
    // duplicate sitting in Resume/Open-work forever.
    act(() => {
      result.current.activateTab(CANONICAL_KEY);
    });
    expect(result.current.activeKey).toBe(CANONICAL_KEY);

    act(() => {
      result.current.canonicalizeActiveTab(CANONICAL_KEY, [CUSTOM_ID_KEY]);
    });

    expect(workOrderKeys()).toEqual([CANONICAL_KEY]);
    expect(result.current.activeKey).toBe(CANONICAL_KEY);
  });
});
