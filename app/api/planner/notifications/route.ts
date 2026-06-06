import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

import { syncAssistantNotifications } from "@/features/agent/server/syncAssistantNotifications";


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
  const supabase = createServerSupabaseRoute();

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
    const notifications = await syncAssistantNotifications({
      shopId: profile.shopId,
      userId: user.id,
      role: profile.role,
    });

    return NextResponse.json({
      notifications: notifications.map((item) => ({
        id: item.id,
        level: item.level,
        code: item.code,
        title: item.title,
        message: item.message,
        href: item.href ?? undefined,
        entityType: item.entity_type ?? undefined,
        entityId: item.entity_id ?? undefined,
        createdAt: item.last_seen_at,
        status: item.status,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load notifications",
      },
      { status: 500 },
    );
  }
}
