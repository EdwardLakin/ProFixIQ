"use client";

import { Button } from "@shared/components/ui/Button";
import OwnerPinBadge from "@shared/components/OwnerPinBadge";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";

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
    <div className={`${PANEL_VARIANTS.primary} flex flex-wrap items-center justify-between gap-4 p-5`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted,#64748B)]">
          Owner control center
        </p>
        <h1 className="text-2xl font-blackops text-orange-400">Shop Settings</h1>
        <p className="text-xs text-[color:var(--theme-text-secondary,#94A3B8)]">
          Configure branding, operations, billing, and scheduling from one operational console.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <OwnerPinBadge expiresAt={pinExpiresAt} />
        <Button size="sm" variant="secondary" onClick={onUnlock}>
          {isUnlocked ? "Re-unlock" : "Unlock controls"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onLock}>
          Lock
        </Button>
        <Button size="sm" onClick={onSave} disabled={!isUnlocked}>
          {isUnlocked ? "Save settings" : "Unlock to save"}
        </Button>
      </div>
    </div>
  );
}
