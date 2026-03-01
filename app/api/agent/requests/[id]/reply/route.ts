import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

/**
 * Minimal JSON type compatible with Supabase `jsonb`
 */
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type ReplyBody = {
  message: string;
  answers?: Record<string, string>;
};

type AgentResponse = {
  id: string;
  created_at: string;
  user_id: string | null;
  message: string;
  answers?: Record<string, string> | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function toJsonRecord(v: unknown): Record<string, Json | undefined> {
  if (!isRecord(v)) return {};
  return v as Record<string, Json | undefined>;
}

export async function POST(
  req: Request,
  context: { params: { id: string } }
) {
  const { id } = context.params;

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

  // Identify user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;

  // Fetch current normalized_json
  const { data: row, error: selectErr } = await supabase
    .from("agent_requests")
    .select("id, normalized_json")
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    return NextResponse.json(
      { error: `select failed: ${selectErr.message}` },
      { status: 500 }
    );
  }

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const normalized = toJsonRecord(row.normalized_json);
  const prevResponses = safeArray<AgentResponse>(normalized.responses);

  const newResponse: AgentResponse = {
    id: `resp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    created_at: nowIso(),
    user_id: userId,
    message,
    answers: body?.answers && isRecord(body.answers) ? body.answers : null,
  };

  const nextNormalized: Record<string, Json | undefined> = {
    ...normalized,
    responses: [...prevResponses, newResponse],
    last_response_at: nowIso(),
  };

  const { data: updated, error: updateErr } = await supabase
    .from("agent_requests")
    .update({
      normalized_json: nextNormalized as Json,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) {
    return NextResponse.json(
      { error: `update failed: ${updateErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, request: updated });
}