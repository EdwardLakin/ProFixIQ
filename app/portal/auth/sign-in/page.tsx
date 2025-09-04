"use client";
import { Suspense } from "react";
import PortalSignInForm from "./PortalSignInForm";

export default function PortalSignInPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading sign in…</div>}>
      <PortalSignInForm />
    </Suspense>
  );
}
