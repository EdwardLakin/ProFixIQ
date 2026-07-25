import "server-only";

import type { Database } from "@shared/types/types/supabase";

const NHTSA_RECALLS_ENDPOINT = "https://api.nhtsa.gov/recalls/recallsByVehicle";
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_RESULTS = 500;

type RecallInsert = Database["public"]["Tables"]["vehicle_recalls"]["Insert"];

export type RecallVehicleQuery = {
  year: number;
  make: string;
  model: string;
};

export type VehicleRecallScope = RecallVehicleQuery & {
  actorId: string;
  shopId: string;
  vehicleId: string;
  vin: string;
};

export type NhtsaRecall = Record<string, unknown>;

type RecallFetchOptions = {
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
};

export class NhtsaRecallFetchError extends Error {
  constructor(
    readonly kind: "timeout" | "upstream" | "invalid_response",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "NhtsaRecallFetchError";
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function text(value: unknown, maxLength = 10_000): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function campaignNumber(recall: NhtsaRecall): string | null {
  return text(
    recall.NHTSACampaignNumber ??
      recall.NHTSACampaign ??
      recall.CampaignNumber ??
      recall.campaignNumber,
    64,
  )?.toUpperCase() ?? null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function buildNhtsaRecallUrl(vehicle: RecallVehicleQuery): string {
  const params = new URLSearchParams({
    make: vehicle.make,
    model: vehicle.model,
    modelYear: String(vehicle.year),
  });
  return `${NHTSA_RECALLS_ENDPOINT}?${params.toString()}`;
}

export async function fetchNhtsaRecalls(
  vehicle: RecallVehicleQuery,
  options: RecallFetchOptions = {},
): Promise<NhtsaRecall[]> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? delay;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = buildNhtsaRecallUrl(vehicle);
  let lastError: NhtsaRecallFetchError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetcher(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const contentLength = Number(response.headers.get("content-length") ?? "0");

      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new NhtsaRecallFetchError(
          "invalid_response",
          "NHTSA response exceeded the permitted size.",
          false,
        );
      }

      if (!response.ok) {
        lastError = new NhtsaRecallFetchError(
          "upstream",
          `NHTSA returned HTTP ${response.status}.`,
          RETRYABLE_STATUS_CODES.has(response.status),
        );
        throw lastError;
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new NhtsaRecallFetchError(
          "invalid_response",
          "NHTSA returned an invalid response.",
          true,
        );
      }

      const results = (payload as { results?: unknown }).results;
      if (!Array.isArray(results)) {
        throw new NhtsaRecallFetchError(
          "invalid_response",
          "NHTSA response did not include recall results.",
          true,
        );
      }

      return results
        .filter(
          (item): item is NhtsaRecall =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .slice(0, MAX_RESULTS);
    } catch (error) {
      if (isAbortError(error)) {
        lastError = new NhtsaRecallFetchError(
          "timeout",
          "NHTSA recall lookup timed out.",
          true,
        );
      } else if (error instanceof NhtsaRecallFetchError) {
        lastError = error;
      } else {
        lastError = new NhtsaRecallFetchError(
          "upstream",
          "NHTSA recall lookup failed.",
          true,
        );
      }

      if (attempt < MAX_ATTEMPTS && lastError.retryable) {
        await sleep(150 * attempt);
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ??
    new NhtsaRecallFetchError("upstream", "NHTSA recall lookup failed.", false)
  );
}

export function toVehicleRecallRows(
  recalls: NhtsaRecall[],
  vehicle: VehicleRecallScope,
): RecallInsert[] {
  const unique = new Map<string, RecallInsert>();

  for (const recall of recalls) {
    const campaign = campaignNumber(recall);
    if (!campaign) continue;

    unique.set(campaign, {
      campaign_number: campaign,
      component: text(recall.Component),
      consequence: text(recall.Consequence ?? recall.Conequence),
      make: vehicle.make,
      manufacturer: text(recall.Manufacturer, 255),
      model: vehicle.model,
      model_year: String(vehicle.year),
      nhtsa_campaign: campaign,
      notes: text(recall.Notes),
      remedy: text(recall.Remedy),
      report_date: text(recall.ReportReceivedDate ?? recall.ReportDate, 64),
      shop_id: vehicle.shopId,
      summary: text(recall.Summary),
      user_id: vehicle.actorId,
      vehicle_id: vehicle.vehicleId,
      vin: vehicle.vin,
    });
  }

  return [...unique.values()];
}
