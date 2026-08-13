"use client";

import { Camera, CameraOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type QuaggaResult = { codeResult?: { code?: string | null } | null };
type QuaggaHandler = (result: QuaggaResult) => void;
type QuaggaLike = {
  init: (
    config: {
      inputStream: {
        name: string;
        type: "LiveStream";
        target: HTMLElement;
        constraints: { facingMode: string };
      };
      decoder: { readers: string[] };
      locate: boolean;
    },
    callback: (error?: Error) => void,
  ) => void;
  start: () => void;
  stop: () => void;
  onDetected: (handler: QuaggaHandler) => void;
  offDetected?: (handler: QuaggaHandler) => void;
};

export default function FieldBarcodeScanner({
  disabled = false,
  onDetected,
}: {
  disabled?: boolean;
  onDetected: (code: string) => void;
}) {
  const targetRef = useRef<HTMLDivElement | null>(null);
  const quaggaRef = useRef<QuaggaLike | null>(null);
  const handlerRef = useRef<QuaggaHandler | null>(null);
  const lastCodeRef = useRef("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    const quagga = quaggaRef.current;
    if (quagga && handlerRef.current && quagga.offDetected) {
      quagga.offDetected(handlerRef.current);
    }
    try {
      quagga?.stop();
    } catch {
      // Camera may already be stopped by the browser.
    }
    handlerRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    if (disabled || scanning || !targetRef.current) return;
    const target = targetRef.current;
    setError(null);

    let quagga: QuaggaLike;
    try {
      const module = await import("@ericblade/quagga2");
      quagga = module.default as unknown as QuaggaLike;
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Barcode scanner could not be loaded.",
      );
      setScanning(false);
      return;
    }

    quaggaRef.current = quagga;
    quagga.init(
      {
        inputStream: {
          name: "Field inventory scanner",
          type: "LiveStream",
          target,
          constraints: { facingMode: "environment" },
        },
        decoder: {
          readers: [
            "upc_reader",
            "upc_e_reader",
            "ean_reader",
            "ean_8_reader",
            "code_128_reader",
            "code_39_reader",
          ],
        },
        locate: true,
      },
      (initError?: Error) => {
        if (initError) {
          setError(initError.message || "Camera scanner could not start.");
          setScanning(false);
          return;
        }
        const handler: QuaggaHandler = (result) => {
          const code = result.codeResult?.code?.trim() ?? "";
          if (!code || code === lastCodeRef.current) return;
          lastCodeRef.current = code;
          onDetected(code);
          window.setTimeout(() => {
            lastCodeRef.current = "";
          }, 1200);
        };
        handlerRef.current = handler;
        quagga.onDetected(handler);
        quagga.start();
        setScanning(true);
      },
    );
  }, [disabled, onDetected, scanning]);

  useEffect(() => stop, [stop]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => void (scanning ? stop() : start())}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-sm font-bold text-[color:var(--theme-text-primary)] disabled:opacity-50"
      >
        {scanning ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {scanning ? "Stop scanner" : "Scan part"}
      </button>
      <div
        ref={targetRef}
        className={[
          "overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-black",
          scanning ? "min-h-48" : "hidden",
        ].join(" ")}
        aria-label="Barcode camera preview"
      />
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
