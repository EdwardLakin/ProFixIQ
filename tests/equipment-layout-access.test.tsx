import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: null as null | Record<string, unknown>,
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  usePathname: () => "/equipment/dashboard",
}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireActiveDemoAccessForPage: async () => mocks.profile,
}));
vi.mock("@/features/equipment/components/EquipmentShell", () => ({
  default: ({ items }: { items: Array<{ key: string }> }) => (
    <div data-testid="shell">{items.map((item) => item.key).join(",")}</div>
  ),
}));

import EquipmentLayout from "../app/equipment/layout";

describe("Equipment layout access", () => {
  it("sends an account that must change its password to set-password", async () => {
    mocks.profile = { id: "p1", role: "owner", must_change_password: true };
    await expect(EquipmentLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/auth/set-password",
    );
  });

  it("renders the shell for a normal account", async () => {
    mocks.profile = { id: "p1", role: "owner", must_change_password: false };
    const element = await EquipmentLayout({ children: null });
    expect(element).toBeTruthy();
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
  });

  it("sends each role's brand link to a page that role can open", async () => {
    mocks.profile = { id: "p1", role: "owner", must_change_password: false };
    const owner = (await EquipmentLayout({ children: null })) as {
      props: { homeHref: string };
    };
    expect(owner.props.homeHref).toBe("/equipment/dashboard");

    mocks.profile = { id: "p2", role: "mechanic", must_change_password: false };
    const mechanic = (await EquipmentLayout({ children: null })) as {
      props: { homeHref: string; items: Array<{ key: string }> };
    };
    expect(mechanic.props.homeHref).toBe("/equipment/field");
    expect(mechanic.props.items.map((item) => item.key)).toEqual(["field"]);
  });
});
