"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import ModalShell from "@/features/shared/components/ModalShell";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
}

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_EXTENSION_RE = /\.(avif|heic|heif|jpe?g|png|webp)$/i;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function isPhotoFile(file: File): boolean {
  return file.type.startsWith("image/") || PHOTO_EXTENSION_RE.test(file.name);
}

function validatePhoto(file: File): string | null {
  if (!isPhotoFile(file)) return "Choose an image file.";
  if (file.size > MAX_PHOTO_BYTES) {
    return `This photo is ${formatBytes(file.size)}. Choose one smaller than 15 MB.`;
  }
  return null;
}

export default function PhotoCaptureModal({ isOpen, onClose, onCapture }: Props) {
  const pathname = usePathname();
  const mobileRoute = pathname.startsWith("/mobile");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(() => {
    if (!file || !isPhotoFile(file)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const reset = () => {
    setFile(null);
    setError(null);
    setBusy(false);
    if (cameraRef.current) cameraRef.current.value = "";
    if (pickerRef.current) pickerRef.current.value = "";
  };

  useEffect(() => {
    if (!isOpen) reset();
    else setError(null);
    // reset is intentionally local to this modal lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const upload = async (selected: File) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFile(selected);
    try {
      await onCapture(selected);
      reset();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Photo upload failed.");
      setFile(selected);
    } finally {
      setBusy(false);
    }
  };

  const selectFile = (selected: File | null) => {
    if (!selected || busy) return;
    const validationError = validatePhoto(selected);
    if (validationError) {
      setError(validationError);
      setFile(null);
      return;
    }

    setFile(selected);
    setError(null);

    // The camera or photo library already gives the technician a native
    // confirmation step. On mobile, attach immediately after that selection.
    if (mobileRoute) void upload(selected);
  };

  const submit = async () => {
    if (!file) {
      setError("Take a photo or choose one first.");
      return;
    }
    await upload(file);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      onSubmit={mobileRoute ? undefined : submit}
      title="ADD PHOTO"
      submitText={busy ? "Uploading…" : "Attach photo"}
      size="sm"
      hideFooter={mobileRoute}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper-light)]">
            Job evidence
          </div>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            Take a new photo or attach one already on this device.
            {mobileRoute ? " It uploads as soon as you confirm it." : " Review it before attaching."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="min-h-24 rounded-2xl border border-[var(--accent-copper-soft)]/70 bg-[color:var(--theme-surface-overlay)] p-3 text-left transition active:scale-[0.98] disabled:opacity-55"
          >
            <div className="text-2xl" aria-hidden="true">
              📷
            </div>
            <div className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
              Take photo
            </div>
            <div className="mt-1 text-[0.68rem] text-[color:var(--theme-text-secondary)]">
              Open the rear camera
            </div>
          </button>

          <button
            type="button"
            onClick={() => pickerRef.current?.click()}
            disabled={busy}
            className="min-h-24 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3 text-left transition active:scale-[0.98] disabled:opacity-55"
          >
            <div className="text-2xl" aria-hidden="true">
              🖼️
            </div>
            <div className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">
              Choose existing
            </div>
            <div className="mt-1 text-[0.68rem] text-[color:var(--theme-text-secondary)]">
              Photos or files
            </div>
          </button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          className="hidden"
        />
        <input
          ref={pickerRef}
          type="file"
          accept="image/*,.heic,.heif"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          className="hidden"
        />

        {busy ? (
          <div className="rounded-xl border border-[var(--accent-copper-soft)]/50 bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)]">
            <div className="font-semibold">Uploading photo…</div>
            <div className="mt-1 truncate text-xs text-[color:var(--theme-text-secondary)]">
              {file?.name ?? "Selected photo"}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-950/35 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        ) : null}

        {file && !busy ? (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
            <div className="flex items-start gap-3">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Selected job photo"
                  className="h-16 w-16 rounded-xl border border-[color:var(--theme-border-soft)] object-cover"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] text-xs text-[color:var(--theme-text-secondary)]">
                  Photo
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {file.name}
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                  {formatBytes(file.size)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mobileRoute ? (
                    <button
                      type="button"
                      onClick={() => void upload(file)}
                      className="rounded-full bg-[color:var(--accent-copper)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Retry upload
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
