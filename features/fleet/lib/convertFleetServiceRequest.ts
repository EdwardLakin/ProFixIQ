export async function convertFleetServiceRequest(
  serviceRequestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(
    "/api/fleet/service-requests/convert-to-work-order",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceRequestId }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    workOrderId?: string;
    error?: string;
  };
  if (!response.ok || !body.workOrderId) {
    throw new Error(body.error || "Unable to create work order");
  }
  return body.workOrderId;
}
