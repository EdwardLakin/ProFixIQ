import { NextResponse } from "next/server";
import { canAccessAssistantNotifications } from "@/features/shared/lib/rbac";
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
): Promise<{
  profileId: string | null;
  shopId: string | null;
  role: string | null;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(2);

  if (error) {
    return { profileId: null, shopId: null, role: null };
  }

  const profile = data?.find((row) => row.id === userId) ?? data?.[0];

  return {
    profileId: profile?.id ?? null,
    shopId: profile?.shop_id ?? null,
    role: profile?.role ?? null,
  };
}

export async function GET() {
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

  if (!canAccessAssistantNotifications(profile.role)) {
    return NextResponse.json(
      { error: "A shop workforce role is required" },
      { status: 403 },
    );
  }

  try {
    const notifications = await syncAssistantNotifications({
      shopId: profile.shopId,
      userId: profile.profileId,
      assignmentUserIds: [profile.profileId, user.id],
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
