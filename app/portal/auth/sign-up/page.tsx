// app/portal/auth/sign-up/page.tsx
"use client";

import { Suspense } from "react";
import PortalSignUpForm from "./PortalSignUpForm";

const COPPER = "#C57A4A";

function LoadingCard({ label }: { label: string }) {
  return (
    <div
      className="
        min-h-screen px-4 text-foreground
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center py-8">
        <div
          className="
            w-full rounded-3xl border
            border-[color:var(--metal-border-soft,#1f2937)]
            bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)]
            shadow-[0_32px_80px_rgba(0,0,0,0.95)]
            px-6 py-7 sm:px-8 sm:py-9
          "
        >
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
        </div>
      </div>
    </div>
  );
}

export default function PortalSignUpPage() {
  return (
    <Suspense fallback={<LoadingCard label="Loading sign up…" />}>
      <PortalSignUpForm />
    </Suspense>
  );
}