// app/dashboard/bookings/BookingsTableWrapper.tsx
"use client";

import BookingsTable from "./BookingsTable";

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
};

export default function BookingsTableWrapper({
  initialRows,
  canEdit,
}: {
  initialRows: Row[];
  canEdit: boolean;
}) {
  return <BookingsTable initialRows={initialRows} canEdit={canEdit} />;
}