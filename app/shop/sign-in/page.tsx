import type { Metadata } from "next";
import { Suspense } from "react";

import AuthPage from "@/features/auth/components/SignIn";

export const metadata: Metadata = {
  title: "Shop sign in | ProFixIQ",
  description: "Sign in to the ProFixIQ Shop operating system.",
};

export default function ShopSignInPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center">Loading Shop sign in…</div>}>
      <AuthPage />
    </Suspense>
  );
}
