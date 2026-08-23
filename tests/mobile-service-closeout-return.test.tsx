import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/invoices/components/RecordManualPayment", () => ({
  default: () => null,
}));

import MobileServiceCloseout from "@/features/mobile/service/MobileServiceCloseout";

function closeoutResponse() {
  return new Response(
    JSON.stringify({
      workOrder: {
        id: "work-order-1",
        custom_id: "WO-000014",
        status: "ready_to_invoice",
        payment_status: "unpaid",
        outstanding_balance: 0,
      },
      invoiceVersion: null,
      receipt: null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("mobile service closeout return navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = "";
    mocks.fetch.mockResolvedValue(closeoutResponse());
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("returns field-closeout rows to the filtered work-order queue", async () => {
    mocks.search =
      "returnTo=%2Fmobile%2Fwork-orders%3Fstatus%3Dready_to_invoice%26mode%3Dfield_closeout";
    render(<MobileServiceCloseout workOrderId="work-order-1" />);

    expect(
      await screen.findByRole("link", { name: "Back to work orders" }),
    ).toHaveAttribute(
      "href",
      "/mobile/work-orders?status=ready_to_invoice&mode=field_closeout",
    );
  });

  it("rejects unrelated return targets", async () => {
    mocks.search = "returnTo=https%3A%2F%2Fattacker.example%2Fmobile%2Fwork-orders";
    render(<MobileServiceCloseout workOrderId="work-order-1" />);

    expect(
      await screen.findByRole("link", { name: "Back to field service" }),
    ).toHaveAttribute("href", "/mobile/service");
  });
});
