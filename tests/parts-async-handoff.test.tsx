import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PartsDrawer from "@/features/parts/components/PartsDrawer";
import { UsePartButton } from "@/features/work-orders/components/UsePartButton";

(globalThis as unknown as { React: typeof React }).React = React;

type PickerSelection = {
  part_id: string;
  location_id: string;
  qty: number;
  unit_cost: number;
  availability: "in_stock";
  idempotency_key: string;
};

type MockPickerProps = {
  open: boolean;
  onClose?: () => void;
  onPick?: (selection: PickerSelection) => void | Promise<void>;
  onSubmittingChange?: (submitting: boolean) => void;
};

const mocks = vi.hoisted(() => {
  const selection: PickerSelection = {
    part_id: "00000000-0000-4000-8000-000000000004",
    location_id: "00000000-0000-4000-8000-000000000003",
    qty: 2,
    unit_cost: 12,
    availability: "in_stock",
    idempotency_key: "00000000-0000-4000-8000-000000000005",
  };

  function MockPartPicker({
    open,
    onClose,
    onPick,
    onSubmittingChange,
  }: MockPickerProps) {
    const react = (
      globalThis as unknown as {
        React: typeof React;
      }
    ).React;
    const [submitting, setSubmitting] = react.useState(false);
    const [error, setError] = react.useState<string | null>(null);

    if (!open) return null;

    const submit = async () => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      onSubmittingChange?.(true);

      try {
        await onPick?.(selection);
        onSubmittingChange?.(false);
        setSubmitting(false);
        onClose?.();
      } catch (submitError) {
        onSubmittingChange?.(false);
        setSubmitting(false);
        setError(
          submitError instanceof Error ? submitError.message : "Submit failed",
        );
      }
    };

    return react.createElement(
      "div",
      { "data-testid": "mock-part-picker" },
      react.createElement(
        "button",
        {
          disabled: submitting,
          onClick: () => void submit(),
          type: "button",
        },
        submitting ? "Submitting…" : "Submit picked part",
      ),
      react.createElement(
        "button",
        {
          disabled: submitting,
          onClick: onClose,
          type: "button",
        },
        "Picker Close",
      ),
      error
        ? react.createElement(
            "div",
            {
              role: "alert",
            },
            error,
          )
        : null,
    );
  }

  return {
    consumePart: vi.fn(),
    pickerModule: {
      default: MockPartPicker,
      PartPicker: MockPartPicker,
    },
    selection,
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  };
});

vi.mock("@/features/parts/components/PartPicker", () => mocks.pickerModule);
vi.mock("@parts/components/PartPicker", () => mocks.pickerModule);
vi.mock("@/features/work-orders/lib/parts/consumePart", () => ({
  consumePart: mocks.consumePart,
}));
vi.mock("@work-orders/lib/parts/consumePart", () => ({
  consumePart: mocks.consumePart,
}));
vi.mock(
  "@/features/work-orders/components/workorders/PartsRequestModal",
  () => ({
    default: () => React.createElement("div", null, "Parts request"),
  }),
);
vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

const WORK_ORDER_ID = "00000000-0000-4000-8000-000000000001";
const WORK_ORDER_LINE_ID = "00000000-0000-4000-8000-000000000002";

const successfulConsumption = {
  ok: true as const,
  idempotent: false,
  work_order_part_id: "00000000-0000-4000-8000-000000000006",
  stock_move_id: "00000000-0000-4000-8000-000000000007",
  issued_qty: 2,
  net_issued_qty: 2,
  on_hand_after: 3,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const listenerCleanup: Array<() => void> = [];

function listenFor(eventName: string) {
  const listener = vi.fn<(event: Event) => void>();
  window.addEventListener(eventName, listener);
  listenerCleanup.push(() => window.removeEventListener(eventName, listener));
  return listener;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  listenerCleanup.splice(0).forEach((removeListener) => removeListener());
});

