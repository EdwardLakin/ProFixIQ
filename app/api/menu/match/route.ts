// app/api/menu/match/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  workOrderId: string;
  description: string;
  notes?: string | null;
  section?: string | null;
  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
  } | null;
  source?: string | null;
};

type MenuItemCandidate = {
  id: string;
  name: string | null;
  description: string | null;
  complaint: string | null;
  cause: string | null;
  correction: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  is_active: boolean | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseMenuItem(row: unknown): MenuItemCandidate | null {
  if (!isRecord(row)) return null;

  const id = asString(row.id);
  if (!id) return null;

  return {
    id,
    name: asString(row.name),
    description: asString(row.description),
    complaint: asString(row.complaint),
    cause: asString(row.cause),
    correction: asString(row.correction),
    vehicle_year: asNumber(row.vehicle_year),
    vehicle_make: asString(row.vehicle_make),
    vehicle_model: asString(row.vehicle_model),
    is_active: asBool(row.is_active),
  };
}

function norm(s: string | null): string {
  return String(s ?? "").trim().toLowerCase();
}

function tokenize(s: string): string[] {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 16);
}

function scoreText(haystack: string, tokens: string[]): number {
  const h = haystack.toLowerCase();
  let score = 0;

  for (const t of tokens) {
    if (h.includes(t)) score += 2;
  }

  if (tokens.length >= 2) {
    const phrase = `${tokens[0]} ${tokens[1]}`;
    if (h.includes(phrase)) score += 2;
  }

  return score;
}

function parseYear(v: unknown): number | null {
  return asNumber(v);
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const workOrderId = String(body.workOrderId ?? "").trim();
  const description = String(body.description ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  if (!workOrderId || !description) {
    return NextResponse.json(
      { ok: false, error: "Missing workOrderId or description" },
      { status: 400 },
    );
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const y = parseYear(body.vehicle?.year ?? null);
  const make = norm(body.vehicle?.make ?? null);
  const model = norm(body.vehicle?.model ?? null);

  const tokens = tokenize(`${description} ${notes}`);

  // IMPORTANT:
  // - We intentionally DO NOT rely on typed row inference here (your DB types are causing GenericStringError unions).
  // - We fetch needed columns and validate/narrow from unknown.
  const { data: rawRows, error } = await supabase
    .from("menu_items")
    .select(
      [
        "id",
        "name",
        "description",
        "complaint",
        "cause",
        "correction",
        "vehicle_year",
        "vehicle_make",
        "vehicle_model",
        "is_active",
      ].join(","),
    )
    .eq("is_active", true)
    .limit(120);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(rawRows) ? rawRows : [];
  const candidates = rows
    .map(parseMenuItem)
    .filter((x): x is MenuItemCandidate => x !== null);

  const scored = candidates.map((it) => {
    const hay = [
      it.name ?? "",
      it.description ?? "",
      it.complaint ?? "",
      it.cause ?? "",
      it.correction ?? "",
    ]
      .join(" ")
      .trim();

    let score = scoreText(hay, tokens);

    const itYear = it.vehicle_year;
    const itMake = norm(it.vehicle_make);
    const itModel = norm(it.vehicle_model);

    if (y != null && itYear != null && y === itYear) score += 10;
    if (make && itMake && make === itMake) score += 8;
    if (model && itModel && model === itModel) score += 8;

    if ((y != null || make || model) && (!itYear || !itMake || !itModel)) score -= 2;

    return { id: it.id, name: it.name, score };
  });

  const best = scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  return NextResponse.json({
    ok: true,
    match: best ? { id: best.id, name: best.name, score: best.score } : null,
  });
}