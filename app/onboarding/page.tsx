// app/onboarding/page.tsx
"use client";

import { Suspense } from "react";
import OnboardingPage from "@/features/auth/app/onboarding/OnboardingPage";

export default function OnboardingPageWrapper() {
  return (
    <Suspense fallback={<div className="text-white">Loading...</div>}>
      <OnboardingPage />
    </Suspense>
  );
}