describe("PartsDrawer async use-part handoff", () => {
  it("blocks every close path until inventory consumption finishes", async () => {
    const consumption = deferred<typeof successfulConsumption>();
    mocks.consumePart.mockReturnValue(consumption.promise);
    const closeListener = listenFor("test:parts-drawer-close");

    const { container } = render(
      <PartsDrawer
        closeEventName="test:parts-drawer-close"
        open
        workOrderId={WORK_ORDER_ID}
        workOrderLineId={WORK_ORDER_LINE_ID}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Submit picked part" }),
    );
    await waitFor(() => expect(mocks.consumePart).toHaveBeenCalledTimes(1));

    expect(mocks.consumePart).toHaveBeenCalledWith({
      idempotency_key: mocks.selection.idempotency_key,
      location_id: mocks.selection.location_id,
      part_id: mocks.selection.part_id,
      qty: mocks.selection.qty,
      unit_cost: mocks.selection.unit_cost,
      work_order_line_id: WORK_ORDER_LINE_ID,
    });

    const headerClose = screen.getByRole("button", { name: "Close" });
    const pickerClose = screen.getByRole("button", { name: "Picker Close" });
    expect(headerClose).toBeDisabled();
    expect(pickerClose).toBeDisabled();
    fireEvent.click(headerClose);
    fireEvent.click(pickerClose);

    const backdrop = container.querySelector<HTMLDivElement>(
      'div.fixed.inset-0 > div[aria-hidden="true"]',
    );
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    act(() => {
      window.dispatchEvent(new Event("parts-request:close"));
      window.dispatchEvent(new Event("parts-request:submitted"));
    });

    expect(closeListener).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    await act(async () => {
      consumption.resolve(successfulConsumption);
      await consumption.promise;
    });

    await waitFor(() => expect(closeListener).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Part used on job (inventory updated).",
    );
  });

  it("keeps the drawer open and emits no success after a failed consume", async () => {
    mocks.consumePart.mockResolvedValue({
      ok: false,
      error: "Inventory write failed",
    });
    const closeListener = listenFor("test:failed-parts-drawer-close");

    render(
      <PartsDrawer
        closeEventName="test:failed-parts-drawer-close"
        open
        workOrderId={WORK_ORDER_ID}
        workOrderLineId={WORK_ORDER_LINE_ID}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Submit picked part" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Inventory write failed",
    );
    expect(screen.getByTestId("mock-part-picker")).toBeInTheDocument();
    expect(closeListener).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});

describe("UsePartButton async use-part handoff", () => {
  it("closes only after both consumePart and onApplied have resolved", async () => {
    const consumption = deferred<typeof successfulConsumption>();
    const applied = deferred<void>();
    const onApplied = vi.fn(() => applied.promise);
    mocks.consumePart.mockReturnValue(consumption.promise);

    render(
      <UsePartButton
        onApplied={onApplied}
        workOrderLineId={WORK_ORDER_LINE_ID}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Use Part" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Submit picked part" }),
    );

    expect(screen.getByTestId("mock-part-picker")).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();

    await act(async () => {
      consumption.resolve(successfulConsumption);
      await consumption.promise;
    });

    await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
    expect(screen.getByTestId("mock-part-picker")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submitting…" }),
    ).toBeDisabled();

    await act(async () => {
      applied.resolve();
      await applied.promise;
    });

    await waitFor(() =>
      expect(screen.queryByTestId("mock-part-picker")).not.toBeInTheDocument(),
    );
  });

  it("keeps the picker open and skips onApplied after a failed consume", async () => {
    const onApplied = vi.fn();
    mocks.consumePart.mockResolvedValue({
      ok: false,
      error: "Inventory write failed",
    });

    render(
      <UsePartButton
        onApplied={onApplied}
        workOrderLineId={WORK_ORDER_LINE_ID}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Use Part" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Submit picked part" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Inventory write failed",
    );
    expect(screen.getByTestId("mock-part-picker")).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
  });
});
