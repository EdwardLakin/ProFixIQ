// features/vehicles/components/VinCaptureModal.tsx
// SERVER COMPONENT – content only (ModalShell handles chrome)

import type { ReactNode } from "react";

type Props = {
  action: string;
  userId: string;
  defaultVin?: string;
  scanSlot?: ReactNode;
};

export default function VinCaptureModalContent({
  action,
  userId,
  defaultVin,
  scanSlot,
}: Props) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Manual Entry */}
      <section className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/50 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.9)]">
        <h3 className="font-blackops text-[0.75rem] tracking-[0.18em] text-orange-300">
          MANUAL ENTRY
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          Enter a valid 17-character VIN. No I, O, or Q.
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
              placeholder="1HGCM82633A004352"
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/70"
            />
          </label>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-neutral-500">
              Decoded via NHTSA vPIC
            </span>
            <button
              type="submit"
              className="rounded-full border border-orange-500 bg-black/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-orange-100 hover:bg-orange-500/10"
            >
              Decode VIN
            </button>
          </div>
        </form>
      </section>

      {/* Scanner card */}
      <section className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/50 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.9)]">
        <h3 className="font-blackops text-[0.75rem] tracking-[0.18em] text-orange-300">
          SCAN VIN
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          Use the camera or upload a photo of the VIN label.
        </p>

        <div className="mt-3 min-h-[220px] rounded-xl border border-dashed border-neutral-700 bg-neutral-950/60 p-3">
          {scanSlot ? (
            scanSlot
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              Scanner not loaded
            </div>
          )}
        </div>
      </section>
    </div>
  );
}