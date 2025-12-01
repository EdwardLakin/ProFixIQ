// features/vehicles/components/VinCaptureModal.tsx
// SERVER COMPONENT (no "use client")

import type { ReactNode } from "react";

export type VinDecodeResult = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
};

type VinCaptureModalProps = {
  open?: boolean;
  action: string;
  userId: string;
  defaultVin?: string;
  scanSlot?: ReactNode;
  footerSlot?: ReactNode;
  title?: string;
  description?: string;
};

export default function VinCaptureModal({
  open = true,
  action,
  userId,
  defaultVin,
  scanSlot,
  footerSlot,
  title = "Add Vehicle by VIN",
  description = "Enter a VIN manually or use the scanner.",
}: VinCaptureModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vin-modal-title"
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70" />

      {/* Panel */}
      <div className="relative z-[1001] my-8 w-[min(680px,92vw)] max-h-[calc(100vh-4rem)] overflow-hidden rounded-lg border border-orange-400 bg-neutral-950 shadow-2xl">
        {/* Header */}
        <div className="border-b border-neutral-800 px-4 py-3 sm:px-5">
          <h2
            id="vin-modal-title"
            className="font-header text-lg font-semibold tracking-wide text-white"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 font-sans text-xs text-neutral-400">
              {description}
            </p>
          ) : null}
        </div>

        {/* Body (scrollable) */}
        <div className="grid max-h-[calc(100vh-11rem)] gap-6 overflow-y-auto px-4 py-5 font-sans text-white sm:px-5 sm:py-6 lg:grid-cols-2">
          {/* Manual Entry */}
          <section className="rounded border border-neutral-800 bg-neutral-900/40 p-4">
            <h3 className="font-header text-sm font-semibold text-white">
              Manual Entry
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              Paste or type a 17-character VIN. Letters only (no “I”, “O”, “Q”).
            </p>

            <form method="post" action={action} className="mt-3 space-y-3">
              <input type="hidden" name="user_id" value={userId} />

              <label className="block text-xs text-neutral-300">
                VIN
                <input
                  name="vin"
                  defaultValue={defaultVin ?? ""}
                  inputMode="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="e.g., 1HGCM82633A004352"
                  className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none placeholder-neutral-400 focus:border-orange-500"
                />
              </label>

              <div className="flex items-center justify-between">
                <div className="text-[11px] text-neutral-500">
                  By submitting, the VIN will be decoded via NHTSA vPIC.
                </div>

                <button
                  type="submit"
                  className="font-header rounded border border-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-500/10"
                >
                  Decode VIN
                </button>
              </div>
            </form>
          </section>

          {/* Scan Slot */}
          <section className="rounded border border-neutral-800 bg-neutral-900/40 p-4">
            <h3 className="font-header text-sm font-semibold text-white">
              Scan (Camera / Barcode)
            </h3>
            <p className="mt-1 text-xs text-neutral-400">
              Your camera scanner will appear here when enabled by the client
              wrapper.
            </p>

            <div className="mt-3 min-h-[220px] rounded border border-dashed border-neutral-700 bg-neutral-950/40 p-3">
              {scanSlot ? (
                scanSlot
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                  Scanner UI goes here (client enhanced)
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 bg-neutral-950 px-4 py-3 sm:px-5">
          <a
            href="#"
            className="font-header rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Close
          </a>
          {footerSlot}
        </div>
      </div>
    </div>
  );
}