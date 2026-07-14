
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@shared/components/ui/Button";

type DutyClass = "light" | "medium" | "heavy";

type UploadStatus = "parsed" | "failed" | "processing" | string;

type UploadResponse = {
  id: string;
  status: UploadStatus;
  storage_path?: string | null;
  error?: string | null;
};

const ALLOWED_IMAGE_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/tiff",
]);

type QualityResult = {
  ok: boolean;
  reasons: string[];
  metrics: {
    width: number;
    height: number;
    brightness: number; // 0..255
    sharpness: number; // variance-ish
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Simple low-quality detection:
 * - minimum resolution
 * - too dark / too bright (avg brightness)
 * - blur-ish score (variance of a Laplacian approximation)
 */
async function assessImageQuality(file: File): Promise<QualityResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = url;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // Downscale for analysis speed (keep aspect)
    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const w = Math.max(1, Math.floor(width * scale));
    const h = Math.max(1, Math.floor(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return {
        ok: true, // fail open
        reasons: [],
        metrics: { width, height, brightness: 128, sharpness: 0 },
      };
    }

    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Brightness avg (simple luma)
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      // Rec. 601 luma
      sum += 0.299 * r + 0.587 * g + 0.114 * b;
    }
    const pixels = w * h;
    const brightness = pixels > 0 ? sum / pixels : 128;

    // Blur-ish: Laplacian variance approximation on grayscale
    // Convert to gray array
    const gray = new Float32Array(pixels);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx] ?? 0;
        const g = data[idx + 1] ?? 0;
        const b = data[idx + 2] ?? 0;
        gray[y * w + x] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }

    // Laplacian: center*4 - (up+down+left+right)
    let lapSum = 0;
    let lapSumSq = 0;
    let count = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const c = gray[y * w + x] ?? 0;
        const up = gray[(y - 1) * w + x] ?? 0;
        const dn = gray[(y + 1) * w + x] ?? 0;
        const lf = gray[y * w + (x - 1)] ?? 0;
        const rt = gray[y * w + (x + 1)] ?? 0;
        const lap = 4 * c - up - dn - lf - rt;
        lapSum += lap;
        lapSumSq += lap * lap;
        count++;
      }
    }

    const mean = count > 0 ? lapSum / count : 0;
    const variance = count > 0 ? lapSumSq / count - mean * mean : 0;
    const sharpness = Math.max(0, variance);

    const reasons: string[] = [];

    // Hard minimum size (original resolution, not scaled)
    const minWidth = 900;
    const minHeight = 900;
    if (width < minWidth || height < minHeight) {
      reasons.push(
        `Low resolution (${width}×${height}). Try a closer photo or higher quality scan.`,
      );
    }

    // Brightness thresholds (tunable)
    if (brightness < 55) reasons.push("Image looks too dark. Add light or use flash.");
    if (brightness > 215) reasons.push("Image looks overexposed. Reduce glare/brightness.");

    // Sharpness threshold (tunable; depends on downscale)
    // Smaller number = more forgiving
    if (sharpness < 65) {
      reasons.push("Image looks blurry. Hold steady, tap to focus, or re-scan.");
    }

    const ok = reasons.length === 0;

    return {
      ok,
      reasons,
      metrics: {
        width,
        height,
        brightness: clamp(brightness, 0, 255),
        sharpness,
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fileFromCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<File> {
  const blob: Blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("Failed to create image blob"));
        else resolve(b);
      },
      "image/jpeg",
      0.92,
    );
  });

  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

