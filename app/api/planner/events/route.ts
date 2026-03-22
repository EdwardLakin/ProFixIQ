import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const QuerySchema = z.object({
  runId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

async function requireUser(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

async function resolveShopId(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) return null;
  return data?.shop_id ?? null;
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const user = await requireUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = await resolveShopId(supabase, user.id);
  if (!shopId) {
    return NextResponse.json({ error: "No shop found for user" }, { status: 400 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    runId: url.searchParams.get("runId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { runId, limit } = parsed.data;

  let runIds: string[] = [];

  if (runId) {
    const { data: run, error: runError } = await supabase
      .from("planner_runs")
      .select("id, shop_id, user_id")
      .eq("id", runId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    if (!run?.id) {
      return NextResponse.json({ events: [] });
    }

    runIds = [run.id];
  } else {
    const { data: runs, error: runsError } = await supabase
      .from("planner_runs")
      .select("id")
      .eq("shop_id", shopId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (runsError) {
      return NextResponse.json({ error: runsError.message }, { status: 500 });
    }

    runIds = (runs ?? []).map((row) => row.id).filter(Boolean);
    if (runIds.length === 0) {
      return NextResponse.json({ events: [] });
    }
  }

  const { data: events, error: eventsError } = await supabase
    .from("planner_events")
    .select("id, run_id, step, kind, content, created_at")
    .in("run_id", runIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  return NextResponse.json({
    events: events ?? [],
  });
}
