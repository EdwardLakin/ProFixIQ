"use client";

import { 
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ModalShell from "@/features/shared/components/ModalShell";
import VinCaptureModalContent from "@/features/vehicles/components/VinCaptureModal";
import { decodeVin, mapDecodedVinToVehicleSelectValues } from "@/features/shared/lib/vin/decodeVin";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";

// Optional: tame TS around experimental BarcodeDetector
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
    };
  }
}

export type VinDecodedDetail = {
  vin: string;
  year: string | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  submodel?: string | null;
  engine?: string | null;
  engineFamily?: string | null;
  engineType?: string | null;

  // extra fields from /api/vin
  engineDisplacementL?: string | null;
  engineCylinders?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  transmissionType?: string | null;
  driveType?: string | null;
  bodyClass?: string | null;
  manufacturer?: string | null;
  gvwr?: string | null;
};

type Props = {
  userId: string;
  onDecoded?: (data: VinDecodedDetail) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  /** server route that upserts (defaults to /api/vin) */
  action?: string;
};

type DecodeVinResponse = Awaited<ReturnType<typeof decodeVin>>;

type DecodeVinResponseExtended = DecodeVinResponse & {
  engineDisplacementL?: string | null;
  engineCylinders?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  transmissionType?: string | null;
  driveType?: string | null;
  bodyClass?: string | null;
  manufacturer?: string | null;
  gvwr?: string | null;
};

