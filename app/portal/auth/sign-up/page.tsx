// app/portal/auth/sign-up/page.tsx
"use client";

import { Suspense } from "react";
import PortalSignUpForm from "./PortalSignUpForm";

const COPPER = "#C57A4A";

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-md sm:p-6">
        <div
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: COPPER }}
        >
          Customer Portal
        </div>
        <div className="mt-4 text-sm text-neutral-300">{label}</div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/5">
          <div
            className="h-full w-1/2 animate-pulse rounded-full"
            style={{ backgroundColor: COPPER }}
          />
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