// features/fleet/lib/convertServiceRequestToWorkOrder.ts

export async function convertServiceRequestToWorkOrder(serviceRequestId: string) {
  const res = await fetch(
    "/api/fleet/service-requests/convert-to-work-order",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceRequestId }),
    },
  );

  const data = await res.json().catch(() => ({} as any));

  if (!res.ok) {
    throw new Error(data?.error || "Failed to convert service request");
  }

  return data as { workOrderId: string; status: "converted" | "already_linked" };
}