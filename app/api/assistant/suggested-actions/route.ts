// app/api/assistant/suggested-actions/route.ts

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

import type { SuggestedActionContext } from "@/features/assistant/types/suggested-actions";
import { getSuggestedActions } from "@/features/assistant/server/getSuggestedActions";
import {
  requireShopAssistantActor,
  resolveShopAssistantError,
} from "@/features/shop-assistant/server/requireShopAssistantActor";

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();
  let actor: Awaited<ReturnType<typeof requireShopAssistantActor>>;
  try {
    actor = await requireShopAssistantActor(supabase);
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "legacy-assistant-suggested-actions-auth",
    );
    return NextResponse.json(
      { error: resolved.message },
      { status: resolved.status },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    context?: SuggestedActionContext;
  };

  try {
    const result = await getSuggestedActions({
      shopId: actor.shopId,
      userId: actor.userId,
      profileId: actor.profileId,
      role: actor.role,
      context: body.context,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "legacy-assistant-suggested-actions",
    );
    return NextResponse.json(
      {
        error: resolved.message,
      },
      { status: resolved.status },
    );
  }
}

export async function GET() {
  const supabase = createServerSupabaseRoute();
  let actor: Awaited<ReturnType<typeof requireShopAssistantActor>>;
  try {
    actor = await requireShopAssistantActor(supabase);
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "legacy-assistant-suggested-actions-auth",
    );
    return NextResponse.json(
      { error: resolved.message },
      { status: resolved.status },
    );
  }

  try {
    const result = await getSuggestedActions({
      shopId: actor.shopId,
      userId: actor.userId,
      profileId: actor.profileId,
      role: actor.role,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const resolved = resolveShopAssistantError(
      error,
      "legacy-assistant-suggested-actions",
    );
    return NextResponse.json(
      {
        error: resolved.message,
      },
      { status: resolved.status },
    );
  }
}
