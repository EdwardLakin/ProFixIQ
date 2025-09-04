"use client";
import { Suspense } from "react";
import PortalSignUpForm from "./PortalSignUpForm";

export default function PortalSignUpPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading sign up…</div>}>
      <PortalSignUpForm />
    </Suspense>
  );
}
