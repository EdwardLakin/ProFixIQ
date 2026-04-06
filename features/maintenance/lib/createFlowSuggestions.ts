export type MaintenanceSuggestionRow = {
  code: string;
  title: string;
  description: string;
  laborHours: number;
  priority?: string | null;
};

export async function fetchCreateFlowSuggestions(vehicleId: string) {
  const res = await fetch(`/api/maintenance/suggestions?vehicleId=${encodeURIComponent(vehicleId)}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to load maintenance suggestions.");
  }

  const json = (await res.json().catch(() => null)) as
    | { suggestions?: MaintenanceSuggestionRow[] }
    | null;

  return Array.isArray(json?.suggestions) ? json!.suggestions : [];
}

export async function addMaintenanceBundleToWorkOrder(args: {
  workOrderId: string;
  vehicleId: string;
  items: string[];
}) {
  const res = await fetch("/api/work-orders/maintenance-suggestions/add-bundle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });

  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Failed to add maintenance bundle.");
  }

  return json;
}

export async function dismissMaintenanceSuggestion(args: {
  vehicleId: string;
  serviceCode: string;
  reason: "completed_previously";
}) {
  const res = await fetch("/api/maintenance/suggestions/dismiss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(args),
  });

  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Failed to dismiss suggestion.");
  }

  return json;
}
