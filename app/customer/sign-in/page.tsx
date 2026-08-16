import type { Metadata } from "next";
import { Suspense } from "react";

import PortalSignInForm from "../../portal/auth/sign-in/PortalSignInForm";

export const metadata: Metadata = {
  title: "Customer Portal sign in | ProFixIQ",
  description: "Sign in to your ProFixIQ Customer Portal.",
};

export default function CustomerSignInPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center">Loading Customer Portal sign in…</div>}>
      <PortalSignInForm portalType="customer" />
    </Suspense>
  );
}
