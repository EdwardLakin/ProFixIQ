import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { runAssistant } from "@/features/assistant/server/runAssistant";

type DB = Database;

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

async function resolveProfile(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  userId: string,
): Promise<{ shopId: string | null; role: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { shopId: null, role: null };
  }

  return {
    shopId: data?.shop_id ?? null,
    role: data?.role ?? null,
  };
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const user = await requireUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await resolveProfile(supabase, user.id);
  if (!profile.shopId) {
    return NextResponse.json({ error: "No shop found" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    query?: unknown;
  };

  const query =
    typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json(
      { error: "Query is required" },
      { status: 400 },
    );
  }

  try {
    const result = await runAssistant({
      shopId: profile.shopId,
      userId: user.id,
      role: profile.role,
      query,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Assistant failed",
      },
      { status: 500 },
    );
  }
}