function isLikelyVin(s: string) {
  return normalizeVinInput(s).isValid;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function describeOcrError(status: number, fallback?: string | null) {
  if (status === 413) return "Image is too large. Upload an image 8 MB or smaller, or enter the VIN manually.";
  if (status === 415) return "Unsupported image type. Upload a JPEG, PNG, WebP, HEIC, or enter the VIN manually.";
  return fallback || "Could not read a VIN from this image. Retake the photo, upload another, or enter it manually.";
}

/** Scanner pane used in scanSlot */
function ScannerPane({
  onFoundVin,
  onError,
  isBusy,
}: {
  userId: string;
  onFoundVin: (vin: string) => void;
  onError: (message: string) => void;
  isBusy: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const lockedRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let detector:
      | InstanceType<NonNullable<typeof window.BarcodeDetector>>
      | null = null;

    const start = async () => {
      setError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setActive(true);

        if (window.BarcodeDetector) {
          detector = new window.BarcodeDetector({
            formats: ["code_39", "code_128", "pdf417", "data_matrix"],
          });

          const scan = async () => {
            if (!videoRef.current || lockedRef.current) return;
            try {
              const bitmap = await createImageBitmap(videoRef.current);
              const codes = await detector!.detect(bitmap);
              if (codes?.length) {
                for (const c of codes) {
                  const raw = String(c.rawValue ?? "");
                  const cleaned = normalizeVinInput(raw);
                  if (cleaned.isValid) {
                    lockedRef.current = true;
                    onFoundVin(cleaned.vin);
                    return;
                  }
                }
              }
            } catch {
              /* ignore transient decode errors */
            }
            raf = requestAnimationFrame(scan);
          };
          raf = requestAnimationFrame(scan);
        } else {
          const message =
            "Live barcode detection is not supported in this browser. Upload a photo or enter the VIN manually.";
          setError(message);
          onError(message);
        }
      } catch {
        const message =
          "Camera unavailable. Upload a photo or enter the VIN manually.";
        setError(message);
        onError(message);
      }
    };

    start();

    return () => {
      cancelAnimationFrame(raf);
      setActive(false);
      try {
        stream?.getTracks()?.forEach((t) => t.stop());
      } catch {
        /* no-op */
      }
    };
  }, [onError, onFoundVin]);

  return (
    <div
      className={`space-y-3 ${
        isBusy ? "ring-2 ring-cyan-500/60 rounded-md animate-pulse" : ""
      }`}
    >
      {isBusy && (
        <div className="flex items-center gap-2 rounded border border-cyan-500/50 bg-[color:var(--desktop-item-bg)] px-3 py-2">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          <span className="text-xs text-cyan-100">
            Decoding VIN… this can take a moment
          </span>
        </div>
      )}

      <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
        <video
          ref={videoRef}
          className="aspect-video w-full rounded bg-black"
          playsInline
          muted
          autoPlay
        />
      </div>

      {error ? (
        <div className="text-xs text-slate-200">{error}</div>
      ) : (
        <div className="text-xs text-neutral-400">
          {active
            ? "Point the camera at the VIN barcode / label…"
            : "Initializing camera…"}
        </div>
      )}

      {/* Photo upload → OCR route */}
      <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
        <div className="mb-2 text-sm text-neutral-200">
          Or upload a photo of the VIN label
        </div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={isBusy}
          className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-[linear-gradient(135deg,rgba(197,122,74,0.9),rgba(197,122,74,0.75))] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-black hover:file:bg-[linear-gradient(135deg,rgba(197,122,74,1),rgba(197,122,74,0.85))] disabled:opacity-60"
          onChange={async (e) => {
            if (isBusy) return;
            const file = e.target.files?.[0];
            if (!file) return;

            if (!file.type.startsWith("image/")) {
              onError("Unsupported file type. Upload an image or enter the VIN manually.");
              e.target.value = "";
              return;
            }

            if (file.size > MAX_IMAGE_BYTES) {
              onError("Image is too large. Upload an image 8 MB or smaller, or enter the VIN manually.");
              e.target.value = "";
              return;
            }

            try {
              const formData = new FormData();
              formData.append("image", file);

              const res = await fetch("/api/vin/extract-from-image", {
                method: "POST",
                body: formData,
              });

              if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as {
                  error?: string | null;
                };
                onError(describeOcrError(res.status, body.error));
                e.target.value = "";
                return;
              }

              const data = (await res.json()) as { vin?: string | null };
              const extractedVin = normalizeVinInput(data?.vin);
              const vin = extractedVin.vin;
              if (!extractedVin.isValid || !isLikelyVin(vin)) {
                onError(
                  "No clear VIN found in the photo. Retake it, upload another photo, or type the VIN manually.",
                );
                e.target.value = "";
                return;
              }

              onFoundVin(vin);
            } catch (err) {
              console.error(err);
              onError(
                "OCR failed while reading the photo. Try again, upload another photo, or enter the VIN manually.",
              );
            } finally {
              e.target.value = "";
            }
          }}
        />
        <div className="mt-2 text-[11px] text-neutral-500">
          Tip: Take a close, well-lit photo of the VIN sticker on the door frame or
          dash.
        </div>
      </div>

      <div className="text-[11px] text-neutral-500">
        We will decode with NHTSA and fill the vehicle form; you stay in control
        of saving.
      </div>
    </div>
  );
}

