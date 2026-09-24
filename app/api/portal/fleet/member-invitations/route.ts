export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute, createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { resolveFleetActorContext, canAdministerFleetForActor } from "@/features/fleet/lib/resolveFleetActorContext";
import { resolveSelectedFleetRequestScope } from "@/features/fleet/lib/resolveSelectedFleetRequestScope";
import { issueFleetPortalInvite, type FleetInviteRole } from "@/features/fleet/server/issueFleetPortalInvite";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

async function access(requestedFleetId: string) {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveFleetActorContext(supabase, { requestedFleetId });
  if (!actor.userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!UUID.test(requestedFleetId) || !canAdministerFleetForActor(actor, requestedFleetId)) {
    return { error: NextResponse.json({ error: "Fleet manager access required" }, { status: 403 }) };
  }
  const scope = resolveSelectedFleetRequestScope(actor, { explicitFleetId: requestedFleetId });
  if (!scope?.shopId) return { error: NextResponse.json({ error: "Fleet scope unavailable" }, { status: 403 }) };
  const admin = createAdminSupabase();
  const { data: fleet, error } = await admin.from("fleets").select("id,name,shop_id").eq("id", requestedFleetId).eq("shop_id", scope.shopId).maybeSingle();
  if (error || !fleet) return { error: NextResponse.json({ error: "Fleet not found" }, { status: 404 }) };
  const { data: profile } = await admin.from("profiles").select("id").eq("user_id", actor.userId).maybeSingle();
  return { actor, fleet, shopId: scope.shopId, profileId: profile?.id ?? actor.userId, admin };
}

export async function GET(request: Request) {
  const fleetId = new URL(request.url).searchParams.get("fleetId") ?? "";
  const result = await access(fleetId);
  if (result.error) return result.error;
  const { data, error } = await result.admin!.from("fleet_portal_invites")
    .select("id,email,role,expires_at,accepted_at,revoked_at,delivery_status")
    .eq("fleet_id", fleetId).eq("shop_id", result.shopId!)
    .order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: "Invitations could not be loaded" }, { status: 500 });
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { fleetId?: string; email?: string; role?: string } | null;
  const fleetId = String(body?.fleetId ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!UUID.test(fleetId) || !EMAIL.test(email) || email.length > 254 || !["viewer","approver","manager"].includes(body?.role ?? "")) {
    return NextResponse.json({ error: "Valid Fleet, email and role are required" }, { status: 400 });
  }
  const result = await access(fleetId);
  if (result.error) return result.error;
  const { data: profiles, error: profileError } = await result.admin!.from("profiles").select("id").ilike("email", email).limit(20);
  if (profileError) return NextResponse.json({ error: "Existing membership could not be checked" }, { status: 500 });
  if (profiles?.length) {
    const { data: existing, error } = await result.admin!.from("fleet_members").select("user_id").eq("fleet_id",fleetId).eq("shop_id",result.shopId!).in("user_id", profiles.map(p=>p.id)).limit(1);
    if (error) return NextResponse.json({ error: "Existing membership could not be checked" }, { status: 500 });
    if (existing?.length) return NextResponse.json({ error: "This user already belongs to this Fleet" }, { status: 409 });
  }
  const issued = await issueFleetPortalInvite({
    shopId: result.shopId!,
    createdByAuthUserId: result.actor!.userId!,
    createdByProfileId: result.profileId!,
    fleet: { id: result.fleet!.id, name: result.fleet!.name },
    email, role: body!.role as FleetInviteRole,
  });
  if (!issued.ok) return NextResponse.json({ error: issued.error }, { status: issued.status });
  return NextResponse.json(issued);
}
