"use client";

import { cn } from "@/features/shared/lib/utils";
import type { WorkspaceCapabilityEffect } from "@/features/workspace/authorization/capabilities";

export type CapabilityEffectOption = {
  value: WorkspaceCapabilityEffect;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * Tri-state INHERIT / ALLOW / DENY control.
 *
 * Disabling an option here is a convenience for the person editing, never the
 * authorization decision: the write RPC re-checks the grant ceiling, peer
 * authority, tenant scope, and protected-capability rules on every call.
 */
export default function CapabilityEffectControl({
  name,
  value,
  options,
  disabled,
  busy,
  onChange,
}: {
  name: string;
  value: WorkspaceCapabilityEffect;
  options: readonly CapabilityEffectOption[];
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: WorkspaceCapabilityEffect) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn(
        "inline-flex w-full max-w-full shrink-0 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-0.5 sm:w-auto",
        (disabled || busy) && "opacity-60",
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const optionDisabled = disabled || busy || option.disabled;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={optionDisabled}
            title={option.disabled ? option.disabledReason : undefined}
            onClick={() => {
              if (optionDisabled || active) return;
              onChange(option.value);
            }}
            className={cn(
              "min-h-9 flex-1 whitespace-nowrap rounded-[10px] px-2.5 text-[11px] font-semibold leading-none transition sm:px-3 sm:text-xs",
              active
                ? "bg-[var(--accent-copper)] text-[color:var(--theme-text-on-accent)] shadow-[var(--theme-shadow-soft)]"
                : "text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]",
              optionDisabled && !active && "cursor-not-allowed opacity-50",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
