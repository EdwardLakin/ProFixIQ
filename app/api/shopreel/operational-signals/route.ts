import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { postOperationalStoryCandidatesToShopReel } from "@/features/integrations/shopreel/server/postOperationalStoryCandidatesToShopReel";

type DB = Database;

async function getOwnerShopContext() {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { error: membershipError.message, status: 500 as const };
  }

  if (!membership?.shop_id) {
    return { error: "Owner shop membership not found.", status: 403 as const };
  }

  return {
    shopId: membership.shop_id as string,
  };
}

export async function POST(request: NextRequest) {
  const context = await getOwnerShopContext();

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = await request.json().catch(() => ({}));

  const maxCandidatesRaw = Number(body?.maxCandidates);
  const maxCandidates = Number.isFinite(maxCandidatesRaw)
    ? Math.max(1, Math.min(5, Math.floor(maxCandidatesRaw)))
    : 2;

  const result = await postOperationalStoryCandidatesToShopReel({
    shopId: context.shopId,
    maxCandidates,
  });

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
