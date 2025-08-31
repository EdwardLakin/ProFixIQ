import { Suspense } from "react";
import BookingConfirmationClient from "./BookingConfirmationClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] grid place-items-center text-white">
          <div className="text-center">
            <p className="text-lg font-semibold">Loading confirmation…</p>
            <p className="text-sm text-neutral-400">One moment.</p>
          </div>
        </div>
      }
    >
      <BookingConfirmationClient />
    </Suspense>
  );
}