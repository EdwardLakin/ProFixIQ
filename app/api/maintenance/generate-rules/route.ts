// app/api/maintenance/generate-rules/route.ts
import { aiBudgetStopResponse, isAIBudgetStop } from "@/features/shared/lib/server/ai-governance";
import "server-only";
import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";
import { withAITelemetryContext } from "@/features/shared/lib/server/ai-telemetry-context";
import { generateMaintenanceRulesForVehicle } from "@/features/maintenance/server/generateMaintenanceRules";
import { vehicleEngineKey } from "@/features/maintenance/server/vehicleEngineKey";
import { escapeLike } from "@/features/maintenance/server/escapeLike";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";


export const runtime = "nodejs";

type GenerateBody = {
  year?: number;
  make?: string;
  model?: string;
  engineFamily?: string | null;
  forceRefresh?: boolean;
};

function parseBody(json: unknown): GenerateBody {
  if (typeof json !== "object" || json === null) return {};
  const obj = json as Record<string, unknown>;

  const year =
    typeof obj.year === "number" && Number.isFinite(obj.year)
      ? obj.year
      : undefined;

  const make =
    typeof obj.make === "string" && obj.make.trim().length > 0
      ? obj.make.trim()
      : undefined;

  const model =
    typeof obj.model === "string" && obj.model.trim().length > 0
      ? obj.model.trim()
      : undefined;

  const engineFamily =
    typeof obj.engineFamily === "string" &&
    obj.engineFamily.trim().length > 0
      ? obj.engineFamily.trim()
      : null;

  const forceRefresh =
    typeof obj.forceRefresh === "boolean" ? obj.forceRefresh : false;

  return { year, make, model, engineFamily, forceRefresh };
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRSC();

  try {
    const bodyRaw = await req.json().catch(() => null);
    const body = parseBody(bodyRaw);

    if (
      body.year === undefined ||
      body.make === undefined ||
      body.model === undefined
    ) {
      return NextResponse.json(
        { error: "Missing year, make, or model" },
        { status: 400 },
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not signed in" },
        { status: 401 },
      );
    }

    // Charge the generation to the signed-in user's shop AI budget. A failed
    // lookup is not "no shop": without a known shop the spend could not be
    // governed, so refuse (retryable) instead of running the call ungoverned.
    // Imported/legacy staff can be linked through profiles.user_id, so use the
    // canonical resolver rather than assuming profiles.id === auth id.
    const { profile, error: profileError } = await resolveCanonicalStaffProfile(
      supabase,
      user.id,
      { linkedProfileClient: () => createAdminSupabase() },
    );

    if (profileError) {
      return NextResponse.json(
        { error: "Could not verify your shop. Try again." },
        { status: 503 },
      );
    }

    const shopId = profile?.shop_id ?? null;
    if (!shopId) {
      return NextResponse.json(
        { error: "No shop is linked to your account." },
        { status: 403 },
      );
    }

    // The schedule is written to the shared catalog with the service role, so
    // the requested spec must belong to a real vehicle in the caller's shop
    // rather than being whatever the client sent. The engine family comes from
    // that vehicle, which is also the key the suggestions lookup uses.
    const { data: vehicleRows, error: vehicleError } = await supabase
      .from("vehicles")
      .select("make, model, engine_family, engine")
      .eq("shop_id", shopId)
      .eq("year", body.year)
      .ilike("make", escapeLike(body.make))
      .ilike("model", escapeLike(body.model))
      .order("created_at", { ascending: false })
      .limit(20);

    if (vehicleError) {
      return NextResponse.json(
        { error: "Could not verify the vehicle. Try again." },
        { status: 503 },
      );
    }

    const vehicles = (vehicleRows ?? []) as Array<{
      make: string | null;
      model: string | null;
      engine_family: string | null;
      engine: string | null;
    }>;
    if (vehicles.length === 0) {
      return NextResponse.json(
        { error: "No matching vehicle in your shop." },
        { status: 404 },
      );
    }

    const requestedEngine = body.engineFamily?.toLowerCase() ?? null;
    const matchedVehicle =
      (requestedEngine
        ? vehicles.find(
            (v) =>
              v.engine_family?.toLowerCase() === requestedEngine ||
              v.engine?.toLowerCase() === requestedEngine,
          )
        : null) ?? vehicles[0];

    // Persist the stored vehicle's own make/model/engine, not the client's
    // strings: the lookup above is case-insensitive but the schedule cache and
    // its unique key are not, so differently-cased requests would otherwise
    // create duplicate global rule sets.
    const make = matchedVehicle.make?.trim() || (body.make as string);
    const model = matchedVehicle.model?.trim() || (body.model as string);
    const engineKey = vehicleEngineKey(matchedVehicle);

    const { servicesInserted, rulesInserted } = await withAITelemetryContext(
      {
        endpoint: "/api/maintenance/generate-rules",
        shopId,
        userId: user.id,
      },
      () =>
        generateMaintenanceRulesForVehicle({
          supabase,
          // maintenance_rules / maintenance_services are read-only to
          // `authenticated`; the caller and vehicle were authorized above, so
          // write the shared catalog rows with the service role.
          writeClient: createAdminSupabase(),
          year: body.year as number,
          make,
          model,
          engineFamily: engineKey,
          // Never let a client force regeneration (repeat AI spend).
          forceRefresh: false,
        }),
    );

    return NextResponse.json({
      ok: true,
      year: body.year,
      make,
      model,
      engineFamily: engineKey,
      servicesInserted,
      rulesInserted,
    });
  } catch (e: unknown) {
    if (isAIBudgetStop(e)) {
      const stop = aiBudgetStopResponse(e);
      return NextResponse.json(stop.body, { status: stop.status });
    }
    const message =
      e instanceof Error ? e.message : "Failed to generate maintenance rules";
    console.error("[maintenance] generate-rules failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}