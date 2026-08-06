import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import PortalLayout from "../app/portal/layout";

const headerFixture = vi.hoisted(() => ({
  values: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerFixture.values.get(name) ?? null,
  }),
}));

vi.mock("@/features/portal/components/PortalShell", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="customer-portal-shell">{children}</div>
  ),
}));

beforeEach(() => {
  headerFixture.values.clear();
});

describe("Portal shell product boundary", () => {
  it("does not wrap Fleet rewrites in the customer portal shell", async () => {
    headerFixture.values.set("x-profixiq-product-host", "fleet");
    const children = <main>Fleet sign in</main>;

    await expect(PortalLayout({ children })).resolves.toBe(children);
  });

  it("does not wrap direct Fleet host requests in the customer portal shell", async () => {
    headerFixture.values.set("host", "fleet.profixiq.com");
    const children = <main>Fleet workspace</main>;

    await expect(PortalLayout({ children })).resolves.toBe(children);
  });

  it("preserves the customer portal shell on the Shop host", async () => {
    headerFixture.values.set("host", "profixiq.com");
    const children = <main>Customer portal</main>;

    const result = await PortalLayout({ children });

    expect(result).not.toBe(children);
    expect(result).toMatchObject({ props: { children } });
  });
});
