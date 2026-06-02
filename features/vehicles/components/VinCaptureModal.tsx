// features/vehicles/components/VinCaptureModal.tsx
"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";

type Props = {
  action: string;
  userId: string;
  defaultVin?: string;
  scanSlot?: ReactNode;
  onManualSubmit?: (vin: string) => void | Promise<void>;
  isDecoding?: boolean;
  error?: string | null;
  onClearError?: () => void;
  onContinueManual?: () => void;
};

export default function VinCaptureModalContent({
  action,
  userId,
  defaultVin,
  scanSlot,
  onManualSubmit,
  isDecoding = false,
  error,
  onClearError,
  onContinueManual,
}: Props) {
  const [manualVin, setManualVin] = useState(defaultVin ?? "");
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    setManualVin(defaultVin ?? "");
  }, [defaultVin]);

  const handleManualSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onClearError?.();

    const normalized = normalizeVinInput(manualVin);
    if (!normalized.isValid) {
      setManualError(normalized.message);
      return;
    }

    setManualError(null);
    await onManualSubmit?.(normalized.vin);
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-100">
          <div className="font-semibold">VIN capture needs attention</div>
          <div className="mt-1 text-xs text-red-100/90">{error}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClearError}
              className="rounded-full border border-red-300/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-50 hover:bg-red-400/10"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onContinueManual}
              className="rounded-full border border-neutral-500/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-100 hover:bg-white/10"
            >
              Continue manually
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Manual Entry */}
        <section className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/50 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.9)]">
          <h3 className="font-blackops text-[0.75rem] tracking-[0.18em] text-orange-300">
            MANUAL ENTRY
          </h3>
          <p className="mt-1 text-xs text-neutral-400">
            Enter a valid 17-character VIN. No I, O, or Q.
          </p>

          <form
            method="post"
            action={action}
            onSubmit={handleManualSubmit}
            className="mt-3 space-y-3"
          >
            <input type="hidden" name="user_id" value={userId} />

            <label className="block text-xs text-neutral-300">
              VIN
              <input
                name="vin"
                value={manualVin}
                onChange={(event) => {
                  setManualVin(event.target.value.toUpperCase());
                  setManualError(null);
                  onClearError?.();
                }}
                inputMode="text"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="1HGCM82633A004352"
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/70"
              />
            </label>

            {manualError ? (
              <div className="rounded border border-orange-500/40 bg-orange-950/30 px-3 py-2 text-xs text-orange-100">
                {manualError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-neutral-500">
                Decoded via NHTSA vPIC
              </span>
              <button
                type="submit"
                disabled={isDecoding}
                className="rounded-full border border-orange-500 bg-black/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-orange-100 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDecoding ? "Decoding…" : "Decode VIN"}
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
    </div>
  );
}
