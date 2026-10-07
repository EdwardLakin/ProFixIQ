export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { approveEarlyAccessDiscount } from "@/features/stripe/lib/server/early-access-discount";

type RouteContext = { params: { id: string } };

export async function POST(_request: Request, context: unknown) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;
  if (!access.profile?.id) {
    return NextResponse.json(
      { error: "Your Ops operator profile is not ready for auditable financial review actions." },
      { status: 409 },
    );
  }

  const { params } = context as RouteContext;
  const applicationId = params?.id ?? "";
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required." }, { status: 400 });
  }

  try {
    const grant = await approveEarlyAccessDiscount({
      applicationId,
      actorAuthUserId: access.user.id,
      actorProfileId: access.profile.id,
    });
    return NextResponse.json({
      ok: true,
      token: grant.token,
      expiresAt: grant.expiresAt,
      productPackage: grant.productPackage,
      reissued: grant.reissued,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to approve Early Access application.";
    console.error("[ops/early-access/approve]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
