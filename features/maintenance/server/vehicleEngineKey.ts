/**
 * Engine key a vehicle's maintenance schedule is stored and matched under: the
 * engine family when present, otherwise the manually entered engine (e.g.
 * "DD15"). The generate-rules route and the suggestions lookup both use this,
 * so rules generated when a vehicle is saved are the ones found later.
 */
export function vehicleEngineKey(vehicle: {
  engine_family?: string | null;
  engine?: string | null;
}): string | null {
  return vehicle.engine_family?.trim() || vehicle.engine?.trim() || null;
}
