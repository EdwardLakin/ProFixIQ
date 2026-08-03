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
              Dismiss
            </button>
            <button
              type="button"
              onClick={onContinueManual}
              className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
            >
              Continue manually
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="order-1 rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)] sm:order-2">
          <h3 className="font-blackops text-[0.75rem] tracking-[0.18em] text-orange-300">
            INTAKE SCAN
          </h3>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Aim at the driver-door VIN barcode. Capture completes automatically.
          </p>

          <div className="mt-3 min-h-[220px] rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3">
            {scanSlot ? (
              scanSlot
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--theme-text-muted)]">
                Scanner not loaded
              </div>
            )}
          </div>
        </section>

        <section className="order-2 rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)] sm:order-1">
          <h3 className="font-blackops text-[0.75rem] tracking-[0.18em] text-orange-300">
            MANUAL ENTRY
          </h3>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Existing manual entry stays available at all times.
          </p>

          <form
            method="post"
            action={action}
            onSubmit={handleManualSubmit}
            className="mt-3 space-y-3"
          >
            <input type="hidden" name="user_id" value={userId} />

            <label className="block text-xs text-[color:var(--theme-text-secondary)]">
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
                className="mt-1 w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder-neutral-500 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/70"
              />
            </label>

            {manualError ? (
              <div className="rounded border border-orange-500/40 bg-orange-950/30 px-3 py-2 text-xs text-orange-100">
                {manualError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-[color:var(--theme-text-muted)]">
                VIN fills instantly; details enrich online in the background
              </span>
              <button
                type="submit"
                disabled={isDecoding}
                className="rounded-full border border-orange-500 bg-[color:var(--theme-surface-overlay)] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-orange-100 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDecoding ? "Adding…" : "Use VIN"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
