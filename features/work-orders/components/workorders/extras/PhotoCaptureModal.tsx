// features/work-orders/components/workorders/extras/PhotoCaptureModal.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

type Source = "camera" | "photos_files";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function isImageFile(file: File): boolean {
  return typeof file.type === "string" && file.type.startsWith("image/");
}

export default function PhotoCaptureModal({ isOpen, onClose, onCapture }: Props) {
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

  // cleanup preview blob URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // reset when modal opens/closes
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
      // camera forced
      cameraRef.current?.click();
      return;
    }

    // photos/files picker (no capture)
    pickerRef.current?.click();
  };

  const handleFile = (f: File | null) => {
    if (!f) return;

    // basic guardrails
    if (!isImageFile(f)) {
      setErr("Please select an image file.");
      return;
    }

    // optional: soft limit (adjust or remove)
    const maxBytes = 15 * 1024 * 1024;
    if (f.size > maxBytes) {
      setErr(`Image is too large (${formatBytes(f.size)}). Please use a smaller photo.`);
      return;
    }

    setFile(f);
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
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
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Source
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              className="w-full rounded-md border border-[var(--metal-border-soft)] bg-black/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
            >
              <option value="camera">Camera</option>
              <option value="photos_files">Photos / Files</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handlePick}
            className="inline-flex items-center justify-center rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-100 hover:bg-white/5"
          >
            Choose
          </button>
        </div>

        {/* hidden inputs (we programmatically click them) */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/35 px-3 py-2 text-xs text-red-100">
            {err}
          </div>
        )}

        {/* preview */}
        <div className="rounded-xl border border-[var(--metal-border-soft)] bg-black/50 p-3">
          {file ? (
            <div className="flex items-start gap-3">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Selected"
                  className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-xs text-neutral-400">
                  IMG
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-neutral-100">
                  {file.name}
                </div>
                <div className="mt-0.5 text-xs text-neutral-400">
                  {formatBytes(file.size)}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={busy}
                    className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-white/5 disabled:opacity-60"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={handlePick}
                    disabled={busy}
                    className="rounded-full border border-[var(--accent-copper-soft)]/70 bg-black/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-copper-soft)] hover:bg-[var(--accent-copper-faint)] disabled:opacity-60"
                  >
                    Replace
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-400">
              Pick a job photo. On mobile, “Camera” opens the camera. “Photos / Files” opens your library or file picker.
            </div>
          )}
        </div>

        {/* small helper */}
        <p className="text-[11px] text-neutral-500">
          Tip: Use <span className="text-neutral-300">Photos / Files</span> if you need to select an existing picture instead of capturing a new one.
        </p>

        {/* soft-disable submit by messaging (ModalShell likely controls button; we still guard in submit) */}
        {!file && (
          <div className="text-[11px] text-amber-200/90">
            Choose a photo to enable upload.
          </div>
        )}
      </div>
    </ModalShell>
  );
}