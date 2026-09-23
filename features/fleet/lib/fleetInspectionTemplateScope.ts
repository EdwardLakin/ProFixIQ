export const FLEET_MAINTENANCE_TEMPLATE_TAG = "fleet-maintenance";
export const FLEET_AUTHORED_TEMPLATE_TAG = "fleet-authored";

export function fleetInspectionTemplateTag(fleetId: string): string {
  return `fleet:${fleetId}`;
}

export function isFleetOwnedInspectionTemplate(
  tags: readonly string[] | null | undefined,
): boolean {
  const values = tags ?? [];
  return (
    values.includes(FLEET_MAINTENANCE_TEMPLATE_TAG) ||
    values.includes(FLEET_AUTHORED_TEMPLATE_TAG)
  );
}

export function isInspectionTemplateAvailableToFleet(
  tags: readonly string[] | null | undefined,
  fleetId: string,
): boolean {
  if (!isFleetOwnedInspectionTemplate(tags)) return true;
  return (tags ?? []).includes(fleetInspectionTemplateTag(fleetId));
}
