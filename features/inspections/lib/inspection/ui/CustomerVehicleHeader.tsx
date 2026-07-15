// features/inspections/lib/inspection/ui/CustomerVehicleHeader.tsx
"use client";

type Customer = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  color?: string | null;
  mileage?: string | null;
  unit_number?: string | null;
  odometer?: string | null; // included since some pages pass this
};

type Props = {
  /** e.g. "Maintenance 50 (Hydraulic)" */
  templateName: string;
  customer?: Customer | null;
  vehicle?: Vehicle | null;
  /** Optional right-side content (buttons, etc.) */
  rightSlot?: React.ReactNode;
};

export default function CustomerVehicleHeader({
  templateName,
  customer,
  vehicle,
  rightSlot,
}: Props) {
  const fullName =
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() || "—";

  const addr =
    [customer?.address, customer?.city, customer?.province, customer?.postal_code]
      .filter(Boolean)
      .join(", ") || "";

  const vehicleLabel =
    [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() ||
    vehicle?.vin ||
    "—";

  const subBits = [
    vehicle?.license_plate ? `Plate: ${vehicle.license_plate}` : null,
    vehicle?.vin ? `VIN: ${vehicle.vin}` : null,
    vehicle?.unit_number ? `Unit: ${vehicle.unit_number}` : null,
    vehicle?.odometer ? `Odo: ${vehicle.odometer}` : null,
    vehicle?.mileage ? `Mileage: ${vehicle.mileage}` : null,
    vehicle?.color ? `Color: ${vehicle.color}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mt-3 border-t border-[color:var(--theme-border-soft)] pt-3">
      {(templateName || rightSlot) && (
      <div className="mb-2 flex items-start justify-between gap-3">
        {templateName ? <h1 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">{templateName}</h1> : <span />}
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
      )}

      <div className="grid gap-3 text-sm md:grid-cols-2">
        {/* Customer */}
        <div className="rounded-xl bg-[color:var(--theme-surface-inset)] px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Customer / Fleet</div>
          <div className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">{fullName}</div>
          <div className="text-xs text-[color:var(--theme-text-secondary)]">
            {[customer?.phone, customer?.email].filter(Boolean).join(" · ") || "—"}
          </div>
          {addr ? <div className="text-xs text-[color:var(--theme-text-secondary)]">{addr}</div> : null}
        </div>

        {/* Vehicle */}
        <div className="rounded-xl bg-[color:var(--theme-surface-inset)] px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Vehicle</div>
          <div className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">{vehicleLabel}</div>
          <div className="text-xs text-[color:var(--theme-text-secondary)]">{subBits.join(" · ") || "—"}</div>
        </div>
      </div>
    </div>
  );
}
