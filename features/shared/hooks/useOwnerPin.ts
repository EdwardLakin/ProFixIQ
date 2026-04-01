"use client";

import { useCallback, useState } from "react";

type VerifyArgs = {
  shopId: string;
  pin: string;
};

type SetArgs = {
  shopId: string;
  pin: string;
};

type ClearArgs = void;

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof (payload as { error?: unknown }).error === "string"
  ) {
    return (payload as { error: string }).error;
  }
  return fallback;
}

export function useOwnerPin() {
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyPin = useCallback(async ({ shopId, pin }: VerifyArgs) => {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/shop/owner-pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, pin }),
      });

      const json = (await res.json().catch(() => ({}))) as unknown;

      if (!res.ok) {
        const message = getErrorMessage(json, "Failed to verify PIN");
        setVerified(false);
        setError(message);
        return { ok: false as const, error: message };
      }

      setVerified(true);
      return { ok: true as const };
    } finally {
      setBusy(false);
    }
  }, []);

  const setPin = useCallback(async ({ shopId, pin }: SetArgs) => {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/shop/owner-pin/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, pin }),
      });

      const json = (await res.json().catch(() => ({}))) as unknown;

      if (!res.ok) {
        const message = getErrorMessage(json, "Failed to set PIN");
        setVerified(false);
        setError(message);
        return { ok: false as const, error: message };
      }

      setVerified(true);
      return { ok: true as const };
    } finally {
      setBusy(false);
    }
  }, []);

  const clearPin = useCallback(async (_args?: ClearArgs) => {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/shop/owner-pin/clear", {
        method: "POST",
      });

      const json = (await res.json().catch(() => ({}))) as unknown;

      if (!res.ok) {
        const message = getErrorMessage(json, "Failed to clear PIN session");
        setError(message);
        return { ok: false as const, error: message };
      }

      setVerified(false);
      return { ok: true as const };
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    verified,
    busy,
    error,
    setError,
    setVerified,
    verifyPin,
    setPin,
    clearPin,
  };
}
