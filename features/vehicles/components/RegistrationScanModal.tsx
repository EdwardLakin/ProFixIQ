"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ModalShell from "@/features/shared/components/ModalShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";
import {
  scanVehicleRegistration,
  captureHasAnyData,
} from "@/features/work-orders/intake/capture/scanRegistration";
import {
  previewVehicleCaptureMatch,
  type CaptureMatchPreview,
} from "@/features/work-orders/intake/capture/resolveVehicleCaptureMatch";
import type {
  IntakeCaptureCustomerFields,
  IntakeCaptureVehicleFields,
} from "@/features/work-orders/intake/capture/types";

export type RegistrationScanApplyResult = {
  customer: Partial<IntakeCaptureCustomerFields>;
  /** Vehicle fields already mapped to `vehicles` column names. */
  vehicle: {
    vin?: string | null;
    license_plate?: string | null;
    year?: string | null;
    make?: string | null;
    model?: string | null;
    submodel?: string | null;
    engine?: string | null;
  };
  /** The original photo, for saving to the vehicle's document record. */
  file: File;
};

type CurrentCustomer = Partial<
  Record<keyof IntakeCaptureCustomerFields, string | null>
>;
type CurrentVehicle = {
  vin?: string | null;
  license_plate?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  submodel?: string | null;
  engine?: string | null;
};

type Props = {
  currentCustomer: CurrentCustomer;
  currentVehicle: CurrentVehicle;
  customerId: string | null;
  vehicleId: string | null;
  onApply: (result: RegistrationScanApplyResult) => void;
  children?: React.ReactNode;
};

type FieldRow = {
  key: string;
  label: string;
  group: "customer" | "vehicle";
  value: string;
  currentValue: string | null;
};

const CUSTOMER_LABELS: Record<keyof IntakeCaptureCustomerFields, string> = {
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  city: "City",
  province: "Province",
  postal_code: "Postal code",
};

const VEHICLE_LABELS: Record<keyof IntakeCaptureVehicleFields, string> = {
  vin: "VIN",
  plate: "License plate",
  year: "Year",
  make: "Make",
  model: "Model",
  trim: "Trim / submodel",
  engine: "Engine",
};

// Vehicle capture keys map to different `vehicles` column names.
const VEHICLE_TARGET_KEY: Record<
  keyof IntakeCaptureVehicleFields,
  keyof CurrentVehicle
> = {
  vin: "vin",
  plate: "license_plate",
  year: "year",
  make: "make",
  model: "model",
  trim: "submodel",
  engine: "engine",
};

const trimOrNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export default function RegistrationScanModal({
  currentCustomer,
  currentVehicle,
  customerId,
  vehicleId,
  onApply,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<FieldRow[] | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [matchPreview, setMatchPreview] = useState<CaptureMatchPreview | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setBusy(false);
    setError(null);
    setWarnings([]);
    setFile(null);
    setRows(null);
    setAccepted({});
    setMatchPreview(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = useCallback(
    async (picked: File | null) => {
      if (!picked) return;
      reset();
      setFile(picked);
      setPreviewUrl(URL.createObjectURL(picked));
      setBusy(true);
      setError(null);

      try {
        const capture = await scanVehicleRegistration(picked);
        setWarnings(capture.warnings);

        if (!captureHasAnyData(capture)) {
          setRows([]);
          return;
        }

        const nextRows: FieldRow[] = [];
        const nextAccepted: Record<string, boolean> = {};

        if (capture.customer) {
          for (const key of Object.keys(
            CUSTOMER_LABELS,
          ) as (keyof IntakeCaptureCustomerFields)[]) {
            const value = trimOrNull(capture.customer[key]);
            if (!value) continue;
            const currentValue = trimOrNull(currentCustomer[key] ?? null);
            nextRows.push({
              key: `customer.${key}`,
              label: CUSTOMER_LABELS[key],
              group: "customer",
              value,
              currentValue,
            });
            // Default to applying it unless it would silently overwrite a
            // different value that's already in the form.
            nextAccepted[`customer.${key}`] =
              !currentValue || currentValue === value;
          }
        }

        if (capture.vehicle) {
          for (const key of Object.keys(
            VEHICLE_LABELS,
          ) as (keyof IntakeCaptureVehicleFields)[]) {
            const value = trimOrNull(capture.vehicle[key]);
            if (!value) continue;
            const targetKey = VEHICLE_TARGET_KEY[key];
            const currentValue = trimOrNull(currentVehicle[targetKey] ?? null);
            nextRows.push({
              key: `vehicle.${key}`,
              label: VEHICLE_LABELS[key],
              group: "vehicle",
              value,
              currentValue,
            });
            nextAccepted[`vehicle.${key}`] =
              !currentValue || currentValue === value;
          }

          void previewVehicleCaptureMatch({
            vehicle: capture.vehicle,
            customerId,
            vehicleId,
          }).then(setMatchPreview);
        }

        setRows(nextRows);
        setAccepted(nextAccepted);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not read that document.",
        );
      } finally {
        setBusy(false);
      }
    },
    [currentCustomer, currentVehicle, customerId, reset, vehicleId],
  );

  const toggleField = useCallback((key: string) => {
    setAccepted((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // A different vehicle is already selected (vehicleId is set) and the
  // duplicate check found a *different* vehicle record — owned by the same
  // customer — matching this VIN/plate. Applying vin/plate here would
  // silently rewrite the selected vehicle's identity with the matched
  // vehicle's, rather than switching to it. Lock those two fields off
  // instead: the advisor must pick the matched vehicle via the vehicle
  // search first if that's the one this scan actually belongs to.
  const identityFieldsLocked = Boolean(
    matchPreview?.kind === "same_customer" && vehicleId,
  );

  useEffect(() => {
    if (!identityFieldsLocked) return;
    setAccepted((prev) => {
      if (!prev["vehicle.vin"] && !prev["vehicle.plate"]) return prev;
      return { ...prev, "vehicle.vin": false, "vehicle.plate": false };
    });
  }, [identityFieldsLocked]);

  const handleApply = useCallback(() => {
    if (!file || !rows) return;

    const customer: Partial<IntakeCaptureCustomerFields> = {};
    const vehicle: RegistrationScanApplyResult["vehicle"] = {};

    for (const row of rows) {
      if (!accepted[row.key]) continue;
      const [group, field] = row.key.split(".") as [
        "customer" | "vehicle",
        string,
      ];
      if (group === "customer") {
        (customer as Record<string, string | null>)[field] = row.value;
      } else {
        const targetKey =
          VEHICLE_TARGET_KEY[field as keyof IntakeCaptureVehicleFields];
        (vehicle as Record<string, string | null>)[targetKey] = row.value;
      }
    }

    onApply({ customer, vehicle, file });
    close();
  }, [accepted, close, file, onApply, rows]);

  const anyAccepted = rows?.some((row) => accepted[row.key]) ?? false;

  return (
    <>
      {children ? (
        <span
          onClick={() => setOpen(true)}
          role="button"
          style={{ cursor: "pointer" }}
        >
          {children}
        </span>
      ) : null}

      <ModalShell
        isOpen={open}
        onClose={close}
        title="Scan Registration"
        size="md"
        busy={busy}
        onSubmit={rows && rows.length > 0 ? handleApply : undefined}
        submitText="Apply to work order"
        footerLeft={
          rows && rows.length > 0 && !anyAccepted
            ? "Select at least one field to apply."
            : undefined
        }
      >
        <div className="space-y-4">
          {!file ? (
            <div className="space-y-2">
              <p className="text-sm text-[color:var(--theme-text-secondary)]">
                Take a photo of the vehicle registration or insurance card.
                Customer and vehicle fields will be read automatically — you
                choose what to apply.
              </p>
              <label className="block cursor-pointer rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-6 text-center text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]">
                Capture or choose a photo
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null;
                    void handleFile(picked);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Captured document"
                    className="h-16 w-16 rounded-lg border border-[color:var(--theme-border-soft)] object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1 text-xs text-[color:var(--theme-text-secondary)]">
                  <div className="truncate font-medium text-[color:var(--theme-text-primary)]">
                    {file.name}
                  </div>
                  {busy ? "Reading document…" : "Document read."}
                </div>
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy}
                  className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs font-semibold hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-50"
                >
                  Retake
                </button>
              </div>

              {error ? (
                <div className="rounded-lg border border-red-500/35 bg-red-950/25 px-3 py-2 text-xs text-red-100">
                  {error}
                </div>
              ) : null}

              {warnings.map((w) => (
                <div
                  key={w}
                  className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-100"
                >
                  {w}
                </div>
              ))}

              {matchPreview && matchPreview.kind === "different_customer" ? (
                <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
                  This VIN/plate is already on file for {matchPreview.label}.
                  Double-check before saving — a VIN already assigned
                  elsewhere blocks saving, but a matching plate alone may
                  not.
                </div>
              ) : matchPreview && matchPreview.kind === "same_customer" ? (
                <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
                  This looks like an existing vehicle on file:{" "}
                  {matchPreview.label}.{" "}
                  {identityFieldsLocked
                    ? "A different vehicle is currently selected, so the VIN/plate from this scan won't be applied — select that vehicle first if this scan belongs to it."
                    : "Applying will update that record instead of creating a new one."}
                </div>
              ) : null}

              {rows && rows.length > 0 ? (
                <div className="space-y-3">
                  <FieldGroup
                    title="Customer"
                    rows={rows.filter((r) => r.group === "customer")}
                    accepted={accepted}
                    onToggle={toggleField}
                    disabledKeys={
                      identityFieldsLocked
                        ? new Set(["vehicle.vin", "vehicle.plate"])
                        : undefined
                    }
                  />
                  <FieldGroup
                    title="Vehicle"
                    rows={rows.filter((r) => r.group === "vehicle")}
                    accepted={accepted}
                    onToggle={toggleField}
                    disabledKeys={
                      identityFieldsLocked
                        ? new Set(["vehicle.vin", "vehicle.plate"])
                        : undefined
                    }
                  />
                </div>
              ) : rows && rows.length === 0 && !busy ? (
                <div className={ui.emptyState}>
                  No readable fields were found. Try a clearer photo, or
                  enter the details manually below.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </ModalShell>
    </>
  );
}

function FieldGroup({
  title,
  rows,
  accepted,
  onToggle,
  disabledKeys,
}: {
  title: string;
  rows: FieldRow[];
  accepted: Record<string, boolean>;
  onToggle: (key: string) => void;
  disabledKeys?: Set<string>;
}) {
  if (!rows.length) return null;

  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)]">
      <div className="border-b border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
        {title}
      </div>
      <ul className="divide-y divide-[color:var(--theme-border-soft)]">
        {rows.map((row) => {
          const isDisabled = disabledKeys?.has(row.key) ?? false;
          return (
            <li key={row.key} className="flex items-start gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={Boolean(accepted[row.key])}
                onChange={() => onToggle(row.key)}
                disabled={isDisabled}
                className="mt-0.5 h-4 w-4 rounded border-[color:var(--desktop-border)] disabled:opacity-40"
              />
              <div className="min-w-0 flex-1 text-sm">
                <div
                  className={
                    isDisabled
                      ? "text-[color:var(--theme-text-muted)]"
                      : "text-[color:var(--theme-text-primary)]"
                  }
                >
                  {row.label}: <span className="font-semibold">{row.value}</span>
                </div>
                {isDisabled ? (
                  <div className="text-xs text-[color:var(--theme-text-muted)]">
                    Matches a different existing vehicle — see note above.
                  </div>
                ) : row.currentValue && row.currentValue !== row.value ? (
                  <div className="text-xs text-amber-300">
                    Current value: {row.currentValue}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
