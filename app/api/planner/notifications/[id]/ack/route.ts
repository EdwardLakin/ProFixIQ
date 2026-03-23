import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";

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
): Promise<{ shopId: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { shopId: null };
  }

  return {
    shopId: data?.shop_id ?? null,
  };
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
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

  const { id: notificationId } = await context.params;

  if (!notificationId) {
    return NextResponse.json(
      { error: "Notification id is required" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("assistant_notifications")
    .update({
      status: "acknowledged",
      acknowledged_at: now,
      acknowledged_by: user.id,
      updated_at: now,
    })
    .eq("id", notificationId)
    .eq("shop_id", profile.shopId)
    .select("id, status, acknowledged_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Notification not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: data.id,
    status: data.status,
    acknowledgedAt: data.acknowledged_at,
  });
}