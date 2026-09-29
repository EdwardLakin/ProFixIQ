export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, context: Context) {
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid customer reference." }, { status: 400 });

  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("id,email,active,merged_into_customer_id")
    .eq("shop_id", access.profile.shop_id)
    .eq("id", id)
    .maybeSingle();
  if (customerError) return NextResponse.json({ error: "Customer access could not be loaded." }, { status: 500 });
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const [customerInvites, fleets] = await Promise.all([
    supabaseAdmin.from("customer_portal_invites")
      .select("id,email,created_at,expires_at,accepted_at,revoked_at,accepted_by_user_id")
      .eq("shop_id", access.profile.shop_id).eq("customer_id", id)
      .order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("fleets").select("id,name,active")
      .eq("shop_id", access.profile.shop_id).eq("customer_id", id),
  ]);
  if (customerInvites.error || fleets.error) return NextResponse.json({ error: "Portal access could not be loaded." }, { status: 500 });

  const canViewFleet = getActorCapabilities({ role: access.profile.role }).canInviteFleetMembers;
  const email = customer.email?.trim().toLowerCase() ?? "";
  const fleetIds = canViewFleet ? (fleets.data ?? []).map((fleet) => fleet.id) : [];
  const fleetInvites = fleetIds.length
    ? await supabaseAdmin.from("fleet_portal_invites")
        .select("id,fleet_id,email,role,created_at,expires_at,accepted_at,revoked_at,delivery_status,delivery_reserved_until")
        .eq("shop_id", access.profile.shop_id).in("fleet_id", fleetIds)
        .eq("email", email).eq("role", "manager")
        .order("created_at", { ascending: false }).limit(100)
    : { data: [], error: null };
  if (fleetInvites.error) return NextResponse.json({ error: "Fleet access could not be loaded." }, { status: 500 });

  const matching = (customerInvites.data ?? []).filter((invite) => invite.email.toLowerCase() === email);
  const accepted = matching.find((invite) => invite.accepted_at && !invite.revoked_at);
  const latest = matching[0] ?? null;
  const customerStatus = accepted ? "active" : !latest ? "not_invited" : latest.revoked_at
    ? "revoked" : new Date(latest.expires_at) <= new Date() ? "expired" : "pending";
  return NextResponse.json({
    ok: true,
    email,
    customerActive: customer.active && !customer.merged_into_customer_id,
    customer: { status: customerStatus, invite: accepted ?? latest },
    fleets: (canViewFleet ? fleets.data ?? [] : []).map((fleet) => ({
      ...fleet,
      invites: (fleetInvites.data ?? []).filter((invite) => invite.fleet_id === fleet.id),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
