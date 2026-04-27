import { NextResponse } from "next/server";
import { registerOnboardingFile } from "@/features/onboarding-agent/server/registerOnboardingFile";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function POST(req: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const { sessionId } = await context.params;

  const body = (await req.json().catch(() => ({}))) as {
    storageBucket?: string;
    storagePath?: string;
    originalFilename?: string;
    declaredDomain?: string;
  };

  if (!body.storageBucket || !body.storagePath) {
    return NextResponse.json({ ok: false, error: "storageBucket and storagePath are required" }, { status: 400 });
  }

  try {
    const result = await registerOnboardingFile({
      supabase: access.supabase,
      shopId: access.profile.shop_id as string,
      sessionId,
      storageBucket: body.storageBucket,
      storagePath: body.storagePath,
      originalFilename: body.originalFilename,
      declaredDomain: body.declaredDomain,
    });

    return NextResponse.json({ ok: true, fileId: result.fileId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to register file" },
      { status: 500 },
    );
  }
}