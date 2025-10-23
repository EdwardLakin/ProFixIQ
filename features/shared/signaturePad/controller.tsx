"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Dynamic import, typed
const SigCanvas = dynamic(
  () => import("react-signature-canvas").then((m) => m.default),
  { ssr: false }
) as unknown as React.ComponentType<{
  ref: React.MutableRefObject<any>;
  penColor?: string;
  onBegin?: () => void;
  onEnd?: () => void;
  canvasProps?: React.CanvasHTMLAttributes<HTMLCanvasElement>;
}>;

export type OpenOptions = { shopName?: string };

export function openSignaturePad(opts: OpenOptions = {}): Promise<string | null> {
  return new Promise((resolve) => {
    const detail = { shopName: opts.shopName ?? "", resolve };
    window.dispatchEvent(new CustomEvent("signaturepad:open", { detail }));
  });
}

export default function SignaturePad() {
  return <SignaturePadHost />;
}

function SignaturePadHost() {
  const [open, setOpen] = useState(false);
  const [shopName, setShopName] = useState<string>("");
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  const sigRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [saving, setSaving] = useState(false);

  // Always visible size defaults so the pad renders on first paint
  const [size, setSize] = useState({ w: 480, h: 220 });

  // Open/close wiring
  useEffect(() => {
    const handler = (e: Event) => {
      const { shopName, resolve } = (e as CustomEvent).detail as {
        shopName: string; resolve: (v: string | null) => void;
      };
      resolverRef.current = resolve;
      setShopName(shopName || "");
      setOpen(true);
      setSaving(false);

      // flag to let other floaters disable pointer events if they want
      document.documentElement.setAttribute("data-overlay", "sigpad");

      // clear previous signature & compute size next frame
      requestAnimationFrame(() => {
        sigRef.current?.clear?.();
        const el = containerRef.current;
        const w = Math.max(320, Math.floor(el?.clientWidth || 0)) || 480;
        const h = Math.floor(w * 0.44);
        setSize({ w, h });
      });
    };
    window.addEventListener("signaturepad:open", handler as EventListener);
    return () => window.removeEventListener("signaturepad:open", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!open) {
      document.documentElement.removeAttribute("data-overlay");
    }
  }, [open]);

  // Responsive sizing + retina crispness
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const w = Math.max(320, Math.floor(el.clientWidth)) || 480;
      const h = Math.floor(w * 0.44);
      setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Prevent page scroll while signing (iOS)
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
    document.documentElement.removeAttribute("data-overlay");
  };

  const handleClear = () => sigRef.current?.clear?.();

  const handleSave = async () => {
    if (saving) return;
    const pad = sigRef.current;
    if (!pad || typeof pad.isEmpty !== "function" || pad.isEmpty()) {
      alert("Please draw a signature before saving.");
      return;
    }
    try {
      setSaving(true);
      const base64 = pad.getTrimmedCanvas?.().toDataURL("image/png") ?? pad.toDataURL();
      closeWith(base64);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 p-4"
      style={{ zIndex: 2147483647, pointerEvents: "auto" }}  // guaranteed above any FAB
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-lg border-2 border-orange-400 bg-neutral-900 p-6 shadow-xl"
        style={{ fontFamily: "Roboto, ui-sans-serif, system-ui" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2
          className="mb-1 text-center text-lg font-semibold text-white"
          style={{ fontFamily: "'Black Ops One', Roboto, ui-sans-serif, system-ui" }}
        >
          {shopName ? `${shopName} — Customer Approval` : "Customer Approval"}
        </h2>

        <p className="mb-4 text-center text-xs text-neutral-300">
          By signing, I approve the described work and acknowledge the estimate.
        </p>

        <div ref={containerRef} className="w-full">
          <SigCanvas
            ref={sigRef}
            onBegin={() => { /* keep for devices that need it */ }}
            onEnd={() => { /* iOS sometimes only fires end; we accept either */ }}
            penColor="white"
            canvasProps={{
              width: size.w,
              height: size.h,
              className: "w-full rounded-md border border-neutral-700 bg-neutral-950",
              role: "img",
              "aria-label": "Signature input area",
            }}
          />
        </div>

        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-2"
          style={{ pointerEvents: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="rounded px-4 py-2 text-neutral-900 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#e5e7eb", fontFamily: "'Black Ops One', Roboto, ui-sans-serif, system-ui" }}
          >
            Clear
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => closeWith(null)}
              disabled={saving}
              className="rounded px-4 py-2 text-white disabled:opacity-50"
              style={{ backgroundColor: "#ef4444", fontFamily: "'Black Ops One', Roboto, ui-sans-serif, system-ui" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void (async () => handleSave())(); }}
              // always enabled; we gate inside handleSave()
              disabled={saving}
              className="rounded px-4 py-2 text-white disabled:opacity-50"
              style={{ backgroundColor: "#16a34a", fontFamily: "'Black Ops One', Roboto, ui-sans-serif, system-ui" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] leading-snug text-neutral-400">
          Signature is stored securely and associated to this work order. A copy can be requested at any time.
        </p>
      </div>
    </div>
  );
}