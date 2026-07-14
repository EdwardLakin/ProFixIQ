"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/features/shared/components/ui/Button";
import { Input } from "@/features/shared/components/ui/input";

type Props = {
  shopId: string | null;
  open: boolean;
  onClose: () => void;
  onVerified?: (expiresAt: string | undefined) => void;
};

type VerifyResponse = {
  ok?: boolean;
  error?: string;
  pinConfigured?: boolean;
};

function buildExpiryIso(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export default function OwnerPinModal({
  shopId,
  open,
  onClose,
  onVerified,
}: Props) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"verify" | "set">("verify");

  useEffect(() => {
    if (!open) {
      setPin("");
      setConfirmPin("");
      setError(null);
      setBusy(false);
      setMode("verify");
    }
  }, [open]);

  const canSubmit = useMemo(() => {
    if (!shopId || busy) return false;
    if (mode === "set") {
      return /^\d{4,8}$/.test(pin) && pin === confirmPin;
    }
    return pin.trim().length >= 4;
  }, [shopId, busy, mode, pin, confirmPin]);

  if (!open) return null;

  async function tryVerifyFirst(): Promise<"verified" | "needs_set" | "failed"> {
    if (!shopId) {
      setError("Shop not found.");
      return "failed";
    }

    const res = await fetch("/api/shop/owner-pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, pin }),
    });

    const json = (await res.json().catch(() => ({}))) as VerifyResponse;

    if (res.ok) {
      onVerified?.(buildExpiryIso(30));
      onClose();
      return "verified";
    }

    if (json?.pinConfigured === false || json?.error === "Owner PIN not set") {
      setMode("set");
      setError("No owner PIN exists yet. Set one now.");
      return "needs_set";
    }

    setError(json?.error || "Invalid PIN");
    return "failed";
  }

  async function handleSetPin(): Promise<boolean> {
    if (!shopId) {
      setError("Shop not found.");
      return false;
    }

    if (!/^\d{4,8}$/.test(pin)) {
      setError("PIN must be 4 to 8 digits.");
      return false;
    }

    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return false;
    }

    const res = await fetch("/api/shop/owner-pin/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, pin }),
    });

    const json = (await res.json().catch(() => ({}))) as VerifyResponse;

    if (!res.ok) {
      setError(json?.error || "Failed to set PIN");
      return false;
    }

    onVerified?.(buildExpiryIso(30));
    onClose();
    return true;
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);

    try {
      if (mode === "verify") {
        await tryVerifyFirst();
        return;
      }

      await handleSetPin();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--theme-surface-overlay)] p-4">
      <div className="w-full max-w-md rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-5 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
            {mode === "verify" ? "Owner PIN Required" : "Set Owner PIN"}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            {mode === "verify"
              ? "Unlock protected owner settings."
              : "Create a 4 to 8 digit PIN for owner-protected actions."}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--theme-text-secondary)]">
              {mode === "verify" ? "Enter PIN" : "New PIN"}
            </label>
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Enter PIN"
              maxLength={8}
              disabled={busy}
            />
          </div>

          {mode === "set" && (
            <div>
              <label className="mb-1 block text-xs text-[color:var(--theme-text-secondary)]">
                Confirm PIN
              </label>
              <Input
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Confirm PIN"
                maxLength={8}
                disabled={busy}
              />
            </div>
          )}

          {error ? (
            <div className="rounded-md border border-red-500/20 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {busy
              ? "Please wait..."
              : mode === "verify"
                ? "Unlock"
                : "Set PIN"}
          </Button>
        </div>
      </div>
    </div>
  );
}
