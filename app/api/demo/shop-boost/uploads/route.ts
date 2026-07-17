import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  DEMO_UPLOAD_BUCKET,
  type DemoSignedUploadTarget,
  validateDemoUploadFileDescriptors,
} from "@/features/integrations/shopBoost/demoUploadContract";

type UploadPlanResponse =
  | {
      ok: true;
      demoId: string;
      intakeId: string;
      uploads: DemoSignedUploadTarget[];
    }
  | { ok: false; error: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
): Promise<NextResponse<UploadPlanResponse>> {
  try {
    const body = (await req.json().catch(() => null)) as {
      files?: unknown;
    } | null;
    const validated = validateDemoUploadFileDescriptors(body?.files);

    if (!validated.ok) {
      return NextResponse.json(validated, { status: 400 });
    }

    const admin = createAdminSupabase();
    const demoId = randomUUID();
    const intakeId = randomUUID();
    const uploads: DemoSignedUploadTarget[] = [];

    for (const file of validated.files) {
      const path = `demos/${demoId}/${intakeId}/${file.dataset}-${randomUUID()}.csv`;
      const { data, error } = await admin.storage
        .from(DEMO_UPLOAD_BUCKET)
        .createSignedUploadUrl(path);

      if (error || !data?.token) {
        console.error("[demo/shop-boost/uploads] Failed to sign upload", {
          dataset: file.dataset,
          error: error?.message,
        });
        return NextResponse.json(
          {
            ok: false,
            error: `We couldn't prepare the ${file.dataset} upload. Please retry.`,
          },
          { status: 500 },
        );
      }

      uploads.push({
        ...file,
        path,
        token: data.token,
      });
    }

    return NextResponse.json(
      { ok: true, demoId, intakeId, uploads },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[demo/shop-boost/uploads] Unexpected error", error);
    return NextResponse.json(
      {
        ok: false,
        error: "We couldn't prepare secure uploads. Please try again.",
      },
      { status: 500 },
    );
  }
}
