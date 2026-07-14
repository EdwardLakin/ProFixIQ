// app/portal/auth/sign-in/page.tsx
"use client";

import { Suspense } from "react";
import PortalSignInForm from "./PortalSignInForm";
import AuthShell from "@/features/auth/components/AuthShell";

const COPPER = "#C57A4A";

function LoadingCard({ label }: { label: string }) {
  return (
    <AuthShell cardClassName="rounded-2xl border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 backdrop-blur-md sm:p-6">
      <div>
        <div
          className="inline-flex items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: COPPER }}
        >
          Customer Portal
        </div>
        <div className="mt-4 text-sm text-[color:var(--theme-text-secondary)]">{label}</div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]">
          <div
            className="h-full w-1/2 animate-pulse rounded-full"
            style={{ backgroundColor: COPPER }}
          />
        </div>
      </div>
    </AuthShell>
  );
}

export default function PortalSignInPage() {
  return (
    <Suspense fallback={<LoadingCard label="Loading sign in…" />}>
      <PortalSignInForm />
    </Suspense>
  );
}
