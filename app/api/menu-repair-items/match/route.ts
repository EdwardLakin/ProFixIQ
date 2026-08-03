import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  COMPLETED_REPAIR_SOURCE,
  COMPLETED_REPAIR_STATUSES,
  matchesCompletedRepairVehicle,
} from "@/features/menu-repair-items/lib/completedRepair";


type Body = {
  workOrderId?: string;
  description?: string;
  notes?: string | null;
  section?: string | null;
  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
    fuel_type?: string | null;
  } | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function n(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function norm(v: unknown): string {
  return s(v).toLowerCase();
}

function tokenize(...parts: Array<unknown>): string[] {
  return parts
    .map((p) => norm(p))
    .join(" ")
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 24);
}

function scoreText(tokens: string[], haystack: string): number {
  const h = haystack.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (h.includes(token)) score += 4;
  }

  if (tokens.length >= 2) {
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`;
      if (h.includes(phrase)) score += 8;
    }
  }

  return score;
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const body = (await req.json().catch(() => null)) as Body | null;

    const description = s(body?.description);
    const notes = s(body?.notes);
    const section = s(body?.section);
    const year = n(body?.vehicle?.year);
    const make = norm(body?.vehicle?.make);
    const model = norm(body?.vehicle?.model);
    const engine = norm(body?.vehicle?.engine);
    const drivetrain = norm(body?.vehicle?.drivetrain);
    const transmission = norm(body?.vehicle?.transmission);

    const query = [description, notes, section].filter(Boolean).join(" ").trim();
    if (!query) {
      return NextResponse.json({ ok: true, match: null, suggestions: [] });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
    }

    const shopId = s((profile as { shop_id?: unknown } | null)?.shop_id);
    if (!shopId) {
      return NextResponse.json({ ok: true, match: null, suggestions: [] });
    }

    const { data: rows, error } = await supabase
      .from("menu_repair_items")
      .select([
        "id",
        "name",
        "complaint",
        "cause",
        "correction",
        "vehicle_year",
        "vehicle_make",
        "vehicle_model",
        "engine",
        "drivetrain",
        "transmission",
        "labor_hours",
        "parts",
        "usage_count",
        "price_estimate",
        "source_work_order_line_id",
        "last_pricing_source",
      ].join(","))
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .eq("last_pricing_source", COMPLETED_REPAIR_SOURCE)
      .limit(200);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const sourceLineIds = [
      ...new Set(
        (rows ?? [])
          .map((row) => (isRecord(row) ? s(row.source_work_order_line_id) : ""))
          .filter(Boolean),
      ),
    ];
    const completedSourceIds = new Set<string>();
    if (sourceLineIds.length > 0) {
      const { data: sourceLines, error: sourceError } = await supabase
        .from("work_order_lines")
        .select("id, status")
        .eq("shop_id", shopId)
        .in("id", sourceLineIds)
        .in("status", [...COMPLETED_REPAIR_STATUSES]);
      if (sourceError) {
        return NextResponse.json({ ok: false, error: sourceError.message }, { status: 500 });
      }
      for (const line of sourceLines ?? []) completedSourceIds.add(line.id);
    }

    const tokens = tokenize(description, notes, section);

    const ranked = (rows ?? [])
      .map((row) => {
        if (!isRecord(row)) return null;
        if (s(row.last_pricing_source) !== COMPLETED_REPAIR_SOURCE) return null;
        if (!completedSourceIds.has(s(row.source_work_order_line_id))) return null;
        if (
          !matchesCompletedRepairVehicle(
            { year, make, model, engine, drivetrain, transmission },
            {
              year: n(row.vehicle_year),
              make: s(row.vehicle_make),
              model: s(row.vehicle_model),
              engine: s(row.engine),
              drivetrain: s(row.drivetrain),
              transmission: s(row.transmission),
            },
          )
        ) {
          return null;
        }

        const repairTextScore = scoreText(
          tokens,
          [
            s(row.name),
            s(row.complaint),
            s(row.cause),
            s(row.correction),
          ].join(" "),
        );
        if (repairTextScore <= 0) return null;

        let score = repairTextScore;

        if (year != null && n(row.vehicle_year) != null && year === n(row.vehicle_year)) {
          score += 20;
        }
        if (make && make === norm(row.vehicle_make)) score += 20;
        if (model && model === norm(row.vehicle_model)) score += 20;
        if (engine && engine === norm(row.engine)) score += 10;
        if (drivetrain && drivetrain === norm(row.drivetrain)) score += 10;
        if (transmission && transmission === norm(row.transmission)) score += 10;

        score += Math.min(20, (n(row.usage_count) ?? 0) * 2);

        return {
          id: s(row.id),
          label: s(row.name) || s(row.complaint) || "Matched repair",
          complaint: s(row.complaint) || null,
          correction: s(row.correction) || s(row.cause) || null,
          laborHours: n(row.labor_hours),
          parts: Array.isArray(row.parts) ? row.parts : [],
          priceEstimate: n(row.price_estimate),
          usageCount: n(row.usage_count) ?? 0,
          vehicle: {
            year: n(row.vehicle_year),
            make: s(row.vehicle_make),
            model: s(row.vehicle_model),
            engine: s(row.engine) || null,
            drivetrain: s(row.drivetrain) || null,
          },
          score,
        };
      })
      .filter((x): x is {
        id: string;
        label: string;
        complaint: string | null;
        correction: string | null;
        laborHours: number | null;
        parts: unknown[];
        priceEstimate: number | null;
        usageCount: number;
        vehicle: {
          year: number | null;
          make: string;
          model: string;
          engine: string | null;
          drivetrain: string | null;
        };
        score: number;
      } => Boolean(x && x.id && x.label && x.score >= 20))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return NextResponse.json({
      ok: true,
      match: ranked[0] ?? null,
      suggestions: ranked,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
