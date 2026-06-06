export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

import type { DashboardLayoutItem } from "@/features/dashboard/types/layout";


type JsonResponse = {
  ok: boolean;
  scope: string;
  layout: DashboardLayoutItem[];
};

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") || "desktop";
  const supabase = createServerSupabaseRoute();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("dashboard_user_layouts")
    .select("scope, layout")
    .eq("user_id", session.user.id)
    .eq("scope", scope)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const response: JsonResponse = {
    ok: true,
    scope,
    layout: Array.isArray(data?.layout) ? (data?.layout as DashboardLayoutItem[]) : [],
  };

  return NextResponse.json(response);
}

export async function PUT(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    scope?: string;
    layout?: DashboardLayoutItem[];
  };

  const scope = body.scope || "desktop";
  const layout = Array.isArray(body.layout) ? body.layout : [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", session.user.id)
    .maybeSingle();

  const { error } = await supabase.from("dashboard_user_layouts").upsert(
    {
      user_id: session.user.id,
      shop_id: profile?.shop_id ?? null,
      scope,
      layout,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,scope",
    },
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    scope,
    layout,
  });
}
