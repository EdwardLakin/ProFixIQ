import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PendingConfirmationsList from "@/features/shop-assistant/components/PendingConfirmationsList";
import RecentAssistantActivityList from "@/features/shop-assistant/components/RecentAssistantActivityList";

afterEach(() => cleanup());

describe("PendingConfirmationsList", () => {
  it("shows an empty state when nothing is pending", () => {
    render(<PendingConfirmationsList items={[]} />);
    expect(
      screen.getByText("Nothing is waiting on your confirmation right now."),
    ).toBeVisible();
  });

  it("links each pending confirmation back to its authoritative thread context", () => {
    render(
      <PendingConfirmationsList
        items={[
          {
            id: "action-1",
            title: "Create part request",
            summary: "Order a front brake pad set for WO #A100.",
            consequences: ["Creates a pending part request"],
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            href: "/assistant?workOrderId=wo-1&pageType=work_order",
          },
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: /Create part request/ });
    expect(link).toHaveAttribute(
      "href",
      "/assistant?workOrderId=wo-1&pageType=work_order",
    );
    expect(
      screen.getByText("Order a front brake pad set for WO #A100."),
    ).toBeVisible();
  });
});

describe("RecentAssistantActivityList", () => {
  it("shows an empty state when there is no recent activity", () => {
    render(<RecentAssistantActivityList items={[]} />);
    expect(screen.getByText("No recent conversations yet.")).toBeVisible();
  });

  it("links each recent conversation back to its record context", () => {
    render(
      <RecentAssistantActivityList
        items={[
          {
            id: "thread-1",
            title: "Customer follow-up",
            lastMessageAt: new Date().toISOString(),
            href: "/assistant?customerId=cust-1&pageType=customer",
          },
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: /Customer follow-up/ });
    expect(link).toHaveAttribute(
      "href",
      "/assistant?customerId=cust-1&pageType=customer",
    );
  });
});
