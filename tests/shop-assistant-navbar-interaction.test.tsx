import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const assistant = vi.hoisted(() => ({
  send: vi.fn(),
  retry: vi.fn(),
  confirmAction: vi.fn(),
  cancelAction: vi.fn(),
  clearConversation: vi.fn(),
}));

let pathname = "/parts/inventory";
let search = "pageType=parts_inventory&pageTitle=Parts%20Inventory";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@/features/shop-assistant/hooks/useShopAssistant", () => ({
  useShopAssistant: () => ({
    thread: null,
    messages: [],
    loading: false,
    sending: false,
    actionInFlightId: null,
    error: null,
    canRetry: false,
    ...assistant,
  }),
}));

vi.mock("@/features/shared/components/PageShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock(
  "@/features/shop-assistant/components/ShopAssistantDashboard",
  () => ({
    default: () => <div data-testid="shop-assistant-dashboard" />,
  }),
);

import AssistantPage from "../app/assistant/page";
import AskAssistantEntry from "@/features/assistant/components/AskAssistantEntry";

describe("global shop assistant entry and prefilled prompts", () => {
  beforeEach(() => {
    pathname = "/parts/inventory";
    search = "pageType=parts_inventory&pageTitle=Parts%20Inventory";
    for (const mock of Object.values(assistant)) {
      mock.mockReset();
      mock.mockResolvedValue(undefined);
    }
  });

  afterEach(() => cleanup());

  it("opens the durable assistant directly from the navbar button", async () => {
    const user = userEvent.setup();
    render(<AskAssistantEntry placement="header" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Assistant" }));

    expect(
      screen.getByRole("dialog", { name: "AI Assistant" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Ask or act across the shop with the data and permissions/),
    ).toBeVisible();
  });

  it("submits a navbar request with trusted page context", async () => {
    const user = userEvent.setup();
    render(<AskAssistantEntry placement="header" />);

    await user.click(screen.getByRole("button", { name: "Assistant" }));
    await user.type(
      screen.getByPlaceholderText("Ask anything about your shop..."),
      "Show delayed parts",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(assistant.send).toHaveBeenCalledWith(
      "Show delayed parts",
      expect.objectContaining({
        pageType: "inventory",
        pageTitle: "Parts Inventory",
      }),
    );
  });

  it("closes the navbar overlay after client navigation", async () => {
    const user = userEvent.setup();
    const view = render(<AskAssistantEntry placement="header" />);

    await user.click(screen.getByRole("button", { name: "Assistant" }));
    expect(
      screen.getByRole("dialog", { name: "AI Assistant" }),
    ).toBeVisible();

    pathname = "/work-orders/quote-review";
    search = "";
    view.rerender(<AskAssistantEntry placement="header" />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("runs a prefilled question immediately instead of only filling the textarea", async () => {
    const user = userEvent.setup();
    render(<AssistantPage />);

    const prompt = "Which work orders are waiting on approvals right now?";
    await user.click(screen.getByRole("button", { name: prompt }));

    expect(assistant.send).toHaveBeenCalledTimes(1);
    expect(assistant.send).toHaveBeenCalledWith(
      prompt,
      expect.objectContaining({
        pageType: "parts_inventory",
        pageTitle: "Parts Inventory",
      }),
    );
    expect(
      screen.getByPlaceholderText(
        "Ask about shop operations or request an action…",
      ),
    ).toHaveValue("");
  });
});
