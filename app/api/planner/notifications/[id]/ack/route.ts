import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

async function requireUser(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

async function resolveProfile(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  userId: string,
): Promise<{ profileId: string | null; shopId: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, shop_id")
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(2);

  if (error) {
    return { profileId: null, shopId: null };
  }

  const profile = data?.find((row) => row.id === userId) ?? data?.[0];

  return {
    profileId: profile?.id ?? null,
    shopId: profile?.shop_id ?? null,
  };
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const supabase = createServerSupabaseRoute();

  const user = await requireUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await resolveProfile(supabase, user.id);
  if (!profile.profileId || !profile.shopId) {
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
      acknowledged_by: profile.profileId,
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
