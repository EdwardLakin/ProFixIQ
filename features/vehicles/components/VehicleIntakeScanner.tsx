"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  chooseStableVin,
  extractVinCandidates,
} from "@/features/shared/lib/vin/vinCapture";

type BarcodeResult = { rawValue?: string | null };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<BarcodeResult[]>;
};
type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

type QuaggaResult = {
  codeResult?: {
    code?: string | null;
    format?: string | null;
  } | null;
};

type QuaggaLike = {
  decodeSingle: (
    config: Record<string, unknown>,
    callback: (result: QuaggaResult | null) => void,
  ) => void;
};

type Observation = {
  raw: string;
  capturedAt: number;
};

type CameraCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
};

type Props = {
  onFoundVin: (vin: string) => void;
  onError: (message: string) => void;
  isBusy: boolean;
};

type QuaggaPass = {
  locate: boolean;
  halfSample: boolean;
  patchSize: "x-small" | "small" | "medium";
  inputSize: number;
  readers: string[];
};

const OBSERVATION_WINDOW_MS = 2_400;
const LOCAL_SCAN_INTERVAL_MS = 280;
const QUAGGA_INTERVAL_MS = 900;
const QUAGGA_PASS_TIMEOUT_MS = 4_000;

const LIVE_QUAGGA_PASSES: readonly QuaggaPass[] = [
  {
    locate: false,
    halfSample: false,
    patchSize: "small",
    inputSize: 0,
    readers: ["code_39_vin_reader", "code_39_reader", "code_128_reader"],
  },
  {
    locate: true,
    halfSample: false,
    patchSize: "small",
    inputSize: 0,
    readers: ["code_39_vin_reader", "code_39_reader", "code_128_reader"],
  },
];

const PHOTO_QUAGGA_PASSES: readonly QuaggaPass[] = [
  {
    locate: true,
    halfSample: false,
    patchSize: "x-small",
    inputSize: 0,
    readers: ["code_39_vin_reader", "code_39_reader", "code_128_reader"],
  },
  {
    locate: true,
    halfSample: true,
    patchSize: "small",
    inputSize: 1600,
    readers: ["code_39_vin_reader", "code_39_reader", "code_128_reader"],
  },
  {
    locate: false,
    halfSample: false,
    patchSize: "small",
    inputSize: 0,
    readers: ["code_39_vin_reader", "code_39_reader", "code_128_reader"],
  },
];

let quaggaPromise: Promise<QuaggaLike> | null = null;

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    window as Window & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector ?? null;
}

async function loadQuagga(): Promise<QuaggaLike> {
  if (!quaggaPromise) {
    quaggaPromise = import("@ericblade/quagga2").then((module) => {
      const loaded = module as unknown as { default?: QuaggaLike } & QuaggaLike;
      return loaded.default ?? loaded;
    });
  }
  return quaggaPromise;
}

function drawVideoRegion(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return false;

  // Keep the crop aligned with the visible guide, but retain enough vertical area
  // for labels that are slightly above or below center on a handheld phone.
  const cropWidth = Math.round(sourceWidth * 0.94);
  const cropHeight = Math.round(sourceHeight * 0.52);
  const sourceX = Math.round((sourceWidth - cropWidth) / 2);
  const sourceY = Math.round((sourceHeight - cropHeight) / 2);
  const outputWidth = Math.min(1600, cropWidth);
  const outputHeight = Math.max(
    320,
    Math.round((cropHeight / cropWidth) * outputWidth),
  );

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;

  context.drawImage(
    video,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );
  return true;
}

async function decodeQuaggaPass(
  quagga: QuaggaLike,
  source: string,
  pass: QuaggaPass,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(value);
    };

    const timeoutId = window.setTimeout(
      () => finish(null),
      QUAGGA_PASS_TIMEOUT_MS,
    );

    try {
      quagga.decodeSingle(
        {
          src: source,
          numOfWorkers: 0,
          locate: pass.locate,
          inputStream: {
            size: pass.inputSize,
            singleChannel: false,
          },
          locator: {
            patchSize: pass.patchSize,
            halfSample: pass.halfSample,
          },
          decoder: {
            readers: pass.readers,
            multiple: false,
          },
        },
        (result) => finish(result?.codeResult?.code?.trim() || null),
      );
    } catch {
      finish(null);
    }
  });
}

