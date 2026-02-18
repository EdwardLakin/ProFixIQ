// /features/inspections/lib/inspection/PhotoUploadButton.tsx ✅ FULL FILE REPLACEMENT (NO any)
// Fixes Vercel build: makes inspectionId optional (callers may omit it)
// Upload is blocked until inspectionId is present.

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import PhotoThumbnail from "@inspections/components/inspection/PhotoThumbnail";

type PhotoUploadButtonProps = {
  photoUrls: string[];
  onChange: (urls: string[]) => void;

  /**
   * ✅ Optional so older callers (InspectionMenuClient / InspectionItemCard)
   * don't hard-fail TypeScript builds.
   *
   * Upload is disabled if missing.
   */
  inspectionId?: string;

  itemName?: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

export default function PhotoUploadButton({
  photoUrls,
  onChange,
  inspectionId,
  itemName,
}: PhotoUploadButtonProps) {
  const [urls, setUrls] = useState<string[]>(photoUrls ?? []);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setUrls(photoUrls ?? []);
  }, [photoUrls]);

  const canUpload =
    typeof inspectionId === "string" && inspectionId.trim().length > 0;

  async function uploadOne(file: File): Promise<string | null> {
    if (!canUpload) {
      toast.error("Missing inspectionId — photo upload is disabled.");
      return null;
    }

    const fd = new FormData();
    fd.set("inspectionId", inspectionId!.trim());

    const safeItem = getString(itemName);
    if (safeItem) fd.set("itemName", safeItem);

    fd.set("file", file);

    const res = await fetch("/api/inspections/photos/upload", {
      method: "POST",
      body: fd,
    });

    const json = (await res.json().catch(() => null)) as unknown;

    if (!res.ok) {
      const msg =
        isRecord(json) && typeof json.error === "string"
          ? json.error
          : "Upload failed";
      throw new Error(msg);
    }

    const url = isRecord(json) && typeof json.url === "string" ? json.url : null;
    return url;
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    if (!canUpload) {
      toast.error("This screen didn't provide an inspectionId yet.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploaded: string[] = [];

      for (const f of files) {
        const url = await uploadOne(f);
        if (url) uploaded.push(url);
      }

      const updated = [...urls, ...uploaded];
      setUrls(updated);
      onChange(updated);

      toast.success(
        `Uploaded ${uploaded.length} photo${uploaded.length === 1 ? "" : "s"}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Photo upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = (index: number) => {
    const updated = urls.filter((_, i) => i !== index);
    setUrls(updated);
    onChange(updated);
  };

  return (
    <div className="mt-2">
      <label className="mb-1 block text-xs font-bold text-white">
        Upload Photos
      </label>

      <div className="flex flex-wrap">
        {urls.map((url, i) => (
          <PhotoThumbnail key={url + i} url={url} onRemove={() => handleRemove(i)} />
        ))}
      </div>

      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading || !canUpload}
        className="mt-2 block text-sm text-gray-300 file:rounded-full file:border-0
        file:bg-orange-700 file:text-sm file:font-semibold file:text-white
        hover:file:bg-orange-600 disabled:opacity-60"
      />

      {!canUpload && (
        <div className="mt-1 text-[11px] text-amber-200/80">
          Photo upload disabled (missing inspectionId).
        </div>
      )}
    </div>
  );
}