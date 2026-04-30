import { NextResponse } from "next/server";
import { registerOnboardingFile } from "@/features/onboarding-agent/server/registerOnboardingFile";
import {
  assertOnboardingUploadFile,
  buildOnboardingStoragePath,
  ONBOARDING_UPLOAD_BUCKET,
} from "@/features/onboarding-agent/server/uploadOnboardingFiles";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export const runtime = "nodejs";

export async function POST(req: Request, context: RouteContext) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id as string;
  const actorId = access.profile.id;
  void actorId;
  const admin = createAdminSupabase();

  const { sessionId } = await context.params;

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const { data: session, error: sessionError } = await admin
    .from("onboarding_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ ok: false, error: "Session not found for this shop" }, { status: 404 });
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "At least one file is required" }, { status: 400 });
  }

  const results: Array<{
    fileId: string | null;
    originalFilename: string;
    storageBucket: string | null;
    storagePath: string | null;
    detectedDomain: string | null;
    status: "pending" | "failed";
    error?: string;
  }> = [];

  for (const [index, file] of files.entries()) {
    try {
      const { safeName } = assertOnboardingUploadFile(file);
      const storagePath = buildOnboardingStoragePath({
        shopId,
        sessionId,
        filename: safeName,
        index,
      });

      const bytes = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage
        .from(ONBOARDING_UPLOAD_BUCKET)
        .upload(storagePath, bytes, {
          contentType: file.type || "text/csv",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message || "Storage upload failed");
      }

      const registration = await registerOnboardingFile({
        supabase: admin,
        shopId,
        sessionId,
        storageBucket: ONBOARDING_UPLOAD_BUCKET,
        storagePath,
        originalFilename: file.name || safeName,
      });

      results.push({
        fileId: registration.fileId,
        originalFilename: file.name || safeName,
        storageBucket: ONBOARDING_UPLOAD_BUCKET,
        storagePath,
        detectedDomain: null,
        status: "pending",
      });
    } catch (error) {
      results.push({
        fileId: null,
        originalFilename: file.name || "unknown.csv",
        storageBucket: null,
        storagePath: null,
        detectedDomain: null,
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to upload file",
      });
    }
  }

  const hasFailure = results.some((result) => result.status === "failed");

  return NextResponse.json(
    {
      ok: !hasFailure,
      files: results,
    },
    { status: hasFailure ? 207 : 200 },
  );
}
