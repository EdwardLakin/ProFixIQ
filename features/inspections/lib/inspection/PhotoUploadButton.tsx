"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import PhotoThumbnail from "@inspections/components/inspection/PhotoThumbnail";
import {
  INSPECTION_PHOTO_SYNCED_EVENT,
  listStagedInspectionPhotos,
  stageInspectionPhoto,
  type StagedInspectionPhoto,
} from "@inspections/lib/inspection/inspectionPhotoStaging";
import {
  dismissOfflineMutation,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";

type PhotoUploadButtonProps = {
  photoUrls: string[];
  onChange: (urls: string[]) => void;
  inspectionId?: string;
  itemName?: string | null;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  draftKey?: string;
  sectionIndex?: number;
  itemIndex?: number;
};

type StagedPreview = StagedInspectionPhoto & { previewUrl: string };
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

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
  workOrderId,
  workOrderLineId,
  draftKey,
  sectionIndex,
  itemIndex,
}: PhotoUploadButtonProps) {
  const [urls, setUrls] = useState<string[]>(photoUrls ?? []);
  const [staged, setStaged] = useState<StagedPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const urlsRef = useRef(urls);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    const next = photoUrls ?? [];
    urlsRef.current = next;
    setUrls(next);
  }, [photoUrls]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const canUpload = Boolean(getString(inspectionId));
  const canStage = Boolean(
    canUpload &&
    getString(draftKey) &&
    getString(workOrderLineId) &&
    Number.isInteger(sectionIndex) &&
    Number.isInteger(itemIndex),
  );

  useEffect(() => {
    if (
      !canStage ||
      !draftKey ||
      typeof sectionIndex !== "number" ||
      typeof itemIndex !== "number"
    ) {
      setStaged([]);
      return;
    }
    let cancelled = false;
    let previews: StagedPreview[] = [];
    const refresh = async () => {
      const records = await listStagedInspectionPhotos({
        draftKey,
        sectionIndex,
        itemIndex,
      });
      if (cancelled) return;
      const next = records.map((record) => ({
        ...record,
        previewUrl: URL.createObjectURL(record.blob),
      }));
      previews.forEach((preview) => URL.revokeObjectURL(preview.previewUrl));
      previews = next;
      setStaged(next);
    };
    const unsubscribe = subscribeOfflineMutations(() => void refresh());
    const onSynced = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          draftKey?: string;
          sectionIndex?: number;
          itemIndex?: number;
          url?: string;
        }>
      ).detail;
      if (
        detail?.draftKey !== draftKey ||
        detail.sectionIndex !== sectionIndex ||
        detail.itemIndex !== itemIndex ||
        !detail.url
      ) {
        return;
      }
      if (!urlsRef.current.includes(detail.url)) {
        const next = [...urlsRef.current, detail.url];
        urlsRef.current = next;
        setUrls(next);
        onChangeRef.current(next);
      }
      void refresh();
    };
    window.addEventListener(INSPECTION_PHOTO_SYNCED_EVENT, onSynced);
    void refresh();
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener(INSPECTION_PHOTO_SYNCED_EVENT, onSynced);
      previews.forEach((preview) => URL.revokeObjectURL(preview.previewUrl));
    };
  }, [canStage, draftKey, sectionIndex, itemIndex]);

  async function uploadOne(file: File): Promise<string | null> {
    if (!canUpload) {
      toast.error("Missing inspectionId — photo upload is disabled.");
      return null;
    }

    const form = new FormData();
    form.set("inspectionId", inspectionId!.trim());
    const safeItem = getString(itemName);
    if (safeItem) form.set("itemName", safeItem);
    const safeWo = getString(workOrderId);
    if (safeWo) form.set("workOrderId", safeWo);
    const safeWol = getString(workOrderLineId);
    if (safeWol) form.set("workOrderLineId", safeWol);
    form.set("file", file);

    const response = await fetch("/api/inspections/photos/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const json = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(
        isRecord(json) && typeof json.error === "string"
          ? json.error
          : "Upload failed",
      );
    }
    return isRecord(json) && typeof json.url === "string" ? json.url : null;
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (!canUpload) {
      toast.error("This screen didn't provide an inspectionId yet.");
      event.target.value = "";
      return;
    }

    setUploading(true);
    let queued = 0;
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        if (!file.type.toLowerCase().startsWith("image/")) {
          throw new Error(`${file.name} is not an image.`);
        }
        if (file.size > MAX_PHOTO_BYTES) {
          throw new Error(`${file.name} is larger than 15 MB.`);
        }
        if (
          canStage &&
          draftKey &&
          workOrderLineId &&
          typeof sectionIndex === "number" &&
          typeof itemIndex === "number"
        ) {
          const result = await stageInspectionPhoto({
            draftKey,
            inspectionId: inspectionId!.trim(),
            workOrderId,
            workOrderLineId,
            itemName,
            sectionIndex,
            itemIndex,
            file,
          });
          if (result.queued) queued += 1;
          else if (result.url) uploaded.push(result.url);
        } else {
          const url = await uploadOne(file);
          if (url) uploaded.push(url);
        }
      }

      if (uploaded.length) {
        const next = [...urlsRef.current, ...uploaded].filter(
          (url, index, all) => all.indexOf(url) === index,
        );
        urlsRef.current = next;
        setUrls(next);
        onChangeRef.current(next);
      }
      if (queued) {
        toast.warning(
          `${queued} photo${queued === 1 ? "" : "s"} safe on this device and queued.`,
        );
      }
      if (uploaded.length) {
        toast.success(
          `Uploaded ${uploaded.length} photo${uploaded.length === 1 ? "" : "s"}.`,
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Photo staging failed",
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleRemove = (index: number) => {
    const next = urls.filter((_, current) => current !== index);
    urlsRef.current = next;
    setUrls(next);
    onChangeRef.current(next);
  };

  const removeStaged = async (preview: StagedPreview) => {
    await dismissOfflineMutation(preview.clientMutationId);
    URL.revokeObjectURL(preview.previewUrl);
    setStaged((current) =>
      current.filter(
        (item) => item.clientMutationId !== preview.clientMutationId,
      ),
    );
  };

  return (
    <div className="mt-2">
      <label className="mb-1 block text-xs font-bold text-[color:var(--theme-text-primary)]">
        Add photos
      </label>

      <div className="flex flex-wrap">
        {urls.map((url, index) => (
          <PhotoThumbnail
            key={url + index}
            url={url}
            onRemove={() => handleRemove(index)}
          />
        ))}
        {staged.map((preview) => (
          <PhotoThumbnail
            key={preview.clientMutationId}
            url={preview.previewUrl}
            label={
              preview.status === "conflicted"
                ? "Sync needs review"
                : preview.status === "failed"
                  ? "Waiting to retry"
                  : "Queued on device"
            }
            onRemove={() => void removeStaged(preview)}
          />
        ))}
      </div>

      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading || !canUpload}
        className="mt-2 block text-sm text-[color:var(--theme-text-secondary)] file:rounded-full file:border-0 file:bg-orange-700 file:text-sm file:font-semibold file:text-[color:var(--theme-text-primary)] hover:file:bg-orange-600 disabled:opacity-60"
      />

      {canStage && (
        <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
          Photos are kept on this device until upload completes.
        </div>
      )}
      {!canUpload && (
        <div className="mt-1 text-[11px] text-amber-200/80">
          Photo upload disabled (missing inspectionId).
        </div>
      )}
    </div>
  );
}
