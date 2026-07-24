"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import ModalShell from "@/features/shared/components/ModalShell";

type Source = "camera" | "video" | "photos_files";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
}

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const PHOTO_EXTENSION_RE = /\.(avif|heic|heif|jpe?g|png|webp)$/i;
const VIDEO_EXTENSION_RE = /\.(mov|m4v|mp4|webm)$/i;
const MEDIA_PICKER_ACCEPT = "image/*,video/*,.heic,.heif,.mov,.m4v,.mp4,.webm";

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

function isVideoFile(file: File): boolean {
  return typeof file.type === "string" && file.type.startsWith("video/");
}

function isPhotoFile(file: File): boolean {
  return isImageFile(file) || PHOTO_EXTENSION_RE.test(file.name);
}

function isMediaFile(file: File): boolean {
  return isPhotoFile(file) || isVideoFile(file) || VIDEO_EXTENSION_RE.test(file.name);
}

function mediaKind(file: File): "photo" | "video" {
  return isVideoFile(file) || VIDEO_EXTENSION_RE.test(file.name) ? "video" : "photo";
}

function validateMedia(file: File): string | null {
  if (!isMediaFile(file)) return "Choose a photo or video file.";

  if (mediaKind(file) === "video") {
    if (file.size > MAX_VIDEO_BYTES) {
      return `This video is ${formatBytes(file.size)}. Choose one smaller than 250 MB.`;
    }
    return null;
  }

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
  const videoRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(() => {
    if (!file || !isMediaFile(file)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const selectedKind = file ? mediaKind(file) : "photo";

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
    if (videoRef.current) videoRef.current.value = "";
    if (pickerRef.current) pickerRef.current.value = "";
  }, [isOpen]);

  const reset = () => {
    setFile(null);
    setBusy(false);
    setError(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (videoRef.current) videoRef.current.value = "";
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
      setError(caught instanceof Error ? caught.message : "Media upload failed.");
      setFile(selected);
    } finally {
      setBusy(false);
    }
  };

  const selectFile = (selected: File | null) => {
    if (!selected || busy) return;
    const validationError = validateMedia(selected);
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
      title="ADD PHOTO / VIDEO"
      size="sm"
      hideFooter
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
            Job media
          </div>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
            Capture a photo, record a video, or attach existing evidence to this job.
          </p>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-left text-sm font-semibold text-[color:var(--theme-text-primary)]"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
          >
            Take photo
          </button>
          <button
            type="button"
            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-left text-sm font-semibold text-[color:var(--theme-text-primary)]"
            onClick={() => videoRef.current?.click()}
            disabled={busy}
          >
            Record video
          </button>
          <button
            type="button"
            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-left text-sm font-semibold text-[color:var(--theme-text-primary)]"
            onClick={() => pickerRef.current?.click()}
            disabled={busy}
          >
            Choose existing
          </button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
        <input
          ref={videoRef}
          type="file"
          accept="video/*,.mov,.m4v,.mp4,.webm"
          capture="environment"
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
        <input
          ref={pickerRef}
          type="file"
          accept={MEDIA_PICKER_ACCEPT}
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />

        {previewUrl ? (
          <div className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
            {selectedKind === "video" ? (
              <video src={previewUrl} controls preload="metadata" className="max-h-64 w-full object-contain" />
            ) : (
              <img src={previewUrl} alt="Selected job media" className="max-h-64 w-full object-contain" />
            )}
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
              <span className="min-w-0 truncate">{file?.name}</span>
              <span className="shrink-0">{file ? formatBytes(file.size) : ""}</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {busy ? (
          <div className="text-sm text-[color:var(--theme-text-secondary)]">Uploading media...</div>
        ) : null}
      </div>
    </ModalShell>
  );
}

function DesktopPhotoCaptureModal({ isOpen, onClose, onCapture }: Props) {
  const [source, setSource] = useState<Source>("camera");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(() => {
    if (!file || !isMediaFile(file)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const selectedKind = file ? mediaKind(file) : "photo";

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
    setSource("camera");
    setFile(null);
    setBusy(false);
    setError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (pickerInputRef.current) pickerInputRef.current.value = "";
  }, [isOpen]);

  const selectFile = (selected: File | null) => {
    if (!selected || busy) return;
    const validationError = validateMedia(selected);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }
    setFile(selected);
    setError(null);
  };

  const close = () => {
    if (busy) return;
    setFile(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!file || busy) return;
    const validationError = validateMedia(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onCapture(file);
      setFile(null);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Media upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const openSelectedSource = () => {
    if (source === "camera") {
      cameraInputRef.current?.click();
      return;
    }
    if (source === "video") {
      videoInputRef.current?.click();
      return;
    }
    pickerInputRef.current?.click();
  };

  const pickButtonLabel =
    source === "camera"
      ? "Open camera"
      : source === "video"
        ? "Record video"
        : "Choose media";
  const replaceButtonLabel =
    source === "camera" ? "Retake" : source === "video" ? "Record again" : "Replace";

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      title="Attach photo / video"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!file || busy}
            className="rounded-xl bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--accent-copper-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Uploading..." : "Upload"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
            Job media
          </div>
          <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
            Attach supporting evidence for the job card, approval flow, and future history.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Source
            </span>
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value as Source);
                setFile(null);
                setError(null);
              }}
              disabled={busy}
              className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            >
              <option value="camera">Camera</option>
              <option value="video">Video</option>
              <option value="photos_files">Photos / Files</option>
            </select>
          </label>

          <button
            type="button"
            onClick={openSelectedSource}
            disabled={busy}
            className="rounded-full bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-ink)] shadow-sm hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
          >
            {file ? replaceButtonLabel : pickButtonLabel}
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*,.mov,.m4v,.mp4,.webm"
          capture="environment"
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
        <input
          ref={pickerInputRef}
          type="file"
          accept={MEDIA_PICKER_ACCEPT}
          className="sr-only"
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />

        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
          {previewUrl ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
                {selectedKind === "video" ? (
                  <video src={previewUrl} controls preload="metadata" className="max-h-72 w-full object-contain" />
                ) : (
                  <img src={previewUrl} alt="Selected job media" className="max-h-72 w-full object-contain" />
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {file?.name}
                  </div>
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    {file ? formatBytes(file.size) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openSelectedSource}
                  disabled={busy}
                  className="rounded-full bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-ink)] shadow-sm disabled:opacity-60"
                >
                  {replaceButtonLabel}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[color:var(--theme-text-secondary)]">
              Pick job media. Use Open camera for a new photo, Record video for a clip, or Choose media for an existing file.
            </div>
          )}
        </div>

        <p className="text-[11px] text-[color:var(--theme-text-muted)]">
          Tip: Use{" "}
          <span className="text-[color:var(--theme-text-secondary)]">
            Photos / Files
          </span>{" "}
          if you need to select existing pictures or videos instead of capturing new ones.
        </p>

        {!file ? (
          <div className="text-[11px] text-amber-200/90">
            Choose media to enable upload.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
