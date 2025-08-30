"use client";


// app/signup/page.tsx
import { Suspense } from "react";
import SignUpClient from "@/features/auth/app/signup/SignUpClient";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] grid place-items-center text-white">
          <div className="text-center">
            <h1 className="text-xl font-semibold">Loading sign-up…</h1>
            <p className="text-sm text-neutral-400">One moment.</p>
          </div>
        </div>
      }
    >
      <SignUpClient />
    </Suspense>
  );
}