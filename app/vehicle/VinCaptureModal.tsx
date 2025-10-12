"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VinCaptureModalShell from "@/features/vehicles/components/VinCaptureModal";
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

function isLikelyVin(s: string) {
  const vin = s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return vin.length === 17 && !/[IOQ]/.test(vin);
}

/** Minimal scanner pane for the modal's scanSlot */
function ScannerPane({
  onFoundVin,
}: {
  userId: string;
  onFoundVin: (vin: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const lockedRef = useRef(false); // stop multiple fires

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let detector: InstanceType<NonNullable<typeof window.BarcodeDetector>> | null = null;

    const start = async () => {
      setError(null);
      try {
        // Try camera
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
            formats: ["qr_code", "code_39", "code_128", "pdf417", "aztec", "data_matrix"],
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
          setError("Live barcode detection not supported in this browser. Use photo upload below.");
        }
      } catch {
        setError("Camera unavailable. Grant permission or use photo upload below.");
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
    <div className="space-y-3">
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
          {active ? "Point the camera at the VIN barcode / label…" : "Initializing camera…"}
        </div>
      )}

      {/* Fallback: photo upload (Safari/iPad) */}
      <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
        <div className="mb-2 text-sm text-neutral-200">Or upload a photo of the VIN label</div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-black hover:file:bg-orange-400"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const typed = window.prompt("Type the 17-character VIN from the photo:");
            if (typed && isLikelyVin(typed)) onFoundVin(typed.toUpperCase());
          }}
        />
        <div className="mt-2 text-[11px] text-neutral-500">
          Tip: Most VIN stickers include a Code 39/128 or PDF417 barcode.
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
    return () => window.removeEventListener("vin:decoded", handler as EventListener);
  }, [setOpen]);

  // When scanner finds a VIN: decode & upsert, stash draft, kick recalls, then jump to Create.
  const handleFoundVin = useCallback(
    async (vin: string) => {
      const resp = await decodeVin(vin, userId);
      if (resp?.error) {
        alert(resp.error);
        return;
      }

      // Stash into your Zustand draft (Create page reads this on mount)
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
      };

      // Optional callback for inline usage (if on Create page already)
      onDecodedRef.current?.(detail);

      // 🔶 Fire-and-forget recalls fetch with richer payload
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
    },
    [userId, setVehicleDraft, router, setOpen],
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
        <span onClick={() => setOpen(true)} role="button" style={{ cursor: "pointer" }}>
          {children}
        </span>
      ) : (
        defaultTrigger
      )}

      <VinCaptureModalShell
        open={isOpen}
        userId={userId}
        action={action}
        // inject the scanner UI into the server shell
        scanSlot={<ScannerPane userId={userId} onFoundVin={handleFoundVin} />}
      />
    </>
  );
}