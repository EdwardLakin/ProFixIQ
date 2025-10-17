// features/shared/signaturePad/controller.tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Dynamic import (avoids SSR)
const SignatureCanvasDynamic: any = dynamic(() => import("react-signature-canvas"), { ssr: false });

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export type OpenOptions = { shopName?: string };

export function openSignaturePad(opts: OpenOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const detail = { shopName: opts.shopName, resolve };
    window.dispatchEvent(new CustomEvent("signaturepad:open", { detail }));
  });
}

// -----------------------------------------------------------------------------
// Host Component
// -----------------------------------------------------------------------------

export default function SignaturePad() {
  return <SignaturePadHost />;
}

function SignaturePadHost() {
  const [open, setOpen] = useState(false);
  const [shopName, setShopName] = useState<string>(""); // ✅ avoids union/null mismatch
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  const sigRef = useRef<any>(null); // ✅ type-relaxed
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Listen for open requests
  useEffect(() => {
    const handler = (e: Event) => {
      const { shopName, resolve } = (e as CustomEvent).detail as {
        shopName?: string;
        resolve: (v: string | null) => void;
      };
      resolverRef.current = resolve;
      setShopName(shopName || "");
      setOpen(true);
      setReady(false);
      setSaving(false);
      requestAnimationFrame(() => sigRef.current?.clear?.());
    };
    window.addEventListener("signaturepad:open", handler as EventListener);
    return () => window.removeEventListener("signaturepad:open", handler as EventListener);
  }, []);

  // Responsive sizing
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const w = Math.max(320, Math.floor(el.clientWidth));
      const h = Math.floor(w * 0.44);
      setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Retina crispness
  useEffect(() => {
    const canvas: HTMLCanvasElement | undefined = sigRef.current?.getCanvas?.();
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = Math.floor(size.w * ratio);
    const H = Math.floor(size.h * ratio);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }, [size]);

  // Prevent scroll while signing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventScroll = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName?.toLowerCase() === "canvas") e.preventDefault();
    };
    el.addEventListener("touchmove", preventScroll, { passive: false });
    return () => el.removeEventListener("touchmove", preventScroll);
  }, []);

  const closeWith = (value: string | null) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  };

  const handleClear = () => sigRef.current?.clear?.();

  const handleSave = async () => {
    if (saving) return;
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      alert("Please draw a signature before saving.");
      return;
    }
    try {
      setSaving(true);
      const base64 = pad.getTrimmedCanvas().toDataURL("image/png");
      closeWith(base64);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-gray-900">
        <h2 className="mb-1 text-center text-lg font-semibold text-gray-800 dark:text-white">
          {shopName ? `${shopName} — Customer Approval` : "Customer Approval"}
        </h2>
        <p className="mb-4 text-center text-xs text-gray-600 dark:text-gray-300">
          By signing, I approve the described work and acknowledge the estimate.
        </p>

        <div ref={containerRef} className="w-full">
          {size.w > 0 && (
            <SignatureCanvasDynamic
              ref={sigRef}
              onBegin={() => setReady(true)}
              penColor="black"
              canvasProps={{
                width: size.w,
                height: size.h,
                className:
                  "w-full rounded-md border border-gray-300 bg-white dark:bg-white",
              }}
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300 disabled:opacity-50"
          >
            Clear
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => closeWith(null)}
              disabled={saving}
              className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !ready}
              className="rounded bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] leading-snug text-gray-500 dark:text-gray-400">
          Signature is stored securely and associated to this work order. A copy can be requested at any time.
        </p>
      </div>
    </div>
  );
}