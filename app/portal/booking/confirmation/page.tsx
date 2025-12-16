// app/portal/booking/confirmation/page.tsx
import BookingConfirmationClient from "./BookingConfirmationClient";

export const dynamic = "force-dynamic";
// DO NOT export `revalidate` here unless it's a number or `false`.

export default function BookingConfirmationPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <BookingConfirmationClient />
    </div>
  );
}