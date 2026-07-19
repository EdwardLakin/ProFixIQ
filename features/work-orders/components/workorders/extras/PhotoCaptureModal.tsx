"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import ModalShell from "@/features/shared/components/ModalShell";

type Source = "camera" | "photos_files";

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

function isImageFile(file: File): boolean {
  return typeof file.type === "string" && file.type.startsWith("image/");
}

function isMobilePhotoFile(file: File): boolean {
  return isImageFile(file) || PHOTO_EXTENSION_RE.test(file.name);
}

function validateMobilePhoto(file: File): string | null {
  if (!isMobilePhotoFile(file)) return "Choose an image file.";
  if (file.size > MAX_PHOTO_BYTES) {
    return `This photo is ${formatBytes(file.size)}. Choose one smaller than 15 MB.`;
  }
  return null;
}

export default function PhotoCaptureModal(props: Props) {
  const pathname = usePathname();
  return pathname.startsWith("/mobile") ? (
    <MobilePhotoCaptureModal {...props} />
  ) : (
    <DesktopPhotoCaptureModal {...props} />
  );
}

function MobilePhotoCaptureModal({ isOpen, onClose, onCapture }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(() => {
    if (!file || !isMobilePhotoFile(file)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      return;
    }
    setFile(null);
    setBusy(false);
    setError(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (pickerRef.current) pickerRef.current.value = "";
  }, [isOpen]);

  const reset = () => {
    setFile(null);
    setBusy(false);
    setError(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (pickerRef.current) pickerRef.current.value = "";
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const upload = async (selected: File) => {
    if (busy) return;
    setFile(selected);
    setBusy(true);
    setError(null);
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
    const validationError = validateMobilePhoto(selected);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }
    setFile(selected);
    setError(null);
    void upload(selected);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      title="ADD PHOTO"
      size="sm"
      hideFooter
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper-light)]">
            Job evidence
          </div>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            Take a new photo or attach one already on this device. It uploads as
            soon as you confirm it.
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
                  <button
                    type="button"
                    onClick={() => void upload(file)}
                    className="rounded-full bg-[color:var(--accent-copper)] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Retry upload
                  </button>
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

function DesktopPhotoCaptureModal({ isOpen, onClose, onCapture }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source>("camera");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    if (!isImageFile(file)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setErr(null);
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (pickerRef.current) pickerRef.current.value = "";
      return;
    }
    setErr(null);
  }, [isOpen]);

  const handlePick = () => {
    setErr(null);
    if (source === "camera") {
      cameraRef.current?.click();
      return;
    }
    pickerRef.current?.click();
  };

  const handleFile = (selected: File | null) => {
    if (!selected) return;
    if (!isImageFile(selected)) {
      setErr("Please select an image file.");
      return;
    }
    if (selected.size > MAX_PHOTO_BYTES) {
      setErr(
        `Image is too large (${formatBytes(selected.size)}). Please use a smaller photo.`,
      );
      return;
    }
    setFile(selected);
    setErr(null);
  };

  const clearFile = () => {
    setFile(null);
    setErr(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (pickerRef.current) pickerRef.current.value = "";
  };

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onCapture(file);
      onClose();
      clearFile();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => {
        onClose();
        clearFile();
      }}
      onSubmit={submit}
      title="Attach Photo"
      submitText={busy ? "Uploading…" : "Upload"}
      size="sm"
    >
      <div className="space-y-3">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper-light)]">
            Job photo
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Attach supporting evidence for the job card, approval flow, and future
            history.
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Source
            </label>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as Source)}
              className="w-full rounded-md border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
            >
              <option value="camera">Camera</option>
              <option value="photos_files">Photos / Files</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handlePick}
            className="inline-flex items-center justify-center rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
          >
            Choose
          </button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          className="hidden"
        />
        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          className="hidden"
        />

        {err ? (
          <div className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-xs text-red-100">
            {err}
          </div>
        ) : null}

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          {file ? (
            <div className="flex items-start gap-3">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Selected"
                  className="h-16 w-16 rounded-lg border border-[color:var(--theme-border-soft)] object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] text-xs text-[color:var(--theme-text-secondary)]">
                  IMG
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {file.name}
                </div>
                <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                  {formatBytes(file.size)}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={busy}
                    className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={handlePick}
                    disabled={busy}
                    className="rounded-full border border-[var(--accent-copper-soft)]/70 bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-copper-soft)] hover:bg-[var(--accent-copper-faint)] disabled:opacity-60"
                  >
                    Replace
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-[color:var(--theme-text-secondary)]">
              Pick a job photo. On mobile, “Camera” opens the camera. “Photos /
              Files” opens your library or file picker.
            </div>
          )}
        </div>

        <p className="text-[11px] text-[color:var(--theme-text-muted)]">
          Tip: Use{" "}
          <span className="text-[color:var(--theme-text-secondary)]">
            Photos / Files
          </span>{" "}
          if you need to select an existing picture instead of capturing a new
          one.
        </p>

        {!file ? (
          <div className="text-[11px] text-amber-200/90">
            Choose a photo to enable upload.
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
