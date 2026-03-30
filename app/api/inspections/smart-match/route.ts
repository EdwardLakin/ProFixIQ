import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  item?: string;
  notes?: string;
  section?: string;
  status?: string;
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

type MenuRepairMatchRow = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  | "id"
  | "name"
  | "complaint"
  | "correction"
  | "labor_hours"
  | "parts"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "engine"
  | "drivetrain"
  | "transmission"
  | "usage_count"
>;

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asYear(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function tokenize(v: string): string[] {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function overlapScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a)) return 90;
  if (a.includes(b)) return 75;

  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let overlap = 0;
  for (const tok of ta) {
    if (tb.has(tok)) overlap += 1;
  }

  const ratio = overlap / Math.max(ta.size, tb.size);
  return Math.round(ratio * 60);
}

function normalizeParts(
  raw: unknown,
): Array<{ name: string; qty: number }> {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((part) => {
      const row = (part ?? {}) as {
        name?: unknown;
        description?: unknown;
        item?: unknown;
        qty?: unknown;
        quantity?: unknown;
      };

      const name =
        safeTrim(row.name) ||
        safeTrim(row.description) ||
        safeTrim(row.item);

      if (!name) return null;

      const qty =
        typeof row.qty === "number" && Number.isFinite(row.qty)
          ? row.qty
          : typeof row.quantity === "number" && Number.isFinite(row.quantity)
            ? row.quantity
            : 1;

      return { name, qty: qty > 0 ? qty : 1 };
    })
    .filter((v): v is { name: string; qty: number } => Boolean(v));
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const body = (await req.json().catch(() => null)) as Body | null;

    const item = txt(body?.item);
    const notes = txt(body?.notes);
    const section = txt(body?.section);
    const status = txt(body?.status);

    const year = asYear(body?.vehicle?.year);
    const make = txt(body?.vehicle?.make);
    const model = txt(body?.vehicle?.model);
    const engine = txt(body?.vehicle?.engine);
    const drivetrain = txt(body?.vehicle?.drivetrain);
    const transmission = txt(body?.vehicle?.transmission);

    const queryText = [item, notes, section, status].filter(Boolean).join(" ").trim();

    if (!queryText) {
      return NextResponse.json({ match: null });
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ match: null }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.shop_id) {
      return NextResponse.json({ match: null });
    }

    const { data: rows, error } = await supabase
      .from("menu_repair_items")
      .select(
        "id, name, complaint, correction, labor_hours, parts, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission, usage_count",
      )
      .eq("shop_id", profile.shop_id)
      .eq("is_active", true)
      .order("usage_count", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { match: null, error: error.message },
        { status: 400 },
      );
    }

    const ranked = ((rows ?? []) as MenuRepairMatchRow[])
      .map((row) => {
        const haystack = [
          txt(row.name),
          txt(row.complaint),
          txt(row.correction),
        ]
          .filter(Boolean)
          .join(" ");

        let score = overlapScore(queryText, haystack);

        if (make && txt(row.vehicle_make) === make) score += 18;
        if (model && txt(row.vehicle_model) === model) score += 18;
        if (year && row.vehicle_year === year) score += 12;
        if (engine && txt(row.engine) === engine) score += 8;
        if (drivetrain && txt(row.drivetrain) === drivetrain) score += 7;
        if (transmission && txt(row.transmission) === transmission) score += 7;

        const usageBoost =
          typeof row.usage_count === "number" && row.usage_count > 1
            ? Math.min(row.usage_count, 10)
            : 0;

        score += usageBoost;

        return { row, score };
      })
      .filter((entry) => entry.score >= 35)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      return NextResponse.json({ match: null });
    }

    const top = ranked[0].row;
    const topScore = ranked[0].score;

    const confidence =
      topScore >= 95 ? 0.95 :
      topScore >= 75 ? 0.82 :
      topScore >= 55 ? 0.67 :
      0.45;

    return NextResponse.json({
      match: {
        id: String(top.id),
        label: top.name ?? top.complaint ?? "Matched repair",
        complaint: top.complaint ?? null,
        correction: top.correction ?? null,
        laborHours:
          typeof top.labor_hours === "number" ? top.labor_hours : null,
        parts: normalizeParts(top.parts),
        score: topScore,
        confidence,
        menuItemId: String(top.id),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        match: null,
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}
