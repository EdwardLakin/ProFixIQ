// app/confirm/page.tsx
"use client";

import { Suspense } from "react";
import ConfirmContent from "./ConfirmContent";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-white text-center">Loading…</div>}>
      <ConfirmContent />
    </Suspense>
  );
}