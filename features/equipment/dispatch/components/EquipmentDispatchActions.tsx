"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DispatchWorkOrderSchema,
  type DispatchWorkOrderInput,
} from "@/features/equipment/dispatch/lib/equipmentDispatch";
import type { EquipmentDispatchData } from "@/features/equipment/dispatch/server/loadEquipmentDispatch";

const INPUT =
  "mt-1 min-h-11 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm";
const BUTTON =
  "min-h-11 rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold disabled:opacity-50";
type Pending = { key: string; request: DispatchWorkOrderInput };

export function EquipmentDispatchForm({
  data,
  shopId,
  actorId,
}: {
  data: Pick<
    EquipmentDispatchData,
    | "selected"
    | "addresses"
    | "addressesPartial"
    | "technicians"
    | "serviceVehicles"
  >;
  shopId: string;
  actorId: string;
}) {
  const router = useRouter();
  const storageKey = `equipment-dispatch:${shopId}:${actorId}`;
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const value = JSON.parse(raw) as Pending;
        const parsed = DispatchWorkOrderSchema.safeParse(value.request);
        if (
          !parsed.success ||
          typeof value.key !== "string" ||
          !value.key.startsWith("equipment-ui:")
        )
          throw new Error("Invalid recovery record");
        setPending({ key: value.key, request: parsed.data });
      }
      setReady(true);
    } catch {
      setMessage(
        "Dispatch recovery storage is unavailable. Restore browser storage before dispatching.",
      );
    }
  }, [storageKey]);

  async function send(operation: Pending, retry = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      // Persist BEFORE sending. Reloads and notification failures replay the
      // exact request/key, never create a new visit or repeat notifications.
      sessionStorage.setItem(storageKey, JSON.stringify(operation));
      setPending(operation);
      const response = await fetch("/api/equipment/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operation.key,
        },
        body: JSON.stringify(operation.request),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        if (!retry && response.status >= 400 && response.status < 500) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
        }
        throw new Error(
          result?.error ||
            "Dispatch outcome is uncertain. Retry the saved request.",
        );
      }
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setSaved(true);
      setMessage("Visit dispatched. Technician notifications queued.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Dispatch failed. Retry the saved request.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3" aria-label="Dispatch work order">
      <h2 className="font-semibold">Dispatch now</h2>
      <p className="text-sm text-[color:var(--theme-text-muted)]">
        Create a field visit on an existing work order. Dispatch checks
        approval, Field access and existing visits. Dispatch does not start
        technician labor.
      </p>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      {pending ? (
        <div className="space-y-2">
          <p className="text-sm">
            A dispatch request is awaiting confirmation. Retry that saved
            request before dispatching another job.
          </p>
          <button
            type="button"
            className={BUTTON}
            disabled={busy || !ready}
            onClick={() => void send(pending, true)}
          >
            {busy ? "Confirming…" : "Retry saved dispatch"}
          </button>
        </div>
      ) : data.selected && !saved ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const parsed = DispatchWorkOrderSchema.safeParse({
              workOrderId: data.selected!.id,
              mode: "mobile",
              dispatchNow: true,
              serviceAddressId: values.get("address") || null,
              leadUserId: values.get("lead") || null,
              supportUserIds: values.getAll("support"),
              serviceVehicleId: values.get("truck") || null,
              dispatchNotes: values.get("notes") || null,
            });
            if (!parsed.success) {
              setMessage(
                parsed.error.issues.map((issue) => issue.message).join(" "),
              );
              return;
            }
            void send({
              key: `equipment-ui:${crypto.randomUUID()}`,
              request: parsed.data,
            });
          }}
          className="space-y-3"
        >
          <p className="text-sm font-semibold">
            {data.selected.title} · {data.selected.assetLabel}
          </p>
          <fieldset
            disabled={busy || !ready}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="text-sm">
              Jobsite
              <select name="address" required className={INPUT}>
                <option value="">Choose jobsite</option>
                {data.addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Lead technician
              <select name="lead" required className={INPUT}>
                <option value="">Choose eligible technician</option>
                {data.technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Service truck
              <select name="truck" className={INPUT}>
                <option value="">No truck assigned</option>
                {data.serviceVehicles.map((truck) => (
                  <option key={truck.id} value={truck.id}>
                    {truck.name}
                    {truck.unitNumber ? ` · ${truck.unitNumber}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Dispatch notes
              <textarea name="notes" maxLength={4000} className={INPUT} />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm">
                Supporting technicians (optional, up to 10)
              </legend>
              <div className="flex max-h-48 flex-wrap gap-3 overflow-y-auto">
                {data.technicians.map((tech) => (
                  <label
                    key={tech.id}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input type="checkbox" name="support" value={tech.id} />
                    {tech.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              className={`${BUTTON} bg-[color:var(--accent-copper)] text-white`}
              disabled={!data.addresses.length || !data.technicians.length}
            >
              Dispatch now
            </button>
          </fieldset>
          {!data.addresses.length ? (
            <p className="text-sm">
              No customer jobsite is configured for this work order.
            </p>
          ) : null}
          {data.addressesPartial ? (
            <p className="text-sm">Showing the first 100 customer jobsites.</p>
          ) : null}
        </form>
      ) : !saved ? (
        <p className="text-sm">Choose an active Equipment work order above.</p>
      ) : null}
      <p className="text-sm text-[color:var(--theme-text-muted)]">
        Technicians listed have Field eligibility; trucks listed are active.
        Eligibility is not availability. No availability count is shown.
      </p>
    </section>
  );
}

export function EquipmentVisitAcknowledge({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  return (
    <div>
      <button
        type="button"
        className={BUTTON}
        disabled={busy}
        onClick={async () => {
          if (inFlight.current) return;
          inFlight.current = true;
          setBusy(true);
          setMessage("");
          try {
            const response = await fetch(
              `/api/equipment/dispatch/visits/${visitId}/acknowledge`,
              { method: "POST" },
            );
            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.ok)
              throw new Error(
                result?.error || "Could not confirm acknowledgement. Retry.",
              );
            setMessage("Acknowledged.");
            router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Acknowledgement failed.",
            );
          } finally {
            setBusy(false);
            inFlight.current = false;
          }
        }}
      >
        {busy ? "Acknowledging…" : "Acknowledge my assignment"}
      </button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
