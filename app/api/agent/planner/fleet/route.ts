// app/api/agent/planner/fleet/route.ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import type { ToolContext } from "@/features/agent/lib/toolTypes";
import { runFleetPlanner } from "@/features/agent/lib/plannerFleet";

type DB = Database;

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type Body = {
  goal: string;
  fleetName?: string | null;
  programName?: string | null;
  label?: string | null;
  vehicleIds?: string[] | null;
  contactEmail?: string | null;
  contactName?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.goal || !body.goal.trim()) {
      return NextResponse.json({ error: "goal is required" }, { status: 400 });
    }

    // Resolve shopId for ToolContext
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, shop_id")
      .eq("id", user.id)
      .maybeSingle<Pick<ProfileRow, "id" | "shop_id">>();

    if (profileErr || !profile?.shop_id) {
      return NextResponse.json(
        { error: "Unable to resolve shop for this account." },
        { status: 400 },
      );
    }

    const ctx: ToolContext = {
      shopId: profile.shop_id,
      userId: user.id,
    };

    const plannerContext: Record<string, unknown> = {
      plannerKind: "fleet",
      fleetName: body.fleetName ?? undefined,
      programName: body.programName ?? undefined,
      label: body.label ?? undefined,
      vehicleIds: Array.isArray(body.vehicleIds) ? body.vehicleIds : undefined,
      contactEmail: body.contactEmail ?? undefined,
      contactName: body.contactName ?? undefined,
    };

    const events: unknown[] = [];
    await runFleetPlanner(body.goal, plannerContext, ctx, (e) => {
      events.push(e);
    });

    return NextResponse.json({ ok: true, events });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/agent/planner/fleet] error", err);
    return NextResponse.json(
      { error: "Failed to run fleet planner." },
      { status: 500 },
    );
  }
}