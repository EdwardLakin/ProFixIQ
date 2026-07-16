"use client";

import { Button } from "@shared/components/ui/Button";
import OwnerPinBadge from "@shared/components/OwnerPinBadge";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";

type Props = {
  shopName: string;
  roleLabel: string;
  sectionLabel: string;
  isUnlocked: boolean;
  isDirty: boolean;
  showSave: boolean;
  pinExpiresAt?: string;
  onUnlock: () => void;
  onLock: () => void;
  onSave: () => void;
  onDiscard: () => void;
};

export default function OwnerSettingsHeader({
  shopName,
  roleLabel,
  sectionLabel,
  isUnlocked,
  isDirty,
  showSave,
  pinExpiresAt,
  onUnlock,
  onLock,
  onSave,
  onDiscard,
}: Props) {
  return (
    <div
      className={`${PANEL_VARIANTS.primary} flex flex-wrap items-center justify-between gap-4 p-5`}
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
          Administration · {roleLabel}
        </p>
        <h1 className="text-2xl font-blackops text-[var(--accent-copper)]">
          Shop settings
        </h1>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          {shopName || "Current shop"} <span aria-hidden>·</span> {sectionLabel}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <OwnerPinBadge expiresAt={pinExpiresAt} />
        <Button size="sm" variant="secondary" onClick={onUnlock}>
          {isUnlocked ? "Re-unlock" : "Unlock controls"}
        </Button>
        {isUnlocked ? (
          <Button size="sm" variant="secondary" onClick={onLock}>
            Lock
          </Button>
        ) : null}
        {showSave && isDirty ? (
          <Button size="sm" variant="secondary" onClick={onDiscard}>
            Discard
          </Button>
        ) : null}
        {showSave ? (
          <Button size="sm" onClick={onSave} disabled={!isUnlocked || !isDirty}>
            {!isUnlocked
              ? "Unlock to edit"
              : isDirty
                ? "Save core changes"
                : "Saved"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
