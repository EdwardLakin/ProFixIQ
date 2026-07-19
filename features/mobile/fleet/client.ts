export type MobileFleetUnit = {
  id: string;
  label: string;
  fleetName?: string | null;
  plate?: string | null;
  vin?: string | null;
  status: "in_service" | "limited" | "oos";
  nextInspectionDate?: string | null;
  location?: string | null;
};

export type MobileFleetServiceRequest = {
  id: string;
  vehicleId: string;
  unitLabel: string | null;
  plate: string | null;
  title: string;
  summary: string;
  severity: string | null;
  status: string | null;
  createdAt: string;
  scheduledForDate: string | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !body) {
    throw new Error(body?.error || "The mobile fleet request failed.");
  }
  return body;
}

export async function fetchMobileFleetUnits(): Promise<MobileFleetUnit[]> {
  const response = await fetch("/api/fleet/units", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const body = await readJson<{ units?: MobileFleetUnit[] }>(response);
  return body.units ?? [];
}

export async function fetchMobileFleetServiceRequests(): Promise<
  MobileFleetServiceRequest[]
> {
  const response = await fetch("/api/fleet/service-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const body = await readJson<{
    requests?: MobileFleetServiceRequest[];
  }>(response);
  return body.requests ?? [];
}
