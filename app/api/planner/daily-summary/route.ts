import { NextResponse } from "next/server";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

import { getRoleDailySummary } from "@/features/agent/server/getRoleDailySummary";
import { createOperationalGrounding } from "@/features/agent/lib/operationalGrounding";
import { withAiOperationalTimeout } from "@/features/agent/lib/toolTypes";
import { resolveShopAssistantError } from "@/features/shop-assistant/server/requireShopAssistantActor";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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

  try {
    const result = await withAiOperationalTimeout((signal) =>
      getRoleDailySummary({
        shopId: profile.shopId as string,
        userId: user.id,
        profileId: profile.profileId as string,
        role: profile.role,
        signal,
      }),
    );

    const today = new Date().toISOString().slice(0, 10);

    // Imported staff can have an auth subject that differs from profiles.id.
    // Keep the ordinary session/RLS path for canonical identities, and use the
    // trusted server writer only after resolving an imported profile through
    // the authenticated session above.
    const summaryWriter =
      profile.profileId === user.id ? supabase : createAdminSupabase();

    const { error: upsertError } = await summaryWriter
      .from("assistant_daily_summaries")
      .upsert(
        {
          shop_id: profile.shopId,
          user_id: profile.profileId,
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
      grounding: createOperationalGrounding({
        shopId: profile.shopId,
        role: result.role,
        recordCount: new Set([
          ...result.links.map((link) => link.href),
          ...result.notifications.map(
            (notification) =>
              notification.entityId ??
              notification.href ??
              `${notification.code}:${notification.title}`,
          ),
        ]).size,
      }),
    });
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "legacy-ai-daily-summary",
    );
    return NextResponse.json(
      {
        error: resolved.message,
      },
      { status: resolved.status },
    );
  }
}
