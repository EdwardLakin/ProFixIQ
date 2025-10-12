// features/work-orders/state/mergeFromOcr.ts
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";

export function mergeFromOcr(fields: Record<string, string | null | undefined>) {
  const setVehicle = useWorkOrderDraft.getState().setVehicle;
  const setCustomer = useWorkOrderDraft.getState().setCustomer;

  setVehicle({
    vin: fields.vin ?? undefined,
    plate: fields.plate ?? undefined,
    year: fields.year ?? undefined,
    make: fields.make ?? undefined,
    model: fields.model ?? undefined
  });

  setCustomer({
    first_name: fields.first_name ?? undefined,
    last_name: fields.last_name ?? undefined,
    phone: fields.phone ?? undefined,
    email: fields.email ?? undefined
  });
}