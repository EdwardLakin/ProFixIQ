import "server-only";

import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import { componentJson } from "@/features/equipment/server/equipmentComponentRoutes";
import { EquipmentMeterError } from "@/features/equipment/server/equipmentMeterService";
import { EquipmentPmError } from "@/features/equipment/server/equipmentPmService";

/** Maps meter (and the PM loader's) service errors to responses; unexpected errors are logged. */
export function meterServiceFailure(error: unknown, fallback: string) {
  if (
    error instanceof EquipmentMeterError ||
    error instanceof EquipmentPmError ||
    error instanceof EquipmentAssetProfileError
  ) {
    return componentJson({ error: error.message }, error.status);
  }
  console.error("[equipment/meters] unexpected failure", error);
  return componentJson({ error: fallback }, 500);
}
