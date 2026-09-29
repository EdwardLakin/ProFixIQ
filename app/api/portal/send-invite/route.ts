export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
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

  if (!email || !customerId) {
    return NextResponse.json({ ok: false, error: "Customer and email are required." }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess({ requiredCapability: "canInvitePortalCustomers" });
  if (!access.ok) return access.response;

  try {
    await issueCustomerPortalInvite({
      shopId: access.profile.shop_id,
      customerId,
      workOrderId: workOrderId || null,
      email,
      source: workOrderId ? "work_order" : "customer_account",
      createdBy: access.authUserId,
      createdByProfileId: access.profile.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portal invite could not be sent.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
