import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PartPicker,
  type PickedPart,
} from "@/features/parts/components/PartPicker";

const mocks = vi.hoisted(() => ({
  suggest: vi.fn(async () => undefined),
}));

const PART_A = "00000000-0000-4000-8000-000000000004";
const PART_B = "00000000-0000-4000-8000-000000000005";
const LOCATION_A = "00000000-0000-4000-8000-000000000003";
const LOCATION_B = "00000000-0000-4000-8000-000000000006";

type QueryResult = { data: unknown; error: null };

function queryBuilder(result: QueryResult) {
  const builder = {
    eq: vi.fn(),
    ilike: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.ilike.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.in.mockResolvedValue(result);
  builder.maybeSingle.mockResolvedValue(result);
  return builder;
}

vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
        error: null,
      })),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return queryBuilder({
          data: { shop_id: "00000000-0000-4000-8000-000000000002" },
          error: null,
        });
      }
      if (table === "stock_locations") {
        return queryBuilder({
          data: [
            {
              id: LOCATION_A,
              shop_id: "00000000-0000-4000-8000-000000000002",
              code: "A",
              name: "Shelf A",
            },
            {
              id: LOCATION_B,
              shop_id: "00000000-0000-4000-8000-000000000002",
              code: "B",
              name: "Shelf B",
            },
          ],
          error: null,
        });
      }
      if (table === "parts") {
        return queryBuilder({
          data: [
            {
              id: PART_A,
              shop_id: "00000000-0000-4000-8000-000000000002",
              name: "Brake Pad",
              sku: "PAD-1",
              part_number: "BP-1",
              category: "Brakes",
              default_cost: 12,
              cost: 10,
              price: 24,
            },
            {
              id: PART_B,
              shop_id: "00000000-0000-4000-8000-000000000002",
              name: "Brake Rotor",
              sku: "ROTOR-1",
              part_number: "BR-1",
              category: "Brakes",
              default_cost: 30,
              cost: 28,
              price: 60,
            },
          ],
          error: null,
        });
      }
      if (table === "v_part_stock") {
        return queryBuilder({
          data: [
            {
              part_id: PART_A,
              location_id: LOCATION_A,
              qty_available: 5,
              qty_on_hand: 5,
              qty_reserved: 0,
            },
            {
              part_id: PART_B,
              location_id: LOCATION_B,
              qty_available: 5,
              qty_on_hand: 5,
              qty_reserved: 0,
            },
          ],
          error: null,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

vi.mock("@/features/parts/hooks/useAiPartSuggestions", () => ({
  useAiPartSuggestions: () => ({
    loading: false,
    items: [],
    error: null,
    suggest: mocks.suggest,
  }),
}));

describe("PartPicker async submission", () => {
  let keySequence = 0;
  let pickEvent: ReturnType<typeof vi.fn<(event: Event) => void>> | null = null;
  let closeEvent: ReturnType<typeof vi.fn<(event: Event) => void>> | null =
    null;

  beforeEach(() => {
    keySequence = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => {
        keySequence += 1;
        return `00000000-0000-4000-8000-${String(keySequence).padStart(12, "0")}`;
      }),
    });
  });

  afterEach(() => {
    if (pickEvent) {
      window.removeEventListener("partpicker:pick", pickEvent);
      pickEvent = null;
    }
    if (closeEvent) {
      window.removeEventListener("partpicker:close", closeEvent);
      closeEvent = null;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("awaits the action, blocks duplicates, retains a failed selection, and reuses its key", async () => {
    let rejectFirst: ((reason: Error) => void) | undefined;
    const firstAttempt = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const onPick = vi
      .fn<(selection: PickedPart) => Promise<void>>()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce();
    const onClose = vi.fn();
    pickEvent = vi.fn<(event: Event) => void>();
    closeEvent = vi.fn<(event: Event) => void>();
    window.addEventListener("partpicker:pick", pickEvent);
    window.addEventListener("partpicker:close", closeEvent);

    render(
      <PartPicker open onClose={onClose} onPick={onPick} requireLocation />,
    );

    const partButton = await screen.findByRole("button", {
      name: /Brake Pad/,
    });
    await userEvent.click(partButton);
    const usePartButton = screen.getByRole("button", { name: "Use Part" });

    fireEvent.click(usePartButton);
    fireEvent.click(usePartButton);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(pickEvent).not.toHaveBeenCalled();
    expect(closeEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Using…" })).toBeDisabled();

    rejectFirst?.(new Error("Inventory write failed"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Inventory write failed",
    );
    expect(onClose).not.toHaveBeenCalled();

    const firstKey = onPick.mock.calls[0]?.[0].idempotency_key;
    await userEvent.click(screen.getByRole("button", { name: "Use Part" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(onPick.mock.calls[1]?.[0].idempotency_key).toBe(firstKey);
    expect(pickEvent).toHaveBeenCalledTimes(1);
    expect(closeEvent).toHaveBeenCalledTimes(1);
  });

  it("generates a new key when the effective payload changes", async () => {
    const onPick = vi
      .fn<(selection: PickedPart) => Promise<void>>()
      .mockRejectedValue(new Error("Retry"));

    render(<PartPicker open onPick={onPick} requireLocation />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Brake Pad/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Use Part" }));
    await screen.findByRole("alert");

    const firstKey = onPick.mock.calls[0]?.[0].idempotency_key;
    const quantity = screen.getByPlaceholderText("e.g. 1");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "2");
    await userEvent.click(screen.getByRole("button", { name: "Use Part" }));

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(2));
    expect(onPick.mock.calls[1]?.[0].idempotency_key).not.toBe(firstKey);
  });

  it("resets part-specific cost and location when the selected part changes", async () => {
    const onPick = vi
      .fn<(selection: PickedPart) => Promise<void>>()
      .mockRejectedValue(new Error("Keep open"));

    render(<PartPicker open onPick={onPick} requireLocation />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Brake Pad/ }),
    );
    expect(screen.getByDisplayValue("12.00")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue(LOCATION_A);

    await userEvent.click(screen.getByRole("button", { name: /Brake Rotor/ }));
    expect(screen.getByDisplayValue("30.00")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue(LOCATION_B);

    await userEvent.click(screen.getByRole("button", { name: "Use Part" }));
    await screen.findByRole("alert");

    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({
        part_id: PART_B,
        location_id: LOCATION_B,
        unit_cost: 30,
      }),
    );
  });
});
