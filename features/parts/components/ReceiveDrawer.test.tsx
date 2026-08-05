import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReceiveDrawer from "./ReceiveDrawer";

const itemId = "226ac5f1-c762-4beb-a1a1-ed80dbcd3a7f";
const locationId = "04c9f1c8-e8a2-4dd5-90f4-fadfe5ea9241";
const poId = "b16a3a32-341e-407c-a254-1be0903e3adc";

function failedResponse(): Response {
  return {
    ok: false,
    status: 503,
    text: vi.fn().mockResolvedValue("Temporary failure"),
  } as unknown as Response;
}

describe("ReceiveDrawer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failedResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the receive contract idempotency key and reuses it for an identical retry", async () => {
    const user = userEvent.setup();

    render(
      <ReceiveDrawer
        open
        item={{
          id: itemId,
          part_name: "5W30 oil",
          qty_approved: 6,
          qty_received: 0,
          qty_remaining: 6,
        }}
        locations={[{ value: locationId, label: "MAIN" }]}
        defaultLocationId={locationId}
        purchaseOrders={[{ value: poId, label: "QA purchase order" }]}
        defaultPoId={poId}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Receive remaining" }));
    await user.click(screen.getByRole("button", { name: "Receive" }));
    await screen.findByText("Temporary failure");
    await user.click(screen.getByRole("button", { name: "Receive" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const firstRequest = vi.mocked(fetch).mock.calls[0]?.[1];
    const secondRequest = vi.mocked(fetch).mock.calls[1]?.[1];
    const firstBody = JSON.parse(String(firstRequest?.body)) as Record<string, unknown>;
    const secondBody = JSON.parse(String(secondRequest?.body)) as Record<string, unknown>;
    const firstHeaders = firstRequest?.headers as Record<string, string>;
    const secondHeaders = secondRequest?.headers as Record<string, string>;

    expect(firstBody).toMatchObject({
      location_id: locationId,
      qty: 6,
      po_id: poId,
    });
    expect(firstBody.idempotencyKey).toEqual(expect.any(String));
    expect(firstBody.idempotencyKey).not.toBe("");
    expect(firstHeaders["Idempotency-Key"]).toBe(firstBody.idempotencyKey);
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);
    expect(secondHeaders["Idempotency-Key"]).toBe(firstHeaders["Idempotency-Key"]);
  });
});
