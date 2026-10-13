import "server-only";

import { EquipmentAssetProfileError } from "@/features/equipment/server/equipmentAssetProfileService";
import { componentJson } from "@/features/equipment/server/equipmentComponentRoutes";
import { EquipmentPmError } from "@/features/equipment/server/equipmentPmService";

/** Maps PM service errors to responses; unexpected errors are logged. */
export function pmServiceFailure(error: unknown, fallback: string) {
  if (error instanceof EquipmentPmError || error instanceof EquipmentAssetProfileError) {
    return componentJson({ error: error.message }, error.status);
  }
  console.error("[equipment/pm] unexpected failure", error);
  return componentJson({ error: fallback }, 500);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body = (await request.json().catch(() => null)) as unknown;
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}