export default function VinCaptureModal({
  userId,
  onDecoded,
  open,
  onOpenChange,
  children,
  action = "/api/vin",
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? (open as boolean) : internalOpen;

  const setOpen = useCallback(
    (val: boolean) => {
      if (isControlled) onOpenChange?.(val);
      else setInternalOpen(val);
    },
    [isControlled, onOpenChange],
  );

  const setVehicleDraft = useWorkOrderDraft((s) => s.setVehicle);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Keep latest onDecoded
  const onDecodedRef = useRef<Props["onDecoded"]>(onDecoded);
  useEffect(() => {
    onDecodedRef.current = onDecoded;
  }, [onDecoded]);

  // Listen for result events (if server form posts and emits later)
  useEffect(() => {
    const handler = (evt: Event) => {
      const ce = evt as CustomEvent<VinDecodedDetail>;
      const detail = ce?.detail;
      if (detail?.vin) {
        onDecodedRef.current?.(detail);
        setOpen(false);
      }
    };
    window.addEventListener("vin:decoded", handler as EventListener);
    return () =>
      window.removeEventListener("vin:decoded", handler as EventListener);
  }, [setOpen]);

  const handleFoundVin = useCallback(
    async (vin: string) => {
      const normalizedVin = normalizeVinInput(vin);
      if (!normalizedVin.isValid) {
        setCaptureError(normalizedVin.message);
        return;
      }
      if (isDecoding) return; // prevent double fires
      setIsDecoding(true);
      try {
        const resp = await decodeVin(normalizedVin.vin, userId);
        if (resp?.error) {
          setCaptureError(resp.error);
          return;
        }

        const extended = resp as DecodeVinResponseExtended;
        const mapped = mapDecodedVinToVehicleSelectValues(extended);

        // hydrate shared draft
        setVehicleDraft({
          vin: normalizedVin.vin,
          year: resp.year ?? null,
          make: resp.make ?? null,
          model: resp.model ?? null,
          trim: resp.trim ?? null,
          submodel: resp.submodel ?? resp.trim ?? null,
          engine: resp.engine ?? null,
          engine_family: resp.engineFamily ?? null,
          engine_type: resp.engineType ?? null,
          transmission_type: resp.transmissionType ?? extended.transmission ?? null,
          fuel_type: mapped.fuel_type ?? null,
          drivetrain: mapped.drivetrain ?? null,
          transmission: mapped.transmission ?? null,
        });

        const detail: VinDecodedDetail = {
          vin: normalizedVin.vin,
          year: resp.year ?? null,
          make: resp.make ?? null,
          model: resp.model ?? null,
          trim: resp.trim ?? null,
          submodel: resp.submodel ?? resp.trim ?? null,
          engine: resp.engine ?? null,
          engineFamily: resp.engineFamily ?? null,
          engineType: resp.engineType ?? null,
          engineDisplacementL: extended.engineDisplacementL ?? null,
          engineCylinders: extended.engineCylinders ?? null,
          fuelType: mapped.fuel_type ?? null,
          transmission: mapped.transmission ?? null,
          transmissionType: resp.transmissionType ?? extended.transmission ?? null,
          driveType: mapped.drivetrain ?? null,
          bodyClass: extended.bodyClass ?? null,
          manufacturer: extended.manufacturer ?? null,
          gvwr: extended.gvwr ?? null,
        };

        onDecodedRef.current?.(detail);

        // fire-and-forget recalls fetch
        try {
          void fetch("/api/recalls/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vin: normalizedVin.vin,
              year: resp.year ?? undefined,
              make: resp.make ?? undefined,
              model: resp.model ?? undefined,
              user_id: userId,
            }),
            keepalive: true,
          });
        } catch {
          /* non-blocking */
        }

        setCaptureError(null);
        setOpen(false);
      } finally {
        setIsDecoding(false);
      }
    },
    [userId, setVehicleDraft, setOpen, isDecoding],
  );


  return (
    <>
      {children ? (
        <span
          onClick={() => setOpen(true)}
          role="button"
          style={{ cursor: "pointer" }}
        >
          {children}
        </span>
      ) : null}

      <ModalShell
        isOpen={isOpen}
        onClose={() => setOpen(false)}
        title="Add Vehicle by VIN"
        size="md"
        hideFooter={true}
      >
        <VinCaptureModalContent
          action={action}
          userId={userId}
          onManualSubmit={handleFoundVin}
          isDecoding={isDecoding}
          error={captureError}
          onClearError={() => setCaptureError(null)}
          onContinueManual={() => {
            setCaptureError(null);
            setOpen(false);
          }}
          scanSlot={
            <ScannerPane
              userId={userId}
              onFoundVin={handleFoundVin}
              onError={setCaptureError}
              isBusy={isDecoding}
            />
          }
        />
      </ModalShell>
    </>
  );
}