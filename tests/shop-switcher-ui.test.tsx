import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShopSwitcher from "@/features/shops/components/ShopSwitcher";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ShopSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the current shop name without switch controls for non-switchable users", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        currentShop: { id: "shop-demo", name: "Prairie Fleet & Diesel Demo", current: true, membershipRole: null },
        shops: [{ id: "shop-demo", name: "Prairie Fleet & Diesel Demo", current: true, membershipRole: null }],
        canSwitch: false,
      }),
    ) as typeof fetch;

    render(<ShopSwitcher />);

    expect(await screen.findByText("Prairie Fleet & Diesel Demo")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /switch active shop/i })).not.toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("switches authorized shops and refreshes app context", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/shops/available")) {
        return jsonResponse({
          currentShop: { id: "shop-demo", name: "Prairie Fleet & Diesel Demo", current: true, membershipRole: "owner" },
          shops: [
            { id: "shop-demo", name: "Prairie Fleet & Diesel Demo", current: true, membershipRole: "owner" },
            { id: "shop-pro", name: "PRO FIX", current: false, membershipRole: "admin" },
          ],
          canSwitch: true,
        });
      }

      return jsonResponse({
        currentShop: { id: "shop-pro", name: "PRO FIX", current: true, membershipRole: "admin" },
        shops: [
          { id: "shop-demo", name: "Prairie Fleet & Diesel Demo", current: false, membershipRole: "owner" },
          { id: "shop-pro", name: "PRO FIX", current: true, membershipRole: "admin" },
        ],
        canSwitch: true,
      });
    });
    global.fetch = fetchMock as typeof fetch;

    render(<ShopSwitcher />);

    const select = await screen.findByRole("combobox", { name: /switch active shop/i });
    await userEvent.selectOptions(select, "shop-pro");
    await userEvent.click(screen.getByRole("button", { name: "Switch" }));

    await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shops/switch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ shop_id: "shop-pro" }),
      }),
    );
    expect(await screen.findByText("PRO FIX")).toBeInTheDocument();
  });
});
