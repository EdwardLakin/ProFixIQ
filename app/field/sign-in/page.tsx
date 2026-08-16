import type { Metadata } from "next";
import { Suspense } from "react";

import FieldSignIn from "@/features/auth/components/FieldSignIn";

export const metadata: Metadata = {
  title: "Field sign in | ProFixIQ",
  description: "Sign in to ProFixIQ Field from your phone, tablet, or laptop.",
};

export default function FieldSignInPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center">Loading Field sign in…</div>}>
      <FieldSignIn />
    </Suspense>
  );
}
