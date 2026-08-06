import "server-only";

import { randomUUID } from "node:crypto";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const FLEET_DRIVER_EVIDENCE_BUCKET = "fleet-driver-evidence";
export const MAX_FLEET_EVIDENCE_BYTES = 15 * 1024 * 1024;

const PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const VOICE_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
]);

export type FleetEvidenceMediaType = "photo" | "voice";

export type FleetEvidenceUploadInput = {
  file: File;
  itemId: string | null;
  mediaType: FleetEvidenceMediaType;
};

export type FleetEvidenceMetadata = {
  storagePath: string;
  itemId: string | null;
  mediaType: FleetEvidenceMediaType;
  mimeType: string;
  sizeBytes: number;
};

type AdminClient = ReturnType<typeof createAdminSupabase>;

function extensionFor(file: File, mediaType: FleetEvidenceMediaType): string {
  const fromName = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length <= 8) return fromName;
  if (mediaType === "photo") return file.type === "image/png" ? "png" : "jpg";
  if (file.type === "audio/webm") return "webm";
  if (file.type === "audio/ogg") return "ogg";
  if (file.type === "audio/wav") return "wav";
  return "m4a";
}

function validateUpload(input: FleetEvidenceUploadInput): void {
  if (!input.file.size || input.file.size > MAX_FLEET_EVIDENCE_BYTES) {
    throw new Error("Each photo or voice note must be 15 MB or smaller.");
  }

  const allowed =
    input.mediaType === "photo" ? PHOTO_MIME_TYPES : VOICE_MIME_TYPES;
  if (!allowed.has(input.file.type.toLowerCase())) {
    throw new Error(
      input.mediaType === "photo"
        ? "Use a JPG, PNG, WebP, or HEIC photo."
        : "Use an M4A, MP3, WebM, OGG, or WAV voice note.",
    );
  }
}

export async function uploadFleetDriverEvidence(args: {
  admin: AdminClient;
  prefix: string;
  uploads: FleetEvidenceUploadInput[];
}): Promise<FleetEvidenceMetadata[]> {
  const uploadedPaths: string[] = [];
  const metadata: FleetEvidenceMetadata[] = [];

  try {
    for (const input of args.uploads) {
      validateUpload(input);
      const storagePath = `${args.prefix}/${randomUUID()}.${extensionFor(input.file, input.mediaType)}`;
      const bytes = new Uint8Array(await input.file.arrayBuffer());
      const { error } = await args.admin.storage
        .from(FLEET_DRIVER_EVIDENCE_BUCKET)
        .upload(storagePath, bytes, {
          contentType: input.file.type,
          upsert: false,
        });
      if (error) throw new Error("Evidence upload failed. Please try again.");

      uploadedPaths.push(storagePath);
      metadata.push({
        storagePath,
        itemId: input.itemId,
        mediaType: input.mediaType,
        mimeType: input.file.type,
        sizeBytes: input.file.size,
      });
    }
    return metadata;
  } catch (error) {
    await removeFleetDriverEvidence(args.admin, uploadedPaths);
    throw error;
  }
}

export async function removeFleetDriverEvidence(
  admin: AdminClient,
  paths: string[],
): Promise<void> {
  if (!paths.length) return;
  const { error } = await admin.storage
    .from(FLEET_DRIVER_EVIDENCE_BUCKET)
    .remove(paths);
  if (error) {
    console.error("[fleet/evidence] cleanup failed", error.message);
  }
}
