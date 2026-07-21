// features/shared/signaturePad/controller.tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const SIGNATURE_INK_COLOR = "#0f172a";
const SIGNATURE_CANVAS_COLOR = "#ffffff";

function canvasHasVisibleInk(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width < 1 || canvas.height < 1) return false;

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    const isNotWhite =
      pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245;
    if (alpha > 0 && isNotWhite) return true;
  }

  return false;
}

type SigCanvasInstance = {
  clear: () => void;
  isEmpty: () => boolean;
  getCanvas: () => HTMLCanvasElement;
  getTrimmedCanvas: () => HTMLCanvasElement;
};

export type OpenOptions = { shopName?: string };

export function openSignaturePad(
  opts: OpenOptions = {},
): Promise<string | null> {
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
  const [SigCanvasComp, setSigCanvasComp] =
    useState<React.ComponentType<any> | null>(null);

  const resolverRef = useRef<((v: string | null) => void) | null>(null);
  const sigRef = useRef<SigCanvasInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState({ w: 480, h: 220 });

  // Load react-signature-canvas on client so ref is reliable
  useEffect(() => {
    let mounted = true;
    (async () => {
      const mod = await import("react-signature-canvas");
      if (mounted) setSigCanvasComp(() => mod.default);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Open listener
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

      // clear any previous ink and size up next paint
      requestAnimationFrame(() => {
        sigRef.current?.clear?.();
        const measuredWidth = Math.floor(
          containerRef.current?.clientWidth || 0,
        );
        const w = measuredWidth > 0 ? measuredWidth : 480;
        const h = Math.max(120, Math.floor(w * 0.44));
        setSize({ w, h });
      });
    };
    window.addEventListener("signaturepad:open", handler as EventListener);
    return () =>
      window.removeEventListener("signaturepad:open", handler as EventListener);
  }, []);

  // Responsive sizing
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const el = containerRef.current;

    const syncSize = () => {
      const measuredWidth = Math.floor(el.clientWidth);
      if (measuredWidth < 1) return;
      const next = {
        w: measuredWidth,
        h: Math.max(120, Math.floor(measuredWidth * 0.44)),
      };
      setSize((current) =>
        current.w === next.w && current.h === next.h ? current : next,
      );
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Retina crispness
  useEffect(() => {
    const canvas = sigRef.current?.getCanvas?.();
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = Math.floor(size.w * ratio);
    const H = Math.floor(size.h * ratio);
    if (canvas.width !== W || canvas.height !== H) {
      // Resizing clears the bitmap. Reset SignaturePad's internal ink state too
      // so an orientation change can never save a blank image as a signature.
      sigRef.current?.clear?.();
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }, [SigCanvasComp, open, size]);

  // Prevent page scroll while signing (iOS)
  useEffect(() => {
    const el = containerRef.current;
    if (!open || !el) return;
    const preventScroll = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName?.toLowerCase() === "canvas") e.preventDefault();
    };
    el.addEventListener("touchmove", preventScroll, { passive: false });
    return () => el.removeEventListener("touchmove", preventScroll);
  }, [open]);

  const closeWith = (v: string | null) => {
    resolverRef.current?.(v);
    resolverRef.current = null;
    setOpen(false);
  };

  const hasInk = () =>
    !!sigRef.current &&
    typeof sigRef.current.isEmpty === "function" &&
    !sigRef.current.isEmpty();

  const handleClear = () => sigRef.current?.clear?.();

  const handleSave = () => {
    if (saving) return;

    if (!hasInk()) {
      alert("Please draw a signature before saving.");
      return;
    }

    setSaving(true);
    try {
      const inst = sigRef.current!;
      // Some Safari builds throw on getTrimmedCanvas; fall back to raw canvas
      let canvas: HTMLCanvasElement | null = null;

      try {
        canvas = inst.getTrimmedCanvas?.() ?? null;
      } catch {
        canvas = null;
      }
      if (!canvas) {
        try {
          canvas = inst.getCanvas?.() ?? null;
        } catch {
          canvas = null;
        }
      }

      if (!canvas) {
        throw new Error("Signature capture unavailable (canvas not ready).");
      }
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error("Signature area not ready. Please try again.");
      }
      if (!canvasHasVisibleInk(canvas)) {
        throw new Error("Please draw a signature before saving.");
      }

      const base64 = canvas.toDataURL("image/png");
      if (!base64 || base64.length < 50) {
        throw new Error("Could not read signature image.");
      }

      closeWith(base64);
    } catch (err: any) {
      alert(err?.message || "Failed to save signature.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[color:var(--theme-surface-overlay)] p-4">
      <div
        className="w-full max-w-md rounded-lg border-2 border-orange-400 bg-[color:var(--theme-surface-panel)] p-6 shadow-xl"
        style={{ fontFamily: "Roboto, ui-sans-serif, system-ui" }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="mb-1 text-center text-lg font-semibold text-[color:var(--theme-text-primary)]"
          style={{
            fontFamily: "'Black Ops One', Roboto, ui-sans-serif, system-ui",
          }}
        >
          {shopName ? `${shopName} — Customer Approval` : "Customer Approval"}
        </h2>

        <p className="mb-4 text-center text-xs text-[color:var(--theme-text-secondary)]">
          By signing, I approve the described work and acknowledge the estimate.
        </p>

        <div ref={containerRef} className="w-full">
          {SigCanvasComp ? (
            <SigCanvasComp
              ref={(inst: SigCanvasInstance | null) => {
                sigRef.current = inst;
              }}
              penColor={SIGNATURE_INK_COLOR}
              canvasProps={{
                width: size.w,
                height: size.h,
                className:
                  "w-full rounded-md border border-[color:var(--theme-border-soft)]",
                style: {
                  backgroundColor: SIGNATURE_CANVAS_COLOR,
                  touchAction: "none",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                },
                role: "img",
                "aria-label": "Signature input area",
              }}
            />
          ) : (
            <div
              className="h-[220px] w-full animate-pulse rounded-md border border-[color:var(--theme-border-soft)]"
              style={{ backgroundColor: SIGNATURE_CANVAS_COLOR }}
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="rounded px-4 py-2 hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: SIGNATURE_INK_COLOR,
              color: SIGNATURE_CANVAS_COLOR,
              fontFamily: "'Black Ops One', Roboto, ui-sans-serif, system-ui",
            }}
          >
            Clear
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => closeWith(null)}
              disabled={saving}
              className="rounded px-4 py-2 text-[color:var(--theme-text-primary)] disabled:opacity-50"
              style={{
                backgroundColor: "#ef4444",
                fontFamily: "'Black Ops One', Roboto, ui-sans-serif, system-ui",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave();
              }}
              disabled={saving}
              className="rounded px-4 py-2 text-[color:var(--theme-text-primary)] disabled:opacity-50"
              style={{
                backgroundColor: "var(--theme-surface-panel)",
                fontFamily: "'Black Ops One', Roboto, ui-sans-serif, system-ui",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] leading-snug text-[color:var(--theme-text-secondary)]">
          Signature is stored securely and associated to this work order.
        </p>
      </div>
    </div>
  );
}
