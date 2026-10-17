import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import {
  EquipmentDispatchForm,
  EquipmentVisitAcknowledge,
} from "@/features/equipment/dispatch/components/EquipmentDispatchActions";
import type { EquipmentDispatchData } from "@/features/equipment/dispatch/server/loadEquipmentDispatch";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const data = {
  selected: { id: id(1), title: "WO-1", assetLabel: "Excavator" },
  addresses: [{ id: id(2), label: "North Yard" }],
  addressesPartial: false,
  technicians: [
    { id: id(3), name: "Lead" },
    { id: id(4), name: "Support" },
  ],
  serviceVehicles: [{ id: id(5), name: "Truck" }],
} as EquipmentDispatchData;
function fill() {
  fireEvent.change(screen.getByLabelText("Jobsite"), {
    target: { value: id(2) },
  });
  fireEvent.change(screen.getByLabelText("Lead technician"), {
    target: { value: id(3) },
  });
  fireEvent.change(screen.getByLabelText("Service truck"), {
    target: { value: id(5) },
  });
  fireEvent.click(screen.getByLabelText("Support", { selector: "input" }));
  fireEvent.click(screen.getByRole("button", { name: "Dispatch now" }));
}
beforeEach(() => {
  sessionStorage.clear();
  mocks.refresh.mockClear();
  vi.stubGlobal("fetch", vi.fn());
});
describe("Equipment existing-command wiring", () => {
  it("posts the canonical request once and confirms only after success", async () => {
    let finish!: (r: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<EquipmentDispatchForm data={data} shopId="shop" actorId="actor" />);
    fill();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/equipment/dispatch");
    expect(JSON.parse(String(options?.body))).toEqual({
      workOrderId: id(1),
      mode: "mobile",
      dispatchNow: true,
      leadUserId: id(3),
      supportUserIds: [id(4)],
      serviceAddressId: id(2),
      serviceVehicleId: id(5),
      dispatchNotes: null,
    });
    expect(options?.headers).toMatchObject({
      "Idempotency-Key": expect.stringMatching(/^equipment-ui:/),
    });
    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    finish(new Response(JSON.stringify({ ok: true }), { status: 201 }));
    await screen.findByText(
      "Visit dispatched. Technician notifications queued.",
    );
    expect(sessionStorage.getItem("equipment-dispatch:shop:actor")).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("replays exactly the saved key and body after a notification failure and remount", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Notifications need retry" }), {
        status: 503,
      }),
    );
    const view = render(
      <EquipmentDispatchForm data={data} shopId="shop" actorId="actor" />,
    );
    fill();
    await screen.findByText("Notifications need retry");
    const first = vi.mocked(fetch).mock.calls[0][1];
    view.unmount();
    render(
      <EquipmentDispatchForm
        data={{ ...data, selected: null }}
        shopId="shop"
        actorId="actor"
      />,
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, idempotent: true })),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry saved dispatch" }),
    );
    await screen.findByText(
      "Visit dispatched. Technician notifications queued.",
    );
    expect(vi.mocked(fetch).mock.calls[1][1]).toEqual(first);
  });
  it("retains an uncertain request when a retry is denied", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network unavailable"));
    render(<EquipmentDispatchForm data={data} shopId="shop" actorId="actor" />);
    fill();
    await screen.findByText("Network unavailable");
    const saved = sessionStorage.getItem("equipment-dispatch:shop:actor");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Session expired" }), {
        status: 401,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry saved dispatch" }),
    );
    await screen.findByText("Session expired");
    expect(sessionStorage.getItem("equipment-dispatch:shop:actor")).toBe(saved);
    expect(
      screen.getByRole("button", { name: "Retry saved dispatch" }),
    ).toBeInTheDocument();
  });
  it("does not replay another actor's or tenant's request", async () => {
    sessionStorage.setItem(
      "equipment-dispatch:other:actor",
      JSON.stringify({ key: "equipment-ui:key", request: {} }),
    );
    render(<EquipmentDispatchForm data={data} shopId="shop" actorId="actor" />);
    expect(screen.queryByText("Retry saved dispatch")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps an uncertain transport failure recoverable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network unavailable"));
    render(<EquipmentDispatchForm data={data} shopId="shop" actorId="actor" />);
    fill();
    await screen.findByText("Network unavailable");
    expect(
      sessionStorage.getItem("equipment-dispatch:shop:actor"),
    ).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("shows server denial without claiming success or retrying automatically", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Approval required" }), {
        status: 403,
      }),
    );
    render(<EquipmentDispatchForm data={data} shopId="shop" actorId="actor" />);
    fill();
    await screen.findByText("Approval required");
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("equipment-dispatch:shop:actor")).toBeNull();
  });
  it("preserves canonical lead/support validation", async () => {
    render(<EquipmentDispatchForm data={data} shopId="shop" actorId="actor" />);
    fireEvent.click(screen.getByLabelText("Lead", { selector: "input" }));
    fill();
    expect(
      await screen.findByText("The lead technician is already on the visit."),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the existing participant acknowledgement route without changing visit status", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true })),
    );
    render(<EquipmentVisitAcknowledge visitId={id(6)} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge my assignment" }),
    );
    await screen.findByText("Acknowledged.");
    expect(fetch).toHaveBeenCalledWith(
      `/api/equipment/dispatch/visits/${id(6)}/acknowledge`,
      { method: "POST" },
    );
  });
});
