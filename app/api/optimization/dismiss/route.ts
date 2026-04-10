import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { OptimizationActionType } from "@/features/optimization/types";

type DB = Database;

type DismissBody = {
  opportunityId?: string;
  type?: OptimizationActionType;
};

const TYPE_MAP: Record<string, OptimizationActionType> = {
  pricing_normalization: "pricing",
  inspection_coverage_gap: "inspection",
  missed_revenue: "revenue",
};

function normalizeType(value: unknown): OptimizationActionType | null {
  if (value === "pricing" || value === "inspection" || value === "revenue") return value;
  if (typeof value === "string") return TYPE_MAP[value] ?? null;
  return null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Unable to resolve shop context" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as DismissBody | null;
  const opportunityId = toNonEmptyString(body?.opportunityId);
  const type = normalizeType(body?.type);

  if (!opportunityId || !type) {
    return NextResponse.json({ error: "opportunityId and type are required" }, { status: 400 });
  }

  const actionInsert: DB["public"]["Tables"]["optimization_actions"]["Insert"] = {
    shop_id: profile.shop_id,
    opportunity_id: opportunityId,
    type,
    action: "dismissed",
    payload: {},
    created_by: user.id,
  };

  const { error: actionError } = await supabase.from("optimization_actions").insert(actionInsert);
  if (actionError) {
    return NextResponse.json({ error: actionError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
