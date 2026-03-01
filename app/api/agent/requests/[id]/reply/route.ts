import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type ReplyBody = {
  message: string;
  answers?: Record<string, string>;
};

type AgentRequestRow = Database["public"]["Tables"]["agent_requests"]["Row"];
type AgentRequestUpdate = Database["public"]["Tables"]["agent_requests"]["Update"];

/**
 * Local Json type compatible with Supabase "json/jsonb" columns.
 * (Keeps us out of `any` while still allowing structured objects.)
 */
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type AgentResponse = {
  id: string;
  created_at: string;
  user_id: string | null;
  message: string;
  answers: Record<string, string> | null;
};

function nowIso() {
  return new Date().toISOString();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isRecord(v)) return false;
  for (const val of Object.values(v)) {
    if (typeof val !== "string") return false;
  }
  return true;
}

function toAgentResponses(v: unknown): AgentResponse[] {
  if (!Array.isArray(v)) return [];
  const out: AgentResponse[] = [];

  for (const item of v) {
    if (!isRecord(item)) continue;

    const id = typeof item.id === "string" ? item.id : null;
    const created_at = typeof item.created_at === "string" ? item.created_at : null;
    const user_id = typeof item.user_id === "string" ? item.user_id : null;
    const message = typeof item.message === "string" ? item.message : null;

    // answers optional
    const answers =
      "answers" in item && isStringRecord(item.answers) ? item.answers : null;

    if (!id || !created_at || !message) continue;

    out.push({
      id,
      created_at,
      user_id,
      message,
      answers,
    });
  }

  return out;
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  let body: ReplyBody | null = null;
  try {
    body = (await req.json()) as ReplyBody;
  } catch {
    body = null;
  }

  const message = (body?.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });

  // Who is replying?
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;

  // 1) Read current normalized_json so we can append safely
  const { data: row, error: selErr } = await supabase
    .from("agent_requests")
    .select("id, normalized_json")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json(
      { error: `select failed: ${selErr.message}` },
      { status: 500 }
    );
  }
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const normalizedRaw: unknown = (row as AgentRequestRow).normalized_json;
  const normalized = isRecord(normalizedRaw) ? normalizedRaw : {};

  const prevResponses = toAgentResponses(normalized.responses);

  const newResponse: AgentResponse = {
    id: `resp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    created_at: nowIso(),
    user_id: userId,
    message,
    answers: body?.answers && isStringRecord(body.answers) ? body.answers : null,
  };

  const nextNormalized: Record<string, unknown> = {
    ...normalized,
    responses: [...prevResponses, newResponse],
    last_response_at: nowIso(),
  };

  // Ensure we only write JSON-safe values
  const jsonNormalized = nextNormalized as unknown as Json;

  // 2) Update request row
  const updatePatch: AgentRequestUpdate = {
    normalized_json: jsonNormalized,
    updated_at: nowIso(),
  };

  const { data: updated, error: updErr } = await supabase
    .from("agent_requests")
    .update(updatePatch)
    .eq("id", id)
    .select("*")
    .single();

  if (updErr) {
    return NextResponse.json(
      { error: `update failed: ${updErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, request: updated });
}