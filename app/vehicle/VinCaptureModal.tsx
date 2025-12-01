"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import ModalShell from "@/features/shared/components/ModalShell";
import VinCaptureModalContent from "@/features/vehicles/components/VinCaptureModal";
import { decodeVin } from "@/features/shared/lib/vin/decodeVin";
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
  engine?: string | null;

  // extra fields from /api/vin
  engineDisplacementL?: string | null;
  engineCylinders?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  driveType?: string | null;
  bodyClass?: string | null;
};

type Props = {
  userId: string;
  onDecoded?: (data: VinDecodedDetail) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  /** server route that upserts (defaults to /api/vin) */
  action?: string;
  triggerClassName?: string;
};

type DecodeVinResponse = Awaited<ReturnType<typeof decodeVin>>;

type DecodeVinResponseExtended = DecodeVinResponse & {
  engineDisplacementL?: string | null;
  engineCylinders?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  driveType?: string | null;
  bodyClass?: string | null;
};

function isLikelyVin(s: string) {
  const vin = s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return vin.length === 17 && !/[IOQ]/.test(vin);
}

/** Scanner pane used in scanSlot */
function ScannerPane({
  onFoundVin,
  isBusy,
}: {
  userId: string;
  onFoundVin: (vin: string) => void;
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
                  const cleaned = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
                  if (isLikelyVin(cleaned)) {
                    lockedRef.current = true;
                    onFoundVin(cleaned);
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
          setError(
            "Live barcode detection not supported in this browser. Use photo upload below.",
          );
        }
      } catch {
        setError("Camera unavailable. Use photo upload below.");
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
  }, [onFoundVin]);

  return (
    <div
      className={`space-y-3 ${
        isBusy ? "ring-2 ring-orange-500 rounded-md animate-pulse" : ""
      }`}
    >
      {isBusy && (
        <div className="flex items-center gap-2 rounded border border-orange-500/60 bg-neutral-950 px-3 py-2">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <span className="text-xs text-orange-300">
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
        <div className="text-xs text-amber-300">{error}</div>
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
          disabled={isBusy}
          className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-black hover:file:bg-orange-400 disabled:opacity-60"
          onChange={async (e) => {
            if (isBusy) return;
            const file = e.target.files?.[0];
            if (!file) return;

            try {
              const formData = new FormData();
              formData.append("image", file);

              const res = await fetch("/api/vin/extract-from-image", {
                method: "POST",
                body: formData,
              });

              if (!res.ok) {
                alert("Could not read VIN from image. Please try again.");
                e.target.value = "";
                return;
              }

              const data = (await res.json()) as { vin?: string | null };
              const vin = data?.vin?.toString().toUpperCase() ?? "";
              if (!vin || !isLikelyVin(vin)) {
                alert(
                  "No clear VIN found in the photo. Please retake or type it manually.",
                );
                e.target.value = "";
                return;
              }

              onFoundVin(vin);
            } catch (err) {
              console.error(err);
              alert(
                "Error reading VIN from image. Please try again or enter it manually.",
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
        We will decode with NHTSA and store it to your account.
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
  triggerClassName,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);

  const isControlled = typeof open === "boolean";
  const isOpen = isControlled ? (open as boolean) : internalOpen;

  const setOpen = useCallback(
    (val: boolean) => {
      if (isControlled) onOpenChange?.(val);
      else setInternalOpen(val);
    },
    [isControlled, onOpenChange],
  );

  const router = useRouter();
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
      if (isDecoding) return; // prevent double fires
      setIsDecoding(true);
      try {
        const resp = await decodeVin(vin, userId);
        if (resp?.error) {
          alert(resp.error);
          return;
        }

        const extended = resp as DecodeVinResponseExtended;

        // hydrate shared draft
        setVehicleDraft({
          vin,
          year: resp.year ?? null,
          make: resp.make ?? null,
          model: resp.model ?? null,
          trim: resp.trim ?? null,
          engine: resp.engine ?? null,
        });

        const detail: VinDecodedDetail = {
          vin,
          year: resp.year ?? null,
          make: resp.make ?? null,
          model: resp.model ?? null,
          trim: resp.trim ?? null,
          engine: resp.engine ?? null,
          engineDisplacementL: extended.engineDisplacementL ?? null,
          engineCylinders: extended.engineCylinders ?? null,
          fuelType: extended.fuelType ?? null,
          transmission: extended.transmission ?? null,
          driveType: extended.driveType ?? null,
          bodyClass: extended.bodyClass ?? null,
        };

        onDecodedRef.current?.(detail);

        // fire-and-forget recalls fetch
        try {
          void fetch("/api/recalls/fetch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vin,
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

        setOpen(false);
        router.push("/work-orders/create?source=vin");
      } finally {
        setIsDecoding(false);
      }
    },
    [userId, setVehicleDraft, router, setOpen, isDecoding],
  );

  const defaultTrigger = useMemo(
    () => (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "rounded border border-orange-400 bg-neutral-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-900"
        }
        title="Open VIN capture"
      >
        Add by VIN / Scan
      </button>
    ),
    [setOpen, triggerClassName],
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
      ) : (
        defaultTrigger
      )}

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
          scanSlot={
            <ScannerPane
              userId={userId}
              onFoundVin={handleFoundVin}
              isBusy={isDecoding}
            />
          }
        />
      </ModalShell>
    </>
  );
}