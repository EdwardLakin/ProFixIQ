// app/api/demo/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  buildShadowShopSnapshot,
  type ShadowShopCsvUpload,
  type ShadowShopSnapshot,
} from "@/features/integrations/shopBoost/shadowShop";
import {
  DEMO_UPLOAD_BUCKET,
  DEMO_UPLOAD_MAX_FILE_BYTES,
  DEMO_UPLOAD_MAX_TOTAL_BYTES,
  type DemoStagedUploadManifestEntry,
  validateDemoUploadFileDescriptors,
} from "@/features/integrations/shopBoost/demoUploadContract";
import type { ShopBoostUploadDatasetKey } from "@/features/integrations/shopBoost/uploadDatasets";

type DB = Database;

type DemoRunBody = {
  demoId?: string;
  intakeId?: string;
  shopName?: string;
  country?: string;
  questionnaire?: unknown;
  uploads?: unknown;
};

type DemoRunSuccessResponse = {
  ok: true;
  demoId: string;
  intakeId: string;
  analysis: ShadowShopSnapshot;
};

type DemoRunErrorResponse = {
  ok: false;
  error: string;
};

type DemoRunResponse = DemoRunSuccessResponse | DemoRunErrorResponse;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeShopName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function readUploadManifest(args: {
  demoId: string;
  intakeId: string;
  uploads: unknown;
}):
  | { ok: true; uploads: DemoStagedUploadManifestEntry[] }
  | { ok: false; error: string } {
  const validated = validateDemoUploadFileDescriptors(args.uploads);
  if (!validated.ok) return validated;

  const rawUploads = Array.isArray(args.uploads) ? args.uploads : [];
  const expectedPrefix = `demos/${args.demoId}/${args.intakeId}/`;
  const uploads: DemoStagedUploadManifestEntry[] = [];

  for (let index = 0; index < validated.files.length; index += 1) {
    const raw = isRecord(rawUploads[index]) ? rawUploads[index] : {};
    const path = typeof raw.path === "string" ? raw.path : "";
    if (
      !path.startsWith(expectedPrefix) ||
      path.includes("..") ||
      !path.endsWith(".csv")
    ) {
      return {
        ok: false,
        error: "The secure upload manifest is invalid or has expired. Please retry the analysis.",
      };
    }
    uploads.push({ ...validated.files[index], path });
  }

  return { ok: true, uploads };
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<DemoRunResponse>> {
  try {
    const body = (await req.json().catch(() => null)) as DemoRunBody | null;
    const demoId = body?.demoId;
    const intakeId = body?.intakeId;

    if (!isUuid(demoId) || !isUuid(intakeId)) {
      return NextResponse.json(
        { ok: false, error: "The secure analysis intake is invalid. Please retry." },
        { status: 400 },
      );
    }

    const shopName =
      typeof body?.shopName === "string" && body.shopName.trim()
        ? safeShopName(body.shopName)
        : null;
    if (!shopName) {
      return NextResponse.json(
        { ok: false, error: "Shop name is required." },
        { status: 400 },
      );
    }

    const countryValue =
      body?.country === "US" || body?.country === "CA" ? body.country : "US";
    const questionnaire = isRecord(body?.questionnaire)
      ? body.questionnaire
      : {};
    const manifest = readUploadManifest({
      demoId,
      intakeId,
      uploads: body?.uploads,
    });
    if (!manifest.ok) {
      return NextResponse.json(manifest, { status: 400 });
    }

    const supabase = createAdminSupabase();
    const { data: existingDemo, error: existingError } = await supabase
      .from("demo_shop_boosts")
      .select("id,snapshot")
      .eq("id", demoId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { ok: false, error: "We couldn't inspect the analysis intake. Please retry." },
        { status: 500 },
      );
    }

    if (existingDemo?.snapshot) {
      const existingSnapshot = isRecord(existingDemo.snapshot)
        ? existingDemo.snapshot
        : {};
      if (existingSnapshot.intakeId === intakeId) {
        return NextResponse.json({
          ok: true,
          demoId,
          intakeId,
          analysis: existingSnapshot as unknown as ShadowShopSnapshot,
        });
      }
      return NextResponse.json(
        { ok: false, error: "This analysis intake is already in use. Please start again." },
        { status: 409 },
      );
    }

    const uploadedCsvs: Partial<
      Record<ShopBoostUploadDatasetKey, ShadowShopCsvUpload>
    > = {};
    const activationUploadPaths: Partial<
      Record<ShopBoostUploadDatasetKey, string>
    > = {};
    let totalBytes = 0;

    for (const upload of manifest.uploads) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(DEMO_UPLOAD_BUCKET)
        .download(upload.path);

      if (downloadError || !blob) {
        console.error("[demo/shop-boost/run] Staged upload missing", {
          dataset: upload.dataset,
          path: upload.path,
          error: downloadError?.message,
        });
        return NextResponse.json(
          {
            ok: false,
            error: `The ${upload.dataset} upload did not finish. Please retry the analysis.`,
          },
          { status: 409 },
        );
      }

      if (blob.size <= 0 || blob.size > DEMO_UPLOAD_MAX_FILE_BYTES) {
        return NextResponse.json(
          {
            ok: false,
            error: `${upload.fileName} is empty or exceeds the 20 MB analysis limit.`,
          },
          { status: 413 },
        );
      }

      totalBytes += blob.size;
      if (totalBytes > DEMO_UPLOAD_MAX_TOTAL_BYTES) {
        return NextResponse.json(
          {
            ok: false,
            error: "The staged exports exceed the 60 MB analysis limit.",
          },
          { status: 413 },
        );
      }

      uploadedCsvs[upload.dataset] = {
        fileName: upload.fileName,
        text: await blob.text(),
      };
      activationUploadPaths[upload.dataset] = upload.path;
    }

    const snapshot = await buildShadowShopSnapshot({
      intakeId,
      uploadedCsvs,
    });
    const snapshotWithActivation = {
      ...snapshot,
      questionnaire,
      activationUploadPaths,
      activationUploadManifest: manifest.uploads,
    };

    const { data: demoRow, error: demoError } = await supabase
      .from("demo_shop_boosts")
      .insert({
        id: demoId,
        shop_id: null,
        intake_id: null,
        shop_name: shopName,
        country: countryValue,
        snapshot: snapshotWithActivation,
      } as DB["public"]["Tables"]["demo_shop_boosts"]["Insert"])
      .select("id")
      .single();

    if (demoError || !demoRow?.id) {
      console.error("[demo/shop-boost/run] Failed to persist analysis", demoError);
      return NextResponse.json(
        {
          ok: false,
          error: "We ran the analysis, but could not save the result. Please retry.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        demoId: demoRow.id as string,
        intakeId,
        analysis: snapshotWithActivation,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[demo/shop-boost/run] Unexpected analysis error", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error while running the import analysis. Please try again.",
      },
      { status: 500 },
    );
  }
}
