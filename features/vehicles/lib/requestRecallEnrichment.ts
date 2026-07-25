const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestVehicleRecallEnrichment(
  vehicleId: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!UUID_PATTERN.test(vehicleId)) return false;

  try {
    const response = await fetcher("/api/recalls/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId }),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}
