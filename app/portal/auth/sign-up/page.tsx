// app/portal/auth/sign-up/page.tsx
"use client";

import { Suspense } from "react";
import PortalSignUpForm from "./PortalSignUpForm";
import AuthShell from "@/features/auth/components/AuthShell";

const COPPER = "#C57A4A";

function LoadingCard({ label }: { label: string }) {
  return (
    <AuthShell>
      <div className="mb-6 space-y-2 text-center">
        <div
          className="
                inline-flex items-center gap-1 rounded-full border
                border-[color:var(--metal-border-soft,#1f2937)]
                bg-black/70
                px-3 py-1 text-[11px]
                uppercase tracking-[0.22em]
                text-neutral-300
              "
          style={{ color: COPPER }}
        >
          Customer Portal
        </div>

        <div
          className="mt-2 text-2xl sm:text-3xl font-semibold text-white"
          style={{ fontFamily: "var(--font-blackops), system-ui" }}
        >
          Sign up
        </div>

        <div className="text-xs text-neutral-400">{label}</div>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
        <div
          className="h-full w-1/2 animate-pulse rounded-full"
          style={{ backgroundColor: COPPER }}
        />
      </div>
    </AuthShell>
  );
}

export default function PortalSignUpPage() {
  return (
    <Suspense fallback={<LoadingCard label="Loading sign up…" />}>
      <PortalSignUpForm />
    </Suspense>
  );
}
