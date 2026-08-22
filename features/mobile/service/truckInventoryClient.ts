import type {
  FieldCatalogPart,
  FieldPartIdentityResult,
  FieldTruckInventoryItem,
  FieldTruckInventorySnapshot,
} from "./truckInventoryContracts";
import type { IdentityDraft } from "./truckInventoryUi";

export function randomInventoryKey(prefix: string): string {
  const entropy =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${entropy}`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | T
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && "error" in body && body.error
        ? String(body.error)
        : "Field inventory request failed.",
    );
  }
  return body as T;
}

export function localPartByCode(
  snapshot: FieldTruckInventorySnapshot,
  code: string,
): FieldTruckInventoryItem | FieldCatalogPart | null {
  const normalized = code.trim().toLowerCase();
  const all = [...snapshot.items, ...snapshot.catalog];
  return (
    all.find((part) =>
      [part.partNumber, part.sku, ...part.barcodes]
        .filter(Boolean)
        .some(
          (identity) => String(identity).trim().toLowerCase() === normalized,
        ),
    ) ?? null
  );
}

export async function fetchTruckInventorySnapshot(args: {
  search?: string;
  serviceVehicleId?: string;
  signal?: AbortSignal;
}): Promise<FieldTruckInventorySnapshot> {
  const params = new URLSearchParams();
  if (args.search?.trim()) params.set("query", args.search.trim());
  if (args.serviceVehicleId)
    params.set("serviceVehicleId", args.serviceVehicleId);
  const response = await fetch(
    `/api/mobile/service/truck-inventory?${params.toString()}`,
    { credentials: "include", cache: "no-store", signal: args.signal },
  );
  return responseJson<FieldTruckInventorySnapshot>(response);
}

export async function resolveTruckPartCode(
  code: string,
): Promise<FieldPartIdentityResult> {
  const response = await fetch("/api/mobile/service/truck-inventory/resolve", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomInventoryKey("field-part-resolve"),
    },
    body: JSON.stringify({ code, provider: "barcode" }),
  });
  return responseJson<FieldPartIdentityResult>(response);
}

export async function createTruckPartIdentity(
  draft: IdentityDraft,
): Promise<FieldPartIdentityResult> {
  const response = await fetch("/api/mobile/service/truck-inventory/resolve", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomInventoryKey("field-part-create"),
    },
    body: JSON.stringify({
      code: draft.code,
      provider: "barcode",
      name: draft.name,
      partNumber: draft.partNumber || draft.code,
      manufacturer: draft.manufacturer || null,
      unitCost: draft.unitCost || null,
      unitSellPrice: draft.unitSellPrice || null,
      createIfMissing: true,
      metadata: { source: "field_service_inline_scan" },
    }),
  });
  return responseJson<FieldPartIdentityResult>(response);
}

export async function transferTruckPart(args: {
  serviceVehicleId: string;
  sourceLocationId: string;
  partId: string;
  quantity: number;
}): Promise<void> {
  const response = await fetch("/api/mobile/service/truck-inventory/transfer", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomInventoryKey("field-truck-transfer"),
    },
    body: JSON.stringify(args),
  });
  await responseJson<Record<string, unknown>>(response);
}

export async function receiveTruckPart(args: {
  serviceVehicleId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  quantity: number;
}): Promise<void> {
  const response = await fetch("/api/mobile/service/truck-inventory/receive", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomInventoryKey("field-truck-receive"),
    },
    body: JSON.stringify(args),
  });
  await responseJson<Record<string, unknown>>(response);
}
