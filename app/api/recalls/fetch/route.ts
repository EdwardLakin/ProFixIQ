import { NextResponse } from "next/server";

import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import {
  fetchNhtsaRecalls,
  NhtsaRecallFetchError,
  toVehicleRecallRows,
} from "@/features/vehicles/server/recallFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecallRequest = { vehicleId?: unknown };
type VehicleScope = {
  id: string;
  shop_id: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
};

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function safeVehicleText(value: string | null, maxLength: number): string | null {
  const normalized = value?.trim() ?? "";
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ROLE_GROUPS.workOrderCreators,
  });

  if (!access.ok) {
    access.response.headers.set("Cache-Control", "no-store");
    return access.response;
  }

  const body = (await request.json().catch(() => null)) as RecallRequest | null;
  const vehicleId =
    typeof body?.vehicleId === "string" ? body.vehicleId.trim() : "";

  if (!UUID_PATTERN.test(vehicleId)) {
    return json({ ok: false, error: "A valid vehicleId is required." }, 400);
  }

  const shopId = access.profile.shop_id;
  const { data: vehicle, error: vehicleError } = await access.supabase
    .from("vehicles")
    .select("id, shop_id, vin, year, make, model")
    .eq("id", vehicleId)
    .eq("shop_id", shopId)
    .maybeSingle<VehicleScope>();

  if (vehicleError) {
    console.error("recall_fetch_vehicle_lookup_failed", {
      vehicleId,
      shopId,
      code: vehicleError.code,
    });
    return json({ ok: false, error: "Recall lookup is temporarily unavailable." }, 503);
  }

  if (!vehicle) {
    return json({ ok: false, error: "Vehicle not found." }, 404);
  }

  const normalizedVin = normalizeVinInput(vehicle.vin);
  const make = safeVehicleText(vehicle.make, 80);
  const model = safeVehicleText(vehicle.model, 120);
  const currentYear = new Date().getUTCFullYear();
  const year = vehicle.year;

  if (
    !normalizedVin.isValid ||
    !make ||
    !model ||
    !Number.isInteger(year) ||
    (year as number) < 1900 ||
    (year as number) > currentYear + 2
  ) {
    return json(
      {
        ok: false,
        error: "The saved vehicle needs a valid VIN, year, make, and model before recalls can be checked.",
      },
      422,
    );
  }

  const admin = createAdminSupabase();
  const { data: quotaRows, error: quotaError } = await admin.rpc(
    "consume_vehicle_recall_fetch_quota",
    {
      p_actor_id: access.profile.id,
      p_shop_id: shopId,
      p_vehicle_id: vehicle.id,
    },
  );

  if (quotaError) {
    console.error("recall_fetch_quota_failed", {
      vehicleId,
      shopId,
      code: quotaError.code,
    });
    return json({ ok: false, error: "Recall lookup is temporarily unavailable." }, 503);
  }

  const quota = quotaRows?.[0];
  if (!quota?.allowed) {
    const retryAfter = Math.max(1, quota?.retry_after_seconds ?? 60);
    return json(
      { ok: false, error: "Recall lookup limit reached. Please try again later." },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  try {
    const recalls = await fetchNhtsaRecalls({
      year: year as number,
      make,
      model,
    });
    const rows = toVehicleRecallRows(recalls, {
      actorId: access.profile.id,
      make,
      model,
      shopId,
      vehicleId: vehicle.id,
      vin: normalizedVin.vin,
      year: year as number,
    });

    if (rows.length > 0) {
      const { error: upsertError } = await admin.from("vehicle_recalls").upsert(rows, {
        onConflict: "shop_id,vehicle_id,campaign_number",
      });

      if (upsertError) {
        console.error("recall_fetch_upsert_failed", {
          vehicleId,
          shopId,
          code: upsertError.code,
        });
        return json({ ok: false, error: "Recall data could not be saved." }, 503);
      }
    }

    return json({ ok: true, vehicleId: vehicle.id, count: rows.length });
  } catch (error) {
    const isTimeout =
      error instanceof NhtsaRecallFetchError && error.kind === "timeout";
    console.error("recall_fetch_upstream_failed", {
      vehicleId,
      shopId,
      kind:
        error instanceof NhtsaRecallFetchError ? error.kind : "unexpected",
    });
    return json(
      { ok: false, error: "The recall provider is temporarily unavailable." },
      isTimeout ? 504 : 502,
    );
  }
}
