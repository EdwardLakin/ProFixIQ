import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OwnerPinModal from "./OwnerPinModal";

describe("OwnerPinModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets an authorized signed-in owner reset a forgotten PIN", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const onVerified = vi.fn();
    const onClose = vi.fn();

    render(
      <OwnerPinModal
        shopId="shop-1"
        open
        onClose={onClose}
        onVerified={onVerified}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Forgot your PIN? Reset it" }),
    );
    expect(
      screen.getByRole("heading", { name: "Reset Owner PIN" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /signed-in owner or admin account must be authorized for this shop/i,
      ),
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Enter PIN"), {
      target: { value: "1234" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm PIN"), {
      target: { value: "1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset PIN" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/shop/owner-pin/reset");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      shopId: "shop-1",
      pin: "1234",
    });
    expect(onVerified).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
