"use client";

import { Button } from "@shared/components/ui/Button";
import OwnerPinBadge from "@shared/components/OwnerPinBadge";

type Props = {
  isUnlocked: boolean;
  pinExpiresAt?: string;
  onUnlock: () => void;
  onLock: () => void;
  onSave: () => void;
};

export default function OwnerSettingsHeader({
  isUnlocked,
  pinExpiresAt,
  onUnlock,
  onLock,
  onSave,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div>
        <h1 className="text-2xl font-blackops text-orange-400">Shop Settings</h1>
        <p className="text-xs text-neutral-400">
          Location, billing, operations, and scheduling.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <OwnerPinBadge expiresAt={pinExpiresAt} />
        <Button size="sm" onClick={onUnlock}>
          {isUnlocked ? "Re-unlock" : "Unlock"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onLock}>
          Lock
        </Button>
        <Button size="sm" onClick={onSave} disabled={!isUnlocked}>
          {isUnlocked ? "Save all" : "Unlock to save"}
        </Button>
      </div>
    </div>
  );
}
