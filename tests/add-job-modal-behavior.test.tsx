import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/features/shared/components/ModalShell", () => ({
  default: ({
    busy,
    children,
    onSubmit,
  }: {
    busy?: boolean;
    children: React.ReactNode;
    onSubmit?: () => void | Promise<void>;
  }) => (
    <div>
      {children}
      <button type="button" disabled={busy} onClick={() => void onSubmit?.()}>
        Submit job
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void onSubmit?.();
          void onSubmit?.();
        }}
      >
        Submit job twice
      </button>
    </div>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

import AddJobModal from "@/features/work-orders/components/workorders/AddJobModal";

const WORK_ORDER_ID = "11111111-1111-4111-8111-111111111111";

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];
type ManualLineBody = {
  lineId: string;
  jobName: string;
  notes: string;
  laborHours: number;
  parts: Array<{ description: string; qty: number }>;
  urgency: "low" | "medium" | "high";
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(call: FetchCall): string {
  return String(call[0]);
}

function requestBody<T>(call: FetchCall): T {
  return JSON.parse(String(call[1]?.body)) as T;
}

function lineCalls(): FetchCall[] {
  return (mocks.fetch.mock.calls as FetchCall[]).filter((call) =>
    requestUrl(call).endsWith(`/api/work-orders/${WORK_ORDER_ID}/lines`),
  );
}

function partsCalls(): FetchCall[] {
  return (mocks.fetch.mock.calls as FetchCall[]).filter(
    (call) => requestUrl(call) === "/api/parts/requests/create",
  );
}

function successfulLineResponse(init?: RequestInit): Response {
  const body = JSON.parse(String(init?.body)) as ManualLineBody;
  return jsonResponse(
    { ok: true, lineId: body.lineId, idempotent: false },
    201,
  );
}

function renderModal() {
  const onClose = vi.fn();
  const onJobAdded = vi.fn();
  render(
    <AddJobModal
      isOpen
      workOrderId={WORK_ORDER_ID}
      onClose={onClose}
      onJobAdded={onJobAdded}
    />,
  );
  return { onClose, onJobAdded };
}

function enterJobName(value: string) {
  fireEvent.change(screen.getByPlaceholderText("e.g. Replace tie rod end RH"), {
    target: { value },
  });
}

function submitJob() {
  fireEvent.click(screen.getByRole("button", { name: "Submit job" }));
}

describe("AddJobModal manual line workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith(`/api/work-orders/${WORK_ORDER_ID}/lines`)) {
          return Promise.resolve(successfulLineResponse(init));
        }
        if (String(input) === "/api/parts/requests/create") {
          return Promise.resolve(jsonResponse({ requestId: "request-1" }, 201));
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("submits the normalized form intent and matching idempotency header", async () => {
    const callbacks = renderModal();
    enterJobName("Replace wheel speed sensor");
    fireEvent.change(
      screen.getByPlaceholderText(
        "Optional notes, concerns, or correction details…",
      ),
      { target: { value: "Verify wiring first" } },
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. 1.5"), {
      target: { value: "1.25" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("e.g. rear pads, serp belt…"),
      {
        target: { value: "Wheel speed sensor" },
      },
    );
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "high" },
    });

    submitJob();

    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    const [lineCall] = lineCalls();
    const lineBody = requestBody<ManualLineBody>(lineCall);
    expect(lineBody).toEqual({
      lineId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      jobName: "Replace wheel speed sensor",
      notes: "Verify wiring first",
      laborHours: 1.25,
      parts: [{ description: "Wheel speed sensor", qty: 2 }],
      urgency: "high",
    });
    expect(lineCall[1]?.headers).toMatchObject({
      "Idempotency-Key": lineBody.lineId,
    });
    expect(partsCalls()).toHaveLength(1);
    expect(callbacks.onJobAdded).toHaveBeenCalledOnce();
  });

  it("reuses the stable line UUID when an uncertain response is retried unchanged", async () => {
    let lineAttempt = 0;
    mocks.fetch.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith(`/api/work-orders/${WORK_ORDER_ID}/lines`)) {
          lineAttempt += 1;
          return lineAttempt === 1
            ? Promise.reject(new TypeError("Failed to fetch"))
            : Promise.resolve(successfulLineResponse(init));
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );
    const callbacks = renderModal();
    enterJobName("Diagnose intermittent no-start");

    submitJob();
    await screen.findByText("Failed to fetch");
    submitJob();

    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    const bodies = lineCalls().map((call) => requestBody<ManualLineBody>(call));
    expect(bodies).toHaveLength(2);
    expect(bodies[1].lineId).toBe(bodies[0].lineId);
  });

  it("rotates the line UUID when the failed creation intent changes", async () => {
    let lineAttempt = 0;
    mocks.fetch.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith(`/api/work-orders/${WORK_ORDER_ID}/lines`)) {
          lineAttempt += 1;
          return lineAttempt === 1
            ? Promise.reject(new TypeError("Failed to fetch"))
            : Promise.resolve(successfulLineResponse(init));
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );
    const callbacks = renderModal();
    enterJobName("Inspect front brakes");

    submitJob();
    await screen.findByText("Failed to fetch");
    enterJobName("Inspect front brakes and wheel bearings");
    submitJob();

    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    const bodies = lineCalls().map((call) => requestBody<ManualLineBody>(call));
    expect(bodies).toHaveLength(2);
    expect(bodies[1].lineId).not.toBe(bodies[0].lineId);
    expect(bodies[1].jobName).toBe("Inspect front brakes and wheel bearings");
  });

  it("suppresses a synchronous double submit while the line request is pending", async () => {
    let releaseLine: ((response: Response) => void) | null = null;
    mocks.fetch.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith(`/api/work-orders/${WORK_ORDER_ID}/lines`)) {
          return new Promise<Response>((resolve) => {
            releaseLine = () => resolve(successfulLineResponse(init));
          });
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );
    const callbacks = renderModal();
    enterJobName("Replace alternator");

    fireEvent.click(screen.getByRole("button", { name: "Submit job twice" }));

    expect(lineCalls()).toHaveLength(1);
    await act(async () => {
      releaseLine?.(successfulLineResponse(lineCalls()[0][1]));
    });
    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    expect(lineCalls()).toHaveLength(1);
  });

  it("does not create a parts request or close when line creation fails", async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ error: "This work order is no longer editable." }, 409),
    );
    const callbacks = renderModal();
    enterJobName("Replace serpentine belt");
    fireEvent.change(
      screen.getByPlaceholderText("e.g. rear pads, serp belt…"),
      {
        target: { value: "Serpentine belt" },
      },
    );

    submitJob();

    await screen.findByText("This work order is no longer editable.");
    expect(lineCalls()).toHaveLength(1);
    expect(partsCalls()).toHaveLength(0);
    expect(callbacks.onJobAdded).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it("closes and refreshes after line success even when the parts follow-up fails", async () => {
    mocks.fetch.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith(`/api/work-orders/${WORK_ORDER_ID}/lines`)) {
          return Promise.resolve(successfulLineResponse(init));
        }
        if (String(input) === "/api/parts/requests/create") {
          return Promise.resolve(
            jsonResponse({ error: "Parts service unavailable" }, 503),
          );
        }
        throw new Error(`Unexpected fetch: ${String(input)}`);
      },
    );
    const callbacks = renderModal();
    enterJobName("Replace cabin air filter");
    fireEvent.change(
      screen.getByPlaceholderText("e.g. rear pads, serp belt…"),
      {
        target: { value: "Cabin air filter" },
      },
    );

    submitJob();

    await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
    expect(callbacks.onJobAdded).toHaveBeenCalledOnce();
    expect(lineCalls()).toHaveLength(1);
    expect(partsCalls()).toHaveLength(1);
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Job added, but parts request failed: Parts service unavailable",
    );
  });
});
