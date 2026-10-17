import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  EquipmentCloseLineForm,
  EquipmentPunchOffForm,
} from "@/features/equipment/dispatch/components/EquipmentLineActions";

const LINE = "00000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn();

function reply(ok: boolean, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
}
function keyOf(call: number): string {
  return (fetchMock.mock.calls[call][1].headers as Record<string, string>)["Idempotency-Key"];
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  refresh.mockClear();
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("EquipmentPunchOffForm", () => {
  it("lets a non-final technician punch off without cause or correction", async () => {
    reply(true, { ok: true, lineId: LINE, lineClosed: false, remaining: [{ technicianId: "t", state: "running" }], idempotent: false });
    render(<EquipmentPunchOffForm lineId={LINE} closesLine={false} initialCause={null} initialCorrection={null} />);

    expect(screen.queryByLabelText(/cause/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Punch off" }));

    await screen.findByText(/1 other technician is still on this job/);
    expect(fetchMock).toHaveBeenCalledWith("/api/equipment/punch-off", expect.objectContaining({ method: "POST" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("requires cause and correction before the last technician can complete the line", () => {
    render(<EquipmentPunchOffForm lineId={LINE} closesLine initialCause={null} initialCorrection={null} />);
    const button = screen.getByRole("button", { name: /complete line/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^cause/i), { target: { value: "Worn seal" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^correction/i), { target: { value: "Replaced seal" } });
    expect(button).toBeEnabled();
  });

  it("reuses the key on retry after a failure, and starts a new one after an edit", async () => {
    reply(false, { error: "Network hiccup" });
    reply(false, { error: "Still failing" });
    reply(true, { ok: true, lineId: LINE, lineClosed: true, remaining: [], idempotent: false });
    render(<EquipmentPunchOffForm lineId={LINE} closesLine initialCause="Cause" initialCorrection="Fix" />);

    const button = screen.getByRole("button", { name: /complete line/i });
    fireEvent.click(button);
    await screen.findByText("Network hiccup");
    fireEvent.click(button);
    await screen.findByText("Still failing");
    expect(keyOf(1)).toBe(keyOf(0));

    fireEvent.change(screen.getByLabelText(/^correction/i), { target: { value: "Fix v2" } });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).not.toBe(keyOf(0));
    await screen.findByText(/the line is complete/i);
  });
});

describe("EquipmentCloseLineForm", () => {
  it("needs a reason, cause and correction, and confirms before closing", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    reply(true, { ok: true, lineId: LINE, lineClosed: true, timersClosed: 2, idempotent: false });
    render(<EquipmentCloseLineForm lineId={LINE} initialCause="Cause" initialCorrection="Fix" />);

    const button = screen.getByRole("button", { name: "Close line" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^reason/i), { target: { value: "Tech forgot to punch off" } });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    await screen.findByText(/2 running timers ended/);
    expect(confirm).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({ lineId: LINE, reason: "Tech forgot to punch off", cause: "Cause", correction: "Fix" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/equipment/punch-off/close");
  });

  it("does nothing when the user declines the confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<EquipmentCloseLineForm lineId={LINE} initialCause="Cause" initialCorrection="Fix" />);
    fireEvent.change(screen.getByLabelText(/^reason/i), { target: { value: "Forgot" } });
    fireEvent.click(screen.getByRole("button", { name: "Close line" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
