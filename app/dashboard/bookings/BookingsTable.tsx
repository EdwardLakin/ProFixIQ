"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";

export type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  work_order_id: string | null;
  customer_name?: string | null;
  vehicle_label?: string | null;
};

function fmtDateTime(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtStatus(status: BookingRow["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: BookingRow["status"]) {
  switch (status) {
    case "confirmed":
      return "border-emerald-500/20 bg-emerald-950/20 text-emerald-100";
    case "pending":
      return "border-amber-500/20 bg-amber-950/20 text-amber-100";
    case "cancelled":
      return "border-red-500/20 bg-red-950/20 text-red-100";
    case "completed":
      return "border-sky-500/20 bg-sky-950/20 text-sky-100";
    default:
      return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]";
  }
}

export default function BookingsTable({
  initialRows,
  canEdit,
}: {
  initialRows: BookingRow[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<BookingRow[]>(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BookingRow["status"]>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter;
      if (!matchesStatus) return false;

      if (!q) return true;

      const blob = [
        row.customer_name ?? "",
        row.vehicle_label ?? "",
        row.notes ?? "",
        row.status,
        row.id,
      ]
        .join(" ")
        .toLowerCase();

      return blob.includes(q);
    });
  }, [rows, query, statusFilter]);

  async function patch(id: string, body: Partial<BookingRow>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/portal/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => ({}))) as Partial<BookingRow> & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error || "Update failed");
      }

      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...json } : r)));
      toast.success("Booking updated.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not update booking.";
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this booking?")) return;

    setBusy(id);
    try {
      const res = await fetch(`/api/portal/bookings/${id}`, {
        method: "DELETE",
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(json.error || "Delete failed");
      }

      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Booking deleted.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not delete booking.";
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Bookings</h2>
          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Manage pending, confirmed, cancelled, and completed appointments.
          </p>
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, vehicle, notes…"
            className="md:w-72"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | BookingRow["status"])}
            className="rounded-md border border-border bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[color:var(--theme-border-soft)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[color:var(--theme-surface-inset)] text-left text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Status</th>
              {canEdit ? <th className="px-4 py-3">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 6 : 5}
                  className="px-4 py-8 text-center text-sm text-[color:var(--theme-text-muted)]"
                >
                  No bookings found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t border-[color:var(--theme-border-soft)]">
                  <td className="px-4 py-3 text-[color:var(--theme-text-primary)]">
                    <div>{fmtDateTime(row.starts_at)}</div>
                    <div className="text-xs text-[color:var(--theme-text-muted)]">{fmtDateTime(row.ends_at)}</div>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--theme-text-primary)]">
                    {row.customer_name || row.customer_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--theme-text-primary)]">
                    {row.vehicle_label || row.vehicle_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--theme-text-secondary)]">
                    {row.notes?.trim() || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-1 text-[0.72rem] ${statusClass(
                        row.status
                      )}`}
                    >
                      {fmtStatus(row.status)}
                    </span>
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {row.status !== "confirmed" ? (
                          <Button
                            size="sm"
                            onClick={() => patch(row.id, { status: "confirmed" })}
                            disabled={busy === row.id}
                          >
                            Confirm
                          </Button>
                        ) : null}

                        {row.status !== "completed" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => patch(row.id, { status: "completed" })}
                            disabled={busy === row.id}
                          >
                            Complete
                          </Button>
                        ) : null}

                        {row.status !== "cancelled" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => patch(row.id, { status: "cancelled" })}
                            disabled={busy === row.id}
                          >
                            Cancel
                          </Button>
                        ) : null}

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => remove(row.id)}
                          disabled={busy === row.id}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-[color:var(--theme-text-muted)]">
        Showing {filtered.length} of {rows.length} bookings
      </div>
    </div>
  );
}
