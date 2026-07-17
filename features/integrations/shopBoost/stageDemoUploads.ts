"use client";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  DEMO_UPLOAD_BUCKET,
  type DemoSignedUploadTarget,
  type DemoStagedUploadManifestEntry,
  type DemoUploadFileDescriptor,
} from "@/features/integrations/shopBoost/demoUploadContract";
import type { ShopBoostUploadDatasetKey } from "@/features/integrations/shopBoost/uploadDatasets";

type SelectedDemoFile = {
  dataset: ShopBoostUploadDatasetKey;
  file: File;
};

type UploadPlanResponse =
  | {
      ok: true;
      demoId: string;
      intakeId: string;
      uploads: DemoSignedUploadTarget[];
    }
  | { ok: false; error: string };

export type StagedDemoUploads = {
  demoId: string;
  intakeId: string;
  uploads: DemoStagedUploadManifestEntry[];
};

async function readJsonResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      response.status === 413
        ? "These files are too large for a single request. ProFixIQ could not start the secure upload."
        : fallback,
    );
  }
  return (await response.json()) as T;
}

export async function stageInstantAnalysisUploads(args: {
  selectedFiles: SelectedDemoFile[];
  onProgress?: (message: string) => void;
}): Promise<StagedDemoUploads> {
  const descriptors: DemoUploadFileDescriptor[] = args.selectedFiles.map(
    ({ dataset, file }) => ({
      dataset,
      fileName: file.name,
      sizeBytes: file.size,
      contentType: file.type || "text/csv",
    }),
  );

  args.onProgress?.("Preparing secure uploads…");
  const planResponse = await fetch("/api/demo/shop-boost/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: descriptors }),
  });
  const plan = await readJsonResponse<UploadPlanResponse>(
    planResponse,
    "We couldn't prepare secure uploads. Please try again.",
  );

  if (!planResponse.ok || !plan.ok) {
    throw new Error(
      !plan.ok ? plan.error : "We couldn't prepare secure uploads. Please try again.",
    );
  }

  const selectedByDataset = new Map(
    args.selectedFiles.map(({ dataset, file }) => [dataset, file] as const),
  );
  const supabase = createBrowserSupabase();

  for (let index = 0; index < plan.uploads.length; index += 1) {
    const upload = plan.uploads[index];
    const file = selectedByDataset.get(upload.dataset);
    if (!file) {
      throw new Error(`The ${upload.dataset} file selection changed. Please retry.`);
    }

    args.onProgress?.(
      `Uploading ${index + 1} of ${plan.uploads.length}: ${file.name}`,
    );
    const { error } = await supabase.storage
      .from(DEMO_UPLOAD_BUCKET)
      .uploadToSignedUrl(upload.path, upload.token, file, {
        cacheControl: "3600",
        contentType: upload.contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`We couldn't upload ${file.name}. ${error.message}`);
    }
  }

  return {
    demoId: plan.demoId,
    intakeId: plan.intakeId,
    uploads: plan.uploads.map((upload) => ({
      dataset: upload.dataset,
      path: upload.path,
      fileName: upload.fileName,
      sizeBytes: upload.sizeBytes,
      contentType: upload.contentType,
    })),
  };
}
