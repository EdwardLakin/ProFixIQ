import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  item?: string;
  notes?: string | null;
  section?: string | null;
  status?: "fail" | "recommend" | string | null;
  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    transmission?: string | null;
    drivetrain?: string | null;
    fuel_type?: string | null;
  } | null;
};

type SmartMatchResult = {
  source: "menu_item" | "learned_template" | "work_order_intelligence";
  id: string;
  label: string;
  score: number;
  laborHours: number | null;
  parts: Array<{ name: string; qty: number }>;
  complaint: string | null;
  correction: string | null;
  menuItemId?: string;
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
    .slice(0, 32);
}

function parseParts(raw: unknown): Array<{ name: string; qty: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!isRecord(entry)) return null;

      const name =
        s(entry.name) ||
        s(entry.description) ||
        s(entry.item) ||
        s(entry.label);

      if (!name) return null;

      const qty = n(entry.qty) ?? n(entry.quantity) ?? 1;
      return {
        name,
        qty: qty > 0 ? qty : 1,
      };
    })
    .filter((x): x is { name: string; qty: number } => Boolean(x));
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
      if (h.includes(phrase)) score += 6;
    }
  }

  return score;
}

function vehicleScore(args: {
  queryYear: number | null;
  queryMake: string;
  queryModel: string;
  rowYear: number | null;
  rowMake: string;
  rowModel: string;
}): number {
  let score = 0;

  if (args.queryYear != null && args.rowYear != null && args.queryYear === args.rowYear) {
    score += 18;
  }

  if (args.queryMake && args.rowMake && args.queryMake === args.rowMake) {
    score += 18;
  }

  if (args.queryModel && args.rowModel && args.queryModel === args.rowModel) {
    score += 18;
  }

  return score;
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const body = (await req.json().catch(() => null)) as Body | null;

    const item = s(body?.item);
    const notes = s(body?.notes);
    const section = s(body?.section);
    const status = norm(body?.status);
    const year = n(body?.vehicle?.year);
    const make = norm(body?.vehicle?.make);
    const model = norm(body?.vehicle?.model);

    const queryText = [item, notes, section, status].filter(Boolean).join(" ").trim();
    if (!queryText) {
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

    const tokens = tokenize(item, notes, section, status);

    const suggestions: SmartMatchResult[] = [];

    // 1) vehicle-specific / shop-specific menu repairs
    const { data: menuRows, error: menuError } = await supabase
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
        "is_active",
      ].join(","))
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .limit(200);

    if (menuError) {
      return NextResponse.json({ ok: false, error: menuError.message }, { status: 500 });
    }

    for (const raw of menuRows ?? []) {
      if (!isRecord(raw)) continue;

      const haystack = [
        s(raw.name),
        s(raw.description),
        s(raw.complaint),
        s(raw.correction),
      ].join(" ").trim();

      const score =
        scoreText(tokens, haystack) +
        vehicleScore({
          queryYear: year,
          queryMake: make,
          queryModel: model,
          rowYear: n(raw.vehicle_year),
          rowMake: norm(raw.vehicle_make),
          rowModel: norm(raw.vehicle_model),
        });

      if (score < 18) continue;

      suggestions.push({
        source: "menu_item",
        id: s(raw.id),
        label: s(raw.name) || s(raw.description) || s(raw.complaint) || "Matched repair",
        score,
        laborHours: n(raw.labor_hours) ?? n(raw.base_labor_hours),
        parts: [],
        complaint: s(raw.complaint) || null,
        correction: s(raw.correction) || null,
        menuItemId: s(raw.id),
      });
    }

    // 2) learned repair templates
    const { data: templateRows, error: templateError } = await supabase
      .from("learned_job_templates")
      .select([
        "id",
        "label",
        "job_category",
        "default_labor_hours",
        "default_parts",
        "usage_count",
        "confidence_score",
        "tags",
      ].join(","))
      .eq("shop_id", shopId)
      .limit(150);

    if (!templateError) {
      for (const raw of templateRows ?? []) {
        if (!isRecord(raw)) continue;

        const haystack = [
          s(raw.label),
          s(raw.job_category),
          ...(Array.isArray(raw.tags) ? raw.tags.map((v) => s(v)) : []),
        ].join(" ").trim();

        const score =
          scoreText(tokens, haystack) +
          Math.min(20, Math.round((n(raw.usage_count) ?? 0) * 2)) +
          Math.round((n(raw.confidence_score) ?? 0) * 10);

        if (score < 16) continue;

        suggestions.push({
          source: "learned_template",
          id: s(raw.id),
          label: s(raw.label) || s(raw.job_category) || "Learned repair",
          score,
          laborHours: n(raw.default_labor_hours),
          parts: parseParts(raw.default_parts),
          complaint: null,
          correction: null,
        });
      }
    }

    // 3) raw work order intelligence history
    const { data: intelRows, error: intelError } = await supabase
      .from("work_order_intelligence")
      .select([
        "id",
        "complaint",
        "symptom",
        "cause",
        "correction",
        "labor_time",
        "parts",
        "job_category",
        "vehicle_year",
        "vehicle_make",
        "vehicle_model",
      ].join(","))
      .eq("shop_id", shopId)
      .limit(150);

    if (!intelError) {
      for (const raw of intelRows ?? []) {
        if (!isRecord(raw)) continue;

        const haystack = [
          s(raw.complaint),
          s(raw.symptom),
          s(raw.cause),
          s(raw.correction),
          s(raw.job_category),
        ].join(" ").trim();

        const score =
          scoreText(tokens, haystack) +
          vehicleScore({
            queryYear: year,
            queryMake: make,
            queryModel: model,
            rowYear: n(raw.vehicle_year),
            rowMake: norm(raw.vehicle_make),
            rowModel: norm(raw.vehicle_model),
          });

        if (score < 16) continue;

        suggestions.push({
          source: "work_order_intelligence",
          id: s(raw.id),
          label: s(raw.job_category) || s(raw.complaint) || "Previous quoted repair",
          score,
          laborHours: n(raw.labor_time),
          parts: parseParts(raw.parts),
          complaint: s(raw.complaint) || s(raw.symptom) || null,
          correction: s(raw.correction) || s(raw.cause) || null,
        });
      }
    }

    const ranked = suggestions
      .filter((x) => x.id && x.label)
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
