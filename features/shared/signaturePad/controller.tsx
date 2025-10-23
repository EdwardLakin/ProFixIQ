"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

/** Minimal ref surface of react-signature-canvas we rely on */
type SigRef = {
  clear: () => void;
  isEmpty: () => boolean;
  getCanvas: () => HTMLCanvasElement;
  getTrimmedCanvas: () => HTMLCanvasElement;
};

type SigCanvasProps = {
  ref: React.MutableRefObject<SigRef | null>;
  penColor?: string;
  onBegin?: () => void;
  onEnd?: () => void;
  canvasProps?: React.CanvasHTMLAttributes<HTMLCanvasElement>;
};

// Dynamic import to avoid SSR issues (type-cast to our prop shape)
const SigCanvas = dynamic(
  () => import("react-signature-canvas").then((m) => m.default),
  { ssr: false }
) as unknown as React.ComponentType<SigCanvasProps>;

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

  const sigRef = useRef<SigRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [saving, setSaving] = useState(false);

  // Safe defaults so it always shows even if width is 0 for a tick
  const [size, setSize] = useState({ w: 480, h: 220 });

  // Listen for open requests
  useEffect(() => {
    const handler = (e: Event) => {
      const { shopName, resolve } = (e as CustomEvent).detail as {
        shopName: string;
        resolve: (v: string | null) => void;
      };
      resolverRef.current = resolve;
      setShopName(shopName || "");
      setOpen(true);
      setSaving(false);

      // Clear previous ink on next paint
      requestAnimationFrame(() => sigRef.current?.clear());

      // Compute size immediately with a floor min width
      requestAnimationFrame(() => {
        const el = containerRef.current;
        const w = Math.max(320, Math.floor(el?.clientWidth || 0)) || 480;
        const h = Math.floor(w * 0.44);
        setSize({ w, h });
      });
    };
    window.addEventListener("signaturepad:open", handler as EventListener);
    return () => window.removeEventListener("signaturepad:open", handler as EventListener);
  }, []);

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
    const canvas = sigRef.current?.getCanvas();
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
  };

  const handleClear = () => {
    sigRef.current?.clear();
  };

  const hasInk = (): boolean => {
    try {
      return !!sigRef.current && !sigRef.current.isEmpty();
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    console.log("[SignaturePad] Save clicked");
    if (saving) return;

    if (!sigRef.current || !hasInk()) {
      alert("Please draw a signature before saving.");
      return;
    }

    try {
      setSaving(true);
      const base64 = sigRef.current.getTrimmedCanvas().toDataURL("image/png");
      console.log("[SignaturePad] has base64 len:", base64.length);
      closeWith(base64);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-lg border-2 border-orange-400 bg-neutral-900 p-6 shadow-xl"
        style={{ fontFamily: "Roboto, ui-sans-serif, system-ui", pointerEvents: "auto" }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()} // keep clicks inside
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
            penColor="white"
            // On some mobile browsers onBegin/onEnd can be flaky — not gating on them anymore
            onBegin={() => void 0}
            onEnd={() => void 0}
            canvasProps={{
              width: size.w,
              height: size.h,
              className: "w-full rounded-md border border-neutral-700 bg-neutral-950",
              role: "img",
              "aria-label": "Signature input area",
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleSave();
              }}
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