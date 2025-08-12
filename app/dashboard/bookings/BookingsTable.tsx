"use client";

import { useState } from "react";
import { toast } from "sonner";

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
};

export default function BookingsTable({
  initialRows,
  canEdit,
}: {
  initialRows: Row[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(id: string, body: Partial<Row>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/portal/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      const updated = await res.json();
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      toast.success("Booking updated.");
    } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Could not update booking.";
    toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-900 text-neutral-300">
          <tr>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Ends</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Notes</th>
            {canEdit && <th className="px-3 py-2 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-800">
              <td className="px-3 py-2">
                {new Date(r.starts_at).toLocaleString()}
              </td>
              <td className="px-3 py-2">
                {new Date(r.ends_at).toLocaleString()}
              </td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2 text-neutral-300">
                {r.notes || <span className="text-neutral-500">—</span>}
              </td>
              {canEdit && (
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-2">
                    <button
                      disabled={busy === r.id}
                      className="px-2 py-1 rounded border border-orange-600 text-orange-400 hover:bg-orange-600 hover:text-black"
                      onClick={() => patch(r.id, { status: "confirmed" })}
                    >
                      Confirm
                    </button>
                    <button
                      disabled={busy === r.id}
                      className="px-2 py-1 rounded border border-neutral-600 text-neutral-300 hover:bg-neutral-700"
                      onClick={() => patch(r.id, { status: "completed" })}
                    >
                      Complete
                    </button>
                    <button
                      disabled={busy === r.id}
                      className="px-2 py-1 rounded border border-red-600 text-red-400 hover:bg-red-600 hover:text-black"
                      onClick={() => patch(r.id, { status: "cancelled" })}
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-neutral-400" colSpan={5}>
                No bookings yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}