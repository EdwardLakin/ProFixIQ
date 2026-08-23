"use client";

import { LockKeyhole, RefreshCw } from "lucide-react";
import Link from "next/link";

import type { FieldServiceAccessDecision } from "./fieldServiceAccessContract";

export default function FieldServiceAccessPanel({
  decision,
  onRetry,
}: {
  decision: Extract<FieldServiceAccessDecision, "plan_required" | "forbidden">;
  onRetry: () => void;
}) {
  const planRequired = decision === "plan_required";

  return (
    <section
      role="alert"
      className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-6 text-center shadow-card"
    >
      <span className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
        <LockKeyhole aria-hidden className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-extrabold text-[color:var(--theme-text-primary)]">
        {planRequired
          ? "Field Service is not included"
          : "Field operator access required"}
      </h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[color:var(--theme-text-secondary)]">
        {planRequired
          ? "This shop's current package does not include ProFixIQ Field. An owner can add Field Service before setup or field work begins."
          : "Your signed-in profile is not an enabled Field operator. Ask a shop owner or admin to grant Field access, then verify again."}
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-copper)] px-4 text-sm font-bold text-[color:var(--theme-text-on-accent)]"
        >
          <RefreshCw aria-hidden className="h-4 w-4" />
          Verify access
        </button>
        <Link
          href={planRequired ? "/compare-plans" : "/sign-in"}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] px-4 text-sm font-bold text-[color:var(--theme-text-primary)]"
        >
          {planRequired ? "Compare plans" : "Choose another app"}
        </Link>
      </div>
    </section>
  );
}
