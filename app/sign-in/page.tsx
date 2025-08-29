"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// app/sign-in/page.tsx
import { Suspense } from "react";
import AuthPage from "@/features/auth/components/SignIn";

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] grid place-items-center">Loading…</div>}>
      <AuthPage />
    </Suspense>
  );
}