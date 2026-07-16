export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { issueCustomerPortalInvite } from "@/features/portal/server/customerPortalInvites";

type Body = {
  email?: string;
  customerId?: string;
  workOrderId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const customerId = String(body?.customerId ?? "").trim();
  const workOrderId = String(body?.workOrderId ?? "").trim();

  if (!email || !customerId || !workOrderId) {
    return NextResponse.json({ ok: false, error: "Customer and work order are required." }, { status: 400 });
  }

  const supabase = createServerSupabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .maybeSingle();
  const capabilities = getActorCapabilities({ role: profile?.role });
  if (!profile?.shop_id || !capabilities.canInvitePortalCustomers) {
    return NextResponse.json({ ok: false, error: "You do not have permission to invite portal customers." }, { status: 403 });
  }

  try {
    await issueCustomerPortalInvite({
      shopId: profile.shop_id,
      customerId,
      workOrderId,
      email,
      source: "work_order",
      createdBy: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal invite could not be sent.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
