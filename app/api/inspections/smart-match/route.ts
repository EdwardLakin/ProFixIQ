import { NextResponse } from "next/server";
import { findSmartInspectionMatch } from "@/features/inspections/server/findSmartInspectionMatch";
import {
  requireCanonicalShopOrFieldApiAccess,
  resolveWorkOrderProductMutationClient,
} from "@/features/mobile/service/server/access";

type Body = {
  workOrderId?: string;
  item?: string;
  notes?: string;
  section?: string;
  status?: string;
  vehicle?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    engine?: string | null;
    drivetrain?: string | null;
    transmission?: string | null;
    fuel_type?: string | null;
  } | null;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const workOrderId =
    typeof body?.workOrderId === "string" ? body.workOrderId.trim() : "";
  if (!workOrderId) {
    return NextResponse.json({ match: null }, { status: 400 });
  }

  const access = await requireCanonicalShopOrFieldApiAccess({
    requiredCapability: "canRunInspections",
  });
  if (!access.ok) return access.response;

  const productAuthority = await resolveWorkOrderProductMutationClient(
    access,
    workOrderId,
  );
  if (!productAuthority.authorized || !productAuthority.mutationClient) {
    return NextResponse.json({ match: null }, { status: 404 });
  }

  const match = await findSmartInspectionMatch({
    supabase: access.supabase,
    completedRepairSourceClient: productAuthority.mutationClient,
    shopId: access.profile.shop_id,
    body: body ?? {},
  });

  return NextResponse.json({ match });
}
