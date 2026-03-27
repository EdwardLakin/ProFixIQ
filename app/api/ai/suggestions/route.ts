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

type Suggestion = {
  id: string;
  title: string;
  summary: string;
  laborHours: number;
  confidence: number;
  sourceCount: number;
  parts: Array<{ name: string; qty: number }>;
  notes: string;
  learned: true;
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
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap * 10;
}

function confidenceFromScore(score: number): number {
  if (score >= 80) return 0.9;
  if (score >= 45) return 0.65;
  return 0.35;
}

function normalizeIntelligenceText(input: {
  complaint?: string | null;
  symptom?: string | null;
  cause?: string | null;
  correction?: string | null;
  jobCategory?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: string | number | null;
}): string {
  const parts = [
    input.jobCategory,
    input.complaint,
    input.symptom,
    input.cause,
    input.correction,
    input.vehicleYear ? String(input.vehicleYear) : null,
    input.vehicleMake,
    input.vehicleModel,
  ];

  return parts
    .map((v) => (typeof v === "string" ? v.trim() : v))
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function createEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const cleaned = text.trim();

  if (!apiKey || !cleaned) return null;

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: cleaned,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding request failed: ${res.status} ${body}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  return json.data?.[0]?.embedding ?? null;
}

function toPgVectorLiteral(values: number[] | null): string | null {
  if (!values || values.length === 0) return null;
  return `[${values.join(",")}]`;
}

function normalizeParts(raw: unknown): Array<{ name: string; qty: number }> {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const obj = p as Record<string, unknown>;

      const name =
        typeof obj.name === "string"
          ? obj.name.trim()
          : typeof obj.description === "string"
            ? obj.description.trim()
            : typeof obj.item === "string"
              ? obj.item.trim()
              : "";

      const qty =
        typeof obj.qty === "number"
          ? obj.qty
          : typeof obj.quantity === "number"
            ? obj.quantity
            : 1;

      if (!name) return null;
      return { name, qty: qty > 0 ? qty : 1 };
    })
    .filter((x): x is { name: string; qty: number } => Boolean(x));
}

function safeNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function buildTemplateSuggestion(
  row: Record<string, unknown>,
  similarity: number,
): Suggestion {
  const label =
    (typeof row.label === "string" && row.label.trim()) ||
    (typeof row.job_category === "string" && row.job_category.trim()) ||
    "Learned template";

  const tags = Array.isArray(row.tags)
    ? row.tags.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];

  const summary =
    tags.length > 0
      ? `Common pattern: ${tags.slice(0, 4).join(", ")}`
      : "Learned from previous accepted jobs";

  return {
    id: String(row.id ?? crypto.randomUUID()),
    title: label,
    summary,
    laborHours: safeNumber(row.default_labor_hours, 0.5),
    confidence: Math.max(safeNumber(row.confidence_score, 0.35), similarity),
    sourceCount: safeNumber(row.usage_count, 1),
    parts: normalizeParts(row.default_parts),
    notes: "Learned template match",
    learned: true,
  };
}

function buildIntelligenceSuggestion(
  row: Record<string, unknown>,
  similarity: number,
  sourceCount: number,
): Suggestion {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    title:
      (typeof row.job_category === "string" && row.job_category.trim()) ||
      (typeof row.complaint === "string" && row.complaint.trim()) ||
      "Learned suggestion",
    summary:
      (typeof row.correction === "string" && row.correction.trim()) ||
      (typeof row.cause === "string" && row.cause.trim()) ||
      (typeof row.symptom === "string" && row.symptom.trim()) ||
      (typeof row.complaint === "string" && row.complaint.trim()) ||
      "Learned from previous jobs",
    laborHours: safeNumber(row.labor_time, 0.5),
    confidence: similarity,
    sourceCount,
    parts: normalizeParts(row.parts),
    notes: "Learned suggestion from prior completed work orders",
    learned: true,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const rpcClient = supabase as unknown as {
      rpc: (
        fn: string,
        args?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

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
    if (!queryText) {
      return NextResponse.json({ suggestions: [] });
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ suggestions: [] }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (!profile?.shop_id) {
      return NextResponse.json({ suggestions: [] });
    }

    const normalizedText = normalizeIntelligenceText({
      complaint: item,
      symptom: notes,
      cause: section,
      correction: "",
      jobCategory: section,
      vehicleMake: make,
      vehicleModel: model,
      vehicleYear: year,
    });

    try {
      const embedding = await createEmbedding(normalizedText);
      const vectorLiteral = toPgVectorLiteral(embedding);

      if (vectorLiteral) {
        const { data: templateMatches, error: templateError } =
          await rpcClient.rpc("match_learned_job_templates", {
            p_shop_id: profile.shop_id,
            p_embedding: vectorLiteral,
            p_match_count: 5,
          });

        if (
          !templateError &&
          Array.isArray(templateMatches) &&
          templateMatches.length > 0
        ) {
          const suggestions = templateMatches
            .map((row) => {
              const similarity = safeNumber(
                (row as Record<string, unknown>).similarity,
                0,
              );
              return buildTemplateSuggestion(
                row as Record<string, unknown>,
                similarity,
              );
            })
            .filter((s) => s.confidence >= 0.45)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);

          if (suggestions.length > 0) {
            return NextResponse.json({ suggestions });
          }
        }

        const { data: intelligenceMatches, error: intelligenceError } =
          await rpcClient.rpc("match_work_order_intelligence", {
            p_shop_id: profile.shop_id,
            p_embedding: vectorLiteral,
            p_match_count: 5,
          });

        if (
          !intelligenceError &&
          Array.isArray(intelligenceMatches) &&
          intelligenceMatches.length > 0
        ) {
          const suggestions = intelligenceMatches
            .map((row) => {
              const similarity = safeNumber(
                (row as Record<string, unknown>).similarity,
                0,
              );
              return buildIntelligenceSuggestion(
                row as Record<string, unknown>,
                similarity,
                intelligenceMatches.length,
              );
            })
            .filter((s) => s.confidence >= 0.45)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);

          if (suggestions.length > 0) {
            return NextResponse.json({ suggestions });
          }
        }
      }
    } catch (error) {
      console.error(
        "[ai/suggestions] vector path failed, falling back to text match",
        error,
      );
    }

    const { data: rows, error } = await supabase
      .from("work_order_intelligence")
      .select(
        "id, complaint, symptom, cause, correction, labor_time, parts, job_category, tags, vehicle_make, vehicle_model, vehicle_year, created_at",
      )
      .eq("shop_id", profile.shop_id)
      .order("created_at", { ascending: false })
      .limit(75);

    if (error) {
      return NextResponse.json(
        { suggestions: [], error: error.message },
        { status: 400 },
      );
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
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = ranked.map(({ row, score }) => ({
      id: String(row.id),
      title: row.job_category ?? row.complaint ?? "Learned suggestion",
      summary:
        row.correction ??
        row.cause ??
        row.symptom ??
        row.complaint ??
        "Learned from previous jobs",
      laborHours: typeof row.labor_time === "number" ? row.labor_time : 0.5,
      confidence: confidenceFromScore(score),
      sourceCount: ranked.length,
      parts: normalizeParts(row.parts),
      notes: "Learned suggestion from prior completed work orders",
      learned: true as const,
    }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected suggestion error";
    return NextResponse.json(
      { suggestions: [], error: message },
      { status: 500 },
    );
  }
}