export default function FleetFormImportCard() {
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [vehicleType, setVehicleType] = useState<string>("");
  const [dutyClass, setDutyClass] = useState<DutyClass | "">("");
  const [titleHint, setTitleHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Camera capture UI
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const canSubmit = files.length > 0 && !loading;

  const acceptAttr = useMemo(() => {
    // Image-only UX (route can still reject if wrong)
    return "image/*";
  }, []);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const openCamera = useCallback(async () => {
    setCameraError(null);
    setCameraOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Camera permission denied";
      setCameraError(msg);
      stopCamera();
    }
  }, [stopCamera]);

  const closeCamera = useCallback(() => {
    stopCamera();
    setCameraOpen(false);
  }, [stopCamera]);

  const addValidatedFiles = useCallback(async (incoming: File[]) => {
    setErrorMsg(null);

    const next: File[] = [];

    for (const f of incoming) {
      // eslint-disable-next-line no-console
      console.log("[fleet forms] selected file:", {
        name: f.name,
        type: f.type,
        size: f.size,
      });

      if (f.size === 0) {
        setErrorMsg("One of the selected files is empty. Please choose another.");
        return;
      }

      if (!ALLOWED_IMAGE_MIME_TYPES.has(f.type)) {
        setErrorMsg(
          "Unsupported file type. Upload images only (JPEG, PNG, HEIC, HEIF, WEBP, or TIFF).",
        );
        return;
      }

      // Low-quality detection
      try {
        const quality = await assessImageQuality(f);
        // eslint-disable-next-line no-console
        console.log("[fleet forms] quality:", { name: f.name, ...quality });

        if (!quality.ok) {
          setErrorMsg(
            `Low quality image detected (${f.name}).\n` + quality.reasons.join(" "),
          );
          return;
        }
      } catch (err) {
        // If quality check fails, do not block upload (fail open)
        // eslint-disable-next-line no-console
        console.warn("[fleet forms] quality check failed (fail-open):", err);
      }

      next.push(f);
    }

    setFiles((prev) => {
      // Keep order: existing then new
      return [...prev, ...next];
    });
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files ? Array.from(e.target.files) : [];
      // reset the input so selecting same file again still triggers onChange
      e.target.value = "";
      if (list.length === 0) return;
      await addValidatedFiles(list);
    },
    [addValidatedFiles],
  );

  const handleRemove = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleCapture = useCallback(async () => {
    setErrorMsg(null);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      setErrorMsg("Camera not ready.");
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      setErrorMsg("Camera not ready yet—try again in a second.");
      return;
    }

    // Capture frame
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setErrorMsg("Camera capture failed.");
      return;
    }

    ctx.drawImage(video, 0, 0, vw, vh);

    const timestamp = Date.now();
    const filename = `fleet-form-${timestamp}.jpg`;

    try {
      const file = await fileFromCanvas(canvas, filename);
      await addValidatedFiles([file]);
      closeCamera();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Capture error:", err);
      setErrorMsg("Failed to capture photo.");
    }
  }, [addValidatedFiles, closeCamera]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (files.length === 0) {
        setErrorMsg("Upload clear images of the form (photos or scans).");
        return;
      }

      setLoading(true);
      setProgress({ current: 0, total: files.length });
      setErrorMsg(null);

      const uploadIds: string[] = [];

      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i] as File;

          setProgress({ current: i + 1, total: files.length });

          const formData = new FormData();
          formData.append("file", f); // existing route expects "file"
          if (vehicleType) formData.append("vehicleType", vehicleType);
          if (dutyClass) formData.append("dutyClass", dutyClass);
          if (titleHint) formData.append("titleHint", titleHint);

          const res = await fetch("/api/fleet/forms/upload", {
            method: "POST",
            body: formData,
          });

          const data = (await res.json().catch(() => null)) as
            | UploadResponse
            | { error?: string }
            | null;

          if (!res.ok) {
            const err =
              (data && "error" in data && typeof data.error === "string"
                ? data.error
                : null) || `Upload failed (${res.status})`;
            setErrorMsg(err);
            return;
          }

          if (!data || !("id" in data)) {
            setErrorMsg("Upload succeeded but response was incomplete.");
            return;
          }

          const uploadData = data as UploadResponse;

          if (!uploadData.id) {
            setErrorMsg("Upload succeeded but no upload id was returned.");
            return;
          }

          if (uploadData.status !== "parsed") {
            const detailedError =
              (uploadData.error && uploadData.error.trim().length > 0
                ? uploadData.error
                : null) ??
              `Form uploaded but scan did not complete successfully (status: ${uploadData.status}).`;

            // eslint-disable-next-line no-console
            console.error("Fleet form scan failed:", uploadData);

            setErrorMsg(detailedError);
            return;
          }

          uploadIds.push(uploadData.id);
        }

        if (uploadIds.length === 0) {
          setErrorMsg("No uploads completed.");
          return;
        }

        // Forward user into Review & Map
        const qs = new URLSearchParams();
        qs.set("uploadId", uploadIds[0] ?? "");
        qs.set("uploadIds", uploadIds.join(","));
        if (vehicleType) qs.set("vehicleType", vehicleType);
        if (dutyClass) qs.set("dutyClass", dutyClass);
        if (titleHint) qs.set("titleHint", titleHint);

        router.push(`/inspections/fleet-review?${qs.toString()}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Fleet import error:", err);
        setErrorMsg("Unexpected error uploading fleet form.");
      } finally {
        setLoading(false);
        setProgress(null);
      }
    },
    [dutyClass, files, router, titleHint, vehicleType],
  );

  return (
    <div className="space-y-3">
      <form
        onSubmit={handleSubmit}
        className="
          relative rounded-2xl border border-[rgba(100,116,139,0.34)]
          bg-[linear-gradient(180deg,var(--theme-surface-inset),var(--theme-surface-inset))]
          shadow-[var(--theme-shadow-medium)] backdrop-blur-xl p-5
        "
      >
        {/* Copper glow wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_16%_10%,rgba(59,130,246,0.14),transparent_48%),radial-gradient(circle_at_84%_8%,rgba(64,84,120,0.14),transparent_42%)]"
        />

        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Fleet Form Import
            </div>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              Convert a fleet’s current inspection sheet into a ProFixIQ template.
            </p>
          </div>

          <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Beta
          </span>
        </div>

        {/* FILE + TITLE */}
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          {/* File input */}
          <label className="flex flex-col gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Form images (page 1–n)
            <input
              type="file"
              accept={acceptAttr}
              multiple
              onChange={handleFileChange}
              className="
                rounded-xl border border-[rgba(125,134,153,0.56)]
                bg-[var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]
                file:mr-2 file:rounded-lg file:border file:border-[rgba(100,116,139,0.5)]
                file:bg-[var(--theme-surface-inset)] file:px-3 file:py-1.5 file:text-[10px] file:uppercase
                file:tracking-[0.18em] file:text-[color:var(--theme-text-secondary)]
                hover:file:bg-[var(--theme-surface-inset)]
              "
            />
            <span className="mt-1 text-[10px] text-[color:var(--theme-text-muted)]">
              Upload clear photos/scans (JPEG, PNG, HEIC, WEBP, or TIFF). One image per page.
            </span>
          </label>

          {/* Title hint */}
          <label className="flex flex-col gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Optional title
            <input
              value={titleHint}
              onChange={(e) => setTitleHint(e.target.value)}
              placeholder="ABC Logistics – Daily Truck Inspection"
              className="
                rounded-xl border border-[rgba(125,134,153,0.56)]
                bg-[var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)]
              "
            />
          </label>
        </div>

        {/* Selected files list */}
        {files.length > 0 && (
          <div className="mb-4 rounded-xl border border-[rgba(84,96,122,0.5)] bg-[var(--theme-surface-inset)] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Selected pages ({files.length})
            </div>
            <ul className="space-y-2">
              {files.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(72,84,110,0.52)] bg-[var(--theme-surface-inset)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs text-[color:var(--theme-text-primary)]">
                      {idx + 1}. {f.name}
                    </div>
                    <div className="text-[10px] text-[color:var(--theme-text-muted)]">
                      {f.type} • {formatBytes(f.size)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="rounded-full border border-[rgba(100,116,139,0.42)] bg-[var(--theme-surface-inset)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)] hover:bg-[var(--theme-surface-inset)]"
                    aria-label={`Remove ${f.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* VEHICLE TYPE + DUTY + ACTIONS */}
        <div className="mb-4 grid gap-4 md:grid-cols-[1fr,1fr,auto,auto]">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Vehicle type
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="
                rounded-xl border border-[rgba(125,134,153,0.56)]
                bg-[var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]
              "
            >
              <option value="">Not specified</option>
              <option value="car">Car / SUV</option>
              <option value="truck">Truck / Tractor</option>
              <option value="bus">Bus / Coach</option>
              <option value="trailer">Trailer</option>
              <option value="mixed">Mixed Fleet</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Duty class
            <select
              value={dutyClass}
              onChange={(e) => setDutyClass(e.target.value as DutyClass | "")}
              className="
                rounded-xl border border-[rgba(125,134,153,0.56)]
                bg-[var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]
              "
            >
              <option value="">Not specified</option>
              <option value="light">Light</option>
              <option value="medium">Medium</option>
              <option value="heavy">Heavy</option>
            </select>
            <span className="mt-1 text-[10px] text-[color:var(--theme-text-muted)]">
              Helps auto-select hydraulic or air brake grids.
            </span>
          </label>

          <div className="flex flex-col justify-end">
            <Button
              type="button"
              disabled={loading}
              onClick={openCamera}
              className="
                w-full rounded-xl border border-[rgba(100,116,139,0.45)]
                bg-[var(--theme-surface-inset)] px-4 py-2 text-[11px] uppercase tracking-[0.16em]
                text-[color:var(--theme-text-primary)] hover:bg-[var(--theme-surface-inset)] hover:border-[rgba(148,163,184,0.62)]
                disabled:opacity-50
              "
            >
              Camera
            </Button>
          </div>

          <div className="flex flex-col justify-end">
            <Button
              type="submit"
              disabled={!canSubmit}
              className="
                w-full rounded-xl border border-[rgba(100,116,139,0.45)]
                bg-[var(--theme-surface-inset)] px-4 py-2 text-[11px] uppercase tracking-[0.16em]
                text-[color:var(--theme-text-primary)] hover:bg-[var(--theme-surface-inset)] hover:border-[rgba(148,163,184,0.62)]
                disabled:opacity-50
              "
            >
              {loading
                ? progress
                  ? `Uploading ${progress.current}/${progress.total}…`
                  : "Uploading…"
                : "Upload & Scan"}
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="whitespace-pre-line rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200">
            {errorMsg}
          </div>
        )}

        {!errorMsg && (
          <p className="mt-2 text-[10px] text-[color:var(--theme-text-muted)]">
            Upload images → AI reads each page → Review & map sections → Save as template.
          </p>
        )}
      </form>

      {/* Camera modal (simple, dependency-free) */}
      {cameraOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--theme-surface-overlay)] p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[rgba(110,119,138,0.55)] bg-[var(--theme-gradient-panel)] shadow-[var(--theme-shadow-medium)]">
            <div className="flex items-center justify-between border-b border-[rgba(110,119,138,0.45)] px-4 py-3">
              <div className="text-[11px] font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Camera Capture
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-full border border-[rgba(100,116,139,0.45)] bg-[var(--theme-surface-inset)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)] hover:bg-[var(--theme-surface-inset)]"
              >
                Close
              </button>
            </div>

            <div className="p-4">
              {cameraError ? (
                <div className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-200">
                  {cameraError}
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="aspect-video w-full rounded-xl border border-[rgba(110,119,138,0.45)] bg-[color:var(--theme-surface-page)]"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCapture}
                      className="
                        rounded-xl border border-[rgba(100,116,139,0.45)]
                        bg-[var(--theme-surface-inset)] px-4 py-2 text-[11px] uppercase tracking-[0.16em]
                        text-[color:var(--theme-text-primary)] hover:bg-[var(--theme-surface-inset)] hover:border-[rgba(148,163,184,0.62)]
                      "
                    >
                      Capture
                    </button>
                  </div>

                  <p className="mt-2 text-[10px] text-[color:var(--theme-text-muted)]">
                    Tip: Fill the frame, avoid glare, and tap-to-focus before capturing.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
