"use client";

import BookingsTable from "./BookingsTable";

export default function BookingsTableWrapper({
  initialRows,
  canEdit,
}: {
  initialRows: any[];
  canEdit: boolean;
}) {
  return <BookingsTable initialRows={initialRows} canEdit={canEdit} />;
}