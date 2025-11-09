"use client";

import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";
import { toast } from "sonner";

type Props = {
  shopId: string;
  open: boolean;
  onClose: () => void;
  onVerified?: (expiresAtISO?: string) => void;
};

export default function OwnerPinModal(rawProps: any) {
  const { shopId, open, onClose, onVerified } = rawProps as Props;
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const verify = async () => {
    if (!pin) {
      toast.warning("Enter your owner PIN");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/shop/owner-pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, pin }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "PIN verification failed");

      onVerified?.(j?.expiresAt);
      toast.success("Unlocked");
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not verify");
    } finally {
      setLoading(false);
      setPin("");
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 p-4 sm:p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-5 text-foreground shadow-xl dark:border-orange-400/90 dark:bg-neutral-950">
        <h2 className="mb-3 text-lg font-semibold">Owner PIN Required</h2>
        <Input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="bg-background dark:bg-neutral-900 dark:text-white"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            className="dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
          >
            Cancel
          </Button>
          <Button onClick={verify} disabled={loading || !pin}>
            {loading ? "Checking…" : "Unlock"}
          </Button>
        </div>
      </div>
    </div>
  );
}