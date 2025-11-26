// app/api/maintenance/generate-rules/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { generateMaintenanceRulesForVehicle } from "@/features/maintenance/server/generateMaintenanceRules";

type DB = Database;

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
  const supabase = createServerComponentClient<DB>({ cookies });

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

    const { servicesInserted, rulesInserted } =
      await generateMaintenanceRulesForVehicle({
        supabase,
        year: body.year,
        make: body.make,
        model: body.model,
        engineFamily: body.engineFamily ?? null,
        forceRefresh: body.forceRefresh ?? false,
      });

    return NextResponse.json({
      ok: true,
      year: body.year,
      make: body.make,
      model: body.model,
      engineFamily: body.engineFamily ?? null,
      servicesInserted,
      rulesInserted,
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to generate maintenance rules";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}