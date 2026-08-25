// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MobileActiveJobContract } from "@/features/dispatch/lib/contracts";
import {
  readFieldActiveSnapshot,
  writeFieldActiveSnapshot,
} from "@/features/mobile/service/fieldActiveSnapshot";
import MobileServiceShell from "@/features/mobile/service/MobileServiceShell";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

const currentScope = { userId: "user-b", shopId: "shop-b" };

vi.mock("next/navigation", () => ({
  useRouter: () => mocks,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/shared/lib/offline/mutations", () => ({
  getOfflineMutationScope: vi.fn(() => currentScope),
  hydrateOfflineMutationQueue: vi.fn(async () => undefined),
  listPendingMutations: vi.fn(() => []),
  runMutationWithOfflineQueue: vi.fn(),
}));

vi.mock("@/features/shared/lib/offline/replay", () => ({
  replayAndReconcileOfflineMutations: vi.fn(async () => undefined),
}));

function response(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function activeSnapshot(
  customerName: string,
  shopId: string,
): MobileActiveJobContract {
  const now = "2026-08-25T12:00:00.000Z";
  return {
    serverNow: now,
    activeJob: {
      id: "visit-a",
      shopId,
      mode: "mobile",
      status: "working",
      version: 1,
      createdAt: now,
      updatedAt: now,
      assignmentState: "assigned",
      customer: { id: "customer-a", name: customerName, phone: "555-0100" },
      vehicle: { id: "vehicle-a", label: `${customerName} vehicle` },
      serviceAddress: {
        id: "address-a",
        addressLine1: `${customerName} address`,
      },
      allowedTransitions: ["paused", "completed"],
    },
    nextJob: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: false,
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        response({ error: "Service calls unavailable." }, 503),
      ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Mobile Service active-call cache scope", () => {
  it("revalidates the mounted actor after queue hydration before scope persistence", () => {
    const shell = readFileSync(
      "features/mobile/service/MobileServiceShell.tsx",
      "utf8",
    );
    const mutations = readFileSync(
      "features/shared/lib/offline/mutations.ts",
      "utf8",
    );

    expect(shell).toContain("validateScope: (scope: OfflineMutationScope)");
    expect(shell).toContain("persistedScope?.userId === boundScope.userId");
    expect(shell).toContain("validateScope,");
    expect(mutations).toContain("args.validateScope(suppliedScope)");
    expect(mutations.indexOf("args.validateScope(suppliedScope)")).toBeLessThan(
      mutations.indexOf(
        "resolveOfflineMutationScope(args.payload, args.scope)",
      ),
    );
  });
  it("does not render another authenticated user or shop's cached call after a load failure", async () => {
    writeFieldActiveSnapshot(
      { userId: "user-a", shopId: "shop-b" },
      activeSnapshot("Former User Customer", "shop-b"),
    );

    render(<MobileServiceShell embedded scope={currentScope} />);

    await waitFor(() => {
      expect(
        screen.getByText("Service calls unavailable."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Former User Customer"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Former User Customer address"),
      ).not.toBeInTheDocument();
    });
  });

  it("still restores the current user and shop's offline call", async () => {
    writeFieldActiveSnapshot(
      currentScope,
      activeSnapshot("Current Field Customer", "shop-b"),
    );

    render(<MobileServiceShell embedded scope={currentScope} />);

    expect(
      await screen.findByText("Current Field Customer"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Current Field Customer address"),
    ).toBeInTheDocument();
    expect(screen.getByText("Offline.")).toBeInTheDocument();
  });

  it("does not restore the same user's cache from a different shop", async () => {
    writeFieldActiveSnapshot(
      { userId: "user-b", shopId: "shop-a" },
      activeSnapshot("Former Shop Customer", "shop-a"),
    );

    render(<MobileServiceShell embedded scope={currentScope} />);

    await waitFor(() => {
      expect(
        screen.getByText("Service calls unavailable."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Former Shop Customer"),
      ).not.toBeInTheDocument();
    });
  });

  it("ignores an aborted prior-scope response after the authenticated actor changes", async () => {
    let resolveFormerResponse!: (value: Response) => void;
    const formerResponse = new Promise<Response>((resolve) => {
      resolveFormerResponse = resolve;
    });
    const request = vi
      .fn()
      .mockReturnValueOnce(formerResponse)
      .mockResolvedValueOnce(
        response(activeSnapshot("Current Field Customer", "shop-b"), 200),
      );
    vi.stubGlobal("fetch", request);
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const formerScope = { userId: "user-a", shopId: "shop-b" };
    const { rerender } = render(
      <MobileServiceShell embedded scope={formerScope} />,
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    rerender(<MobileServiceShell embedded scope={currentScope} />);
    expect(
      await screen.findByText("Current Field Customer"),
    ).toBeInTheDocument();

    await act(async () => {
      resolveFormerResponse(
        response(activeSnapshot("Former User Customer", "shop-b"), 200),
      );
      await formerResponse;
    });

    expect(screen.queryByText("Former User Customer")).not.toBeInTheDocument();
    expect(screen.getByText("Current Field Customer")).toBeInTheDocument();
    expect(
      readFieldActiveSnapshot(currentScope)?.activeJob?.customer?.name,
    ).toBe("Current Field Customer");
    expect(readFieldActiveSnapshot(formerScope)).toBeNull();
  });
});
