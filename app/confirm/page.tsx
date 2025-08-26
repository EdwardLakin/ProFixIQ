// app/confirm/page.tsx
import { Suspense } from "react";
import ConfirmContent from "./ConfirmContent";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] grid place-items-center text-white">
          <div className="text-center">
            <p className="text-lg font-semibold">Finishing sign-in…</p>
            <p className="text-sm text-neutral-400">One moment.</p>
          </div>
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}