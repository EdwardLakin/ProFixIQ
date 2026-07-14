import Link from "next/link";
import type { ReactNode } from "react";

export function GuidedImportFooterActions({
  importing,
  completing,
  canConfirm,
  onConfirm,
  isOnboarding,
  returnTo,
  importSucceeded,
  hasResult,
  onContinue,
  onSkip,
  skipDisabled,
  skipLabel = "Skip for now",
  children,
}: {
  importing: boolean;
  completing: boolean;
  canConfirm: boolean;
  onConfirm: () => void;
  isOnboarding?: boolean;
  returnTo?: string;
  importSucceeded?: boolean;
  hasResult?: boolean;
  onContinue?: () => void;
  onSkip?: () => void;
  skipDisabled?: boolean;
  skipLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button
        type="button"
        onClick={onConfirm}
        disabled={importing || completing || !canConfirm}
        className="rounded-xl bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] shadow-[0_0_22px_rgba(212,118,49,0.45)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {importing
          ? "Importing…"
          : completing
            ? "Completing onboarding…"
            : "Confirm import"}
      </button>
      {isOnboarding && hasResult && importSucceeded && onContinue ? (
        <button
          type="button"
          onClick={onContinue}
          className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30"
        >
          Continue onboarding
        </button>
      ) : null}
      {isOnboarding && onSkip ? (
        <button
          type="button"
          onClick={onSkip}
          disabled={skipDisabled || importing || completing}
          className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-55"
        >
          {skipLabel}
        </button>
      ) : null}
      {isOnboarding && returnTo ? (
        <Link
          href={returnTo}
          className="rounded-xl border border-sky-500/30 bg-sky-950/25 px-4 py-2 text-center text-sm font-semibold text-sky-100 hover:bg-sky-900/30"
        >
          Return to Data Onboarding
        </Link>
      ) : null}
      {children}
    </div>
  );
}