async function decodeCanvasWithQuagga(
  canvas: HTMLCanvasElement,
  mode: "live" | "photo",
): Promise<string | null> {
  const quagga = await loadQuagga();
  const source = canvas.toDataURL("image/jpeg", 0.94);
  const passes = mode === "live" ? LIVE_QUAGGA_PASSES : PHOTO_QUAGGA_PASSES;

  for (const pass of passes) {
    const decoded = await decodeQuaggaPass(quagga, source, pass);
    if (decoded && extractVinCandidates(decoded).length > 0) return decoded;
  }

  return null;
}

async function drawImageFile(file: File, canvas: HTMLCanvasElement) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      const maxDimension = 2400;
      const scale = Math.min(
        1,
        maxDimension / Math.max(bitmap.width, bitmap.height),
      );
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return;
    } finally {
      bitmap.close();
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const maxDimension = 2400;
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function VehicleIntakeScanner({
  onFoundVin,
  onError,
  isBusy,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const observationsRef = useRef<Observation[]>([]);
  const scanInFlightRef = useRef(false);
  const lockedRef = useRef(false);
  const lastQuaggaAtRef = useRef(0);
  const lastCandidateAtRef = useRef(0);
  const onFoundVinRef = useRef(onFoundVin);
  const onErrorRef = useRef(onError);

  const [status, setStatus] = useState("Starting camera…");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    onFoundVinRef.current = onFoundVin;
  }, [onFoundVin]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const acceptObservation = useCallback((raw: string) => {
    if (lockedRef.current) return false;

    const candidates = extractVinCandidates(raw);
    if (!candidates.length) return false;

    const now = Date.now();
    lastCandidateAtRef.current = now;
    observationsRef.current = [
      ...observationsRef.current.filter(
        (entry) => now - entry.capturedAt <= OBSERVATION_WINDOW_MS,
      ),
      { raw, capturedAt: now },
    ];

    const leadingCandidate = candidates[0];
    setStatus(
      leadingCandidate.checksumValid
        ? "VIN found — hold steady"
        : "Reading VIN — hold steady",
    );

    const stable = chooseStableVin(
      observationsRef.current.map((entry) => entry.raw),
    );
    if (!stable) return true;

    lockedRef.current = true;
    setStatus("VIN captured");
    if (typeof navigator.vibrate === "function") navigator.vibrate(60);
    onFoundVinRef.current(stable.vin);
    return true;
  }, []);

  const acceptPhotoObservation = useCallback(
    (raw: string) => {
      const now = Date.now();
      observationsRef.current.push(
        { raw, capturedAt: now },
        { raw, capturedAt: now },
      );
      return acceptObservation(raw);
    },
    [acceptObservation],
  );

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;
    let detector: BarcodeDetectorLike | null = null;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera capture is not supported in this browser.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = videoTrack?.getCapabilities?.() as
          | CameraCapabilities
          | undefined;
        setTorchAvailable(Boolean(capabilities?.torch));

        const Detector = getBarcodeDetector();
        if (Detector) {
          try {
            detector = new Detector({
              formats: ["code_39", "code_128", "pdf417", "data_matrix"],
            });
          } catch {
            detector = new Detector();
          }
        }

        // Warm the local fallback while the user positions the camera. This avoids
        // making the first iOS scan wait for the dynamic import.
        void loadQuagga().catch(() => null);

        setCameraReady(true);
        setCameraError(null);
        setStatus("Center the VIN barcode in the guide");

        intervalId = window.setInterval(async () => {
          if (
            cancelled ||
            lockedRef.current ||
            scanInFlightRef.current ||
            isBusy ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            return;
          }

          scanInFlightRef.current = true;
          try {
            let sawCandidate = false;
            if (detector) {
              try {
                const results = await detector.detect(video);
                for (const result of results) {
                  if (result.rawValue && acceptObservation(result.rawValue)) {
                    sawCandidate = true;
                  }
                }
              } catch {
                detector = null;
              }
            }

            const now = Date.now();
            const shouldRunQuagga =
              !sawCandidate &&
              now - lastQuaggaAtRef.current >= QUAGGA_INTERVAL_MS &&
              now - lastCandidateAtRef.current >= LOCAL_SCAN_INTERVAL_MS;

            if (shouldRunQuagga && canvasRef.current) {
              lastQuaggaAtRef.current = now;
              if (drawVideoRegion(video, canvasRef.current)) {
                const decoded = await decodeCanvasWithQuagga(
                  canvasRef.current,
                  "live",
                );
                if (decoded) acceptObservation(decoded);
              }
            }

            if (now - lastCandidateAtRef.current > 1_800) {
              setStatus("Center the VIN barcode in the guide");
            }
          } catch {
            // Individual frame failures are expected while the camera moves.
          } finally {
            scanInFlightRef.current = false;
          }
        }, LOCAL_SCAN_INTERVAL_MS);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Camera unavailable. Upload a VIN-label photo or enter the VIN manually.";
        setCameraError(message);
        setStatus("Camera unavailable");
        onErrorRef.current(message);
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (intervalId !== null) window.clearInterval(intervalId);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      scanInFlightRef.current = false;
    };
  }, [acceptObservation, isBusy]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;

    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchAvailable, torchOn]);

  const handlePhoto = useCallback(
    async (file: File | null) => {
      if (!file || !canvasRef.current || photoBusy || isBusy) return;
      setPhotoBusy(true);
      setCameraError(null);
      setStatus("Reading VIN label photo…");

      try {
        await drawImageFile(file, canvasRef.current);

        const Detector = getBarcodeDetector();
        if (Detector) {
          try {
            const detector = new Detector({
              formats: ["code_39", "code_128", "pdf417", "data_matrix"],
            });
            const results = await detector.detect(canvasRef.current);
            for (const result of results) {
              if (
                result.rawValue &&
                acceptPhotoObservation(result.rawValue)
              ) {
                return;
              }
            }
          } catch {
            // Quagga remains available as the local fallback.
          }
        }

        const decoded = await decodeCanvasWithQuagga(
          canvasRef.current,
          "photo",
        );
        if (decoded && acceptPhotoObservation(decoded)) return;

        const message =
          "No VIN barcode was found in that photo. Fill the frame with the barcode, keep the label level, or enter the printed VIN manually.";
        setCameraError(message);
        setStatus("VIN barcode not found");
        onErrorRef.current(message);
      } catch {
        const message =
          "That photo could not be read locally. Retake the VIN-label photo or enter the VIN manually.";
        setCameraError(message);
        setStatus("Photo could not be read");
        onErrorRef.current(message);
      } finally {
        setPhotoBusy(false);
      }
    },
    [acceptPhotoObservation, isBusy, photoBusy],
  );

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-black">
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full object-cover sm:aspect-video"
          playsInline
          muted
          autoPlay
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
          <div className="relative h-[42%] w-[94%] rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.34)]">
            <span className="absolute -left-0.5 -top-0.5 h-5 w-5 rounded-tl-xl border-l-4 border-t-4 border-[var(--accent-copper-light)]" />
            <span className="absolute -right-0.5 -top-0.5 h-5 w-5 rounded-tr-xl border-r-4 border-t-4 border-[var(--accent-copper-light)]" />
            <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl-xl border-b-4 border-l-4 border-[var(--accent-copper-light)]" />
            <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br-xl border-b-4 border-r-4 border-[var(--accent-copper-light)]" />
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <div className="rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            {isBusy ? "Adding vehicle…" : status}
          </div>
          {torchAvailable ? (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              className="rounded-full border border-white/25 bg-black/70 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur"
            >
              {torchOn ? "Light off" : "Light on"}
            </button>
          ) : null}
        </div>
      </div>

      {cameraError ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
          {cameraError}
        </div>
      ) : null}

      <label className="block cursor-pointer rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-3 text-center text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]">
        {photoBusy ? "Reading photo…" : "Use VIN-label photo"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={photoBusy || isBusy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void handlePhoto(file);
            event.target.value = "";
          }}
        />
      </label>

      <div className="space-y-1 text-[11px] text-[color:var(--theme-text-muted)]">
        <p>
          Runs on this device using the VIN barcode. No image or scan is sent to a third-party API.
        </p>
        <p>
          Best target: fill the guide with the long barcode on the driver-door label and hold the phone level.
        </p>
        {!cameraReady && !cameraError ? <p>Requesting camera access…</p> : null}
      </div>

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
