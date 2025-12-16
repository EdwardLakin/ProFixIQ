import { Suspense } from "react";
import BookingPageClient from "./BookingPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] grid place-items-center text-white">
          <p>Loading booking page…</p>
        </div>
      }
    >
      <BookingPageClient />
    </Suspense>
  );
}