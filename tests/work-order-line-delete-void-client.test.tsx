import type { ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeleteOrVoidLineModal from "@/features/work-orders/components/workorders/DeleteOrVoidLineModal";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

type ModalProps = ComponentProps<typeof DeleteOrVoidLineModal>;

const LINE_ID = "00000000-0000-4000-8000-000000000101";
const FIRST_KEY = "00000000-0000-4000-8000-000000000201";
const SECOND_KEY = "00000000-0000-4000-8000-000000000202";

function line(overrides: Partial<ModalProps["line"]> = {}): ModalProps["line"] {
  return {
    id: LINE_ID,
    status: "awaiting",
    description: "Brake inspection",
    complaint: null,
    ...overrides,
  } as ModalProps["line"];
}

function allocation(): ModalProps["allocations"][number] {
  return {
    id: "00000000-0000-4000-8000-000000000301",
  } as ModalProps["allocations"][number];
}

function jsonResponse(body: Record<string, unknown>, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function requestAt(
  fetchMock: ReturnType<typeof vi.fn>,
  index: number,
): { url: string; headers: Headers; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return {
    url,
    headers: new Headers(init.headers),
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  };
}

describe("work-order line delete/void client contract", () => {
  beforeEach(() => {
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    let keyIndex = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => {
        const keys = [FIRST_KEY, SECOND_KEY];
        const key = keys[keyIndex] ?? `fallback-key-${keyIndex}`;
        keyIndex += 1;
        return key;
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sends the route-required disposition and stable key for a void without allocations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ok: true, mode: "voided", idempotent: false }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    const onDone = vi.fn();

    render(
      <DeleteOrVoidLineModal
        open
        onClose={onClose}
        line={line()}
        allocations={[]}
        onDone={onDone}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Void line" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = requestAt(fetchMock, 0);
    expect(request.url).toBe(
      `/api/work-orders/lines/${LINE_ID}/delete-or-void`,
    );
    expect(request.headers.get("Idempotency-Key")).toBe(FIRST_KEY);
    expect(request.body).toEqual({
      mode: "void",
      consumedDisposition: "keep_consumed",
      reason: "Customer declined",
      note: null,
      idempotencyKey: FIRST_KEY,
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the required consumed disposition inert for an empty-line hard delete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, mode: "deleted" }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DeleteOrVoidLineModal
        open
        onClose={vi.fn()}
        line={line()}
        allocations={[]}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Hard delete/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete line" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestAt(fetchMock, 0).body).toEqual({
      mode: "delete",
      consumedDisposition: "keep_consumed",
      reason: "Customer declined",
      note: null,
      idempotencyKey: FIRST_KEY,
    });
  });

  it("forces void and sends the selected consumed-parts disposition when allocations exist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, mode: "voided" }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DeleteOrVoidLineModal
        open
        onClose={vi.fn()}
        line={line()}
        allocations={[allocation()]}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: /Return parts to stock/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Void line" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(requestAt(fetchMock, 0).body).toEqual({
      mode: "void",
      disposition: "return_to_stock",
      consumedDisposition: "return_to_stock",
      reason: "Customer declined",
      note: null,
      idempotencyKey: FIRST_KEY,
    });
  });

  it("reuses a key for an unchanged retry and rotates it when mutation intent changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: "Temporary failure" }, false),
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "Temporary failure" }, false),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, mode: "voided" }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DeleteOrVoidLineModal
        open
        onClose={vi.fn()}
        line={line()}
        allocations={[]}
      />,
    );

    const submit = screen.getByRole("button", { name: "Void line" });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText("Optional note…"), {
      target: { value: "Customer requested cancellation" },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const first = requestAt(fetchMock, 0);
    const second = requestAt(fetchMock, 1);
    const third = requestAt(fetchMock, 2);
    expect(first.headers.get("Idempotency-Key")).toBe(FIRST_KEY);
    expect(second.headers.get("Idempotency-Key")).toBe(FIRST_KEY);
    expect(second.body.idempotencyKey).toBe(FIRST_KEY);
    expect(third.headers.get("Idempotency-Key")).toBe(SECOND_KEY);
    expect(third.body).toMatchObject({
      note: "Customer requested cancellation",
      idempotencyKey: SECOND_KEY,
    });
  });

  it("blocks a duplicate submit while the first request is still pending", async () => {
    let resolveRequest: ((response: Response) => void) | null = null;
    const pendingRequest = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingRequest);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DeleteOrVoidLineModal
        open
        onClose={vi.fn()}
        line={line()}
        allocations={[]}
      />,
    );

    const submit = screen.getByRole("button", { name: "Void line" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();

    await act(async () => {
      resolveRequest?.(jsonResponse({ ok: true, mode: "voided" }));
      await pendingRequest;
    });
  });
});
