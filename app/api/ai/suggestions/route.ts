import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  item?: string;
  notes?: string;
  section?: string;
  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
  } | null;
};

function txt(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function scoreMatch(input: string, candidate: string): number {
  if (!input || !candidate) return 0;
  if (candidate.includes(input)) return 100;
  if (input.includes(candidate)) return 80;

  const a = new Set(input.split(/\s+/).filter(Boolean));
  const b = new Set(candidate.split(/\s+/).filter(Boolean));
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap * 10;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const body = (await req.json().catch(() => null)) as Body | null;

  const item = txt(body?.item);
  const notes = txt(body?.notes);
  const section = txt(body?.section);
  const make = txt(body?.vehicle?.make);
  const model = txt(body?.vehicle?.model);
  const year =
    typeof body?.vehicle?.year === "number"
      ? body.vehicle.year
      : Number(body?.vehicle?.year ?? 0) || null;

  const queryText = [item, notes, section].filter(Boolean).join(" ").trim();
  if (!queryText) return NextResponse.json({ suggestion: null });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ suggestion: null }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile?.shop_id) return NextResponse.json({ suggestion: null });

  const { data: rows, error } = await supabase
    .from("work_order_intelligence")
    .select(
      "id, complaint, symptom, cause, correction, labor_time, parts, job_category, tags, vehicle_make, vehicle_model, vehicle_year, created_at"
    )
    .eq("shop_id", profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(75);

  if (error) {
    return NextResponse.json({ suggestion: null, error: error.message }, { status: 400 });
  }

  const ranked = (rows ?? [])
    .map((row) => {
      const haystack = [
        txt(row.complaint),
        txt(row.symptom),
        txt(row.cause),
        txt(row.correction),
        txt(row.job_category),
        ...(Array.isArray(row.tags) ? row.tags.map((v) => txt(v)) : []),
      ]
        .filter(Boolean)
        .join(" ");

      let score = scoreMatch(queryText, haystack);

      if (make && txt(row.vehicle_make) === make) score += 8;
      if (model && txt(row.vehicle_model) === model) score += 8;
      if (year && row.vehicle_year === year) score += 5;

      return { row, score };
    })
    .filter((x) => x.score >= 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (ranked.length === 0) {
    return NextResponse.json({ suggestion: null });
  }

  const top = ranked[0].row;

  const parts =
    Array.isArray(top.parts)
      ? top.parts
          .map((p) => {
            if (!p || typeof p !== "object") return null;
            const obj = p as Record<string, unknown>;
            const name =
              typeof obj.name === "string"
                ? obj.name
                : typeof obj.description === "string"
                ? obj.description
                : "Suggested part";

            const qty =
              typeof obj.qty === "number"
                ? obj.qty
                : typeof obj.quantity === "number"
                ? obj.quantity
                : 1;

            return { name, qty };
          })
          .filter(Boolean)
      : [];

  return NextResponse.json({
    suggestion: {
      parts,
      laborHours: typeof top.labor_time === "number" ? top.labor_time : 0.5,
      summary:
        top.correction ??
        top.cause ??
        top.symptom ??
        top.complaint ??
        "Learned from previous jobs",
      confidence: ranked[0].score >= 80 ? "high" : ranked[0].score >= 45 ? "medium" : "low",
      notes: "Learned suggestion from prior completed work orders",
      title: top.job_category ?? "Learned suggestion",
      learned: true,
      learnedMatches: ranked.length,
    },
  });
}
