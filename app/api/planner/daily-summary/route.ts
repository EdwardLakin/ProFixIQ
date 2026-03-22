import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { getRoleDailySummary } from "@/features/agent/server/getRoleDailySummary";

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

export async function GET() {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const user = await requireUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await resolveProfile(supabase, user.id);
  if (!profile.shopId) {
    return NextResponse.json(
      { error: "No shop found for user" },
      { status: 400 },
    );
  }

  try {
    const result = await getRoleDailySummary({
      shopId: profile.shopId,
      userId: user.id,
      role: profile.role,
    });

    const today = new Date().toISOString().slice(0, 10);

    const { error: upsertError } = await supabase
      .from("assistant_daily_summaries")
      .upsert(
        {
          shop_id: profile.shopId,
          user_id: user.id,
          role: result.role,
          summary_date: today,
          summary_text: result.summaryText,
          action_items: result.actionItems,
          links: result.links,
          notifications: result.notifications,
          source_snapshot: result.sourceSnapshot,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "shop_id,user_id,role,summary_date",
        },
      );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return NextResponse.json({
      role: result.role,
      summaryText: result.summaryText,
      actionItems: result.actionItems,
      links: result.links,
      notifications: result.notifications,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build daily summary",
      },
      { status: 500 },
    );
  }
}
