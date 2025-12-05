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
    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-orange-400">{templateName}</h1>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>

      <div className="grid gap-2 text-sm text-zinc-200 md:grid-cols-2">
        {/* Customer */}
        <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
          <div className="text-zinc-400">Customer</div>
          <div className="font-medium">{fullName}</div>
          <div className="text-zinc-400">
            {[customer?.phone, customer?.email].filter(Boolean).join(" · ") || "—"}
          </div>
          {addr ? <div className="text-zinc-400">{addr}</div> : null}
        </div>

        {/* Vehicle */}
        <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
          <div className="text-zinc-400">Vehicle</div>
          <div className="font-medium">{vehicleLabel}</div>
          <div className="text-zinc-400">{subBits.join(" · ") || "—"}</div>
        </div>
      </div>
    </div>
  );
}