"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminPageHeader, AdminPageShell, AdminPanel, AdminPanelTitle } from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type Staff = {
  id: string;
  full_name: string | null;
  role: string | null;
  weekly_recurring_minutes: number;
  recurring_template_rows: number;
  override_count_in_range: number;
  approved_away_blocks_in_range: number;
  is_away_today: boolean;
};

type TimeOffRequest = {
  id: string;
  user_id: string;
  request_type: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  reason: string | null;
};

type TemplateRow = {
  day_of_week: number;
  is_working_day: boolean;
  start_time: string | null;
  end_time: string | null;
  unpaid_break_minutes: number;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minsToHours(mins: number) {
  return (mins / 60).toFixed(1);
}

function emptyTemplate(): TemplateRow[] {
  return DAYS.map((_, day_of_week) => ({ day_of_week, is_working_day: day_of_week >= 1 && day_of_week <= 5, start_time: "08:00", end_time: "17:00", unpaid_break_minutes: 30 }));
}

export default function WorkforceSchedulingClient() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [pending, setPending] = useState<TimeOffRequest[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [templates, setTemplates] = useState<TemplateRow[]>(emptyTemplate());
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideStart, setOverrideStart] = useState("");
  const [overrideEnd, setOverrideEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const now = new Date();
    const to = new Date(now);
    to.setDate(now.getDate() + 7);
    const qs = new URLSearchParams({ from: now.toISOString(), to: to.toISOString() });
    const res = await fetch(`/api/scheduling/staff?${qs}`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to load scheduling data");
      return;
    }
    setStaff(body?.staff ?? []);
    setPending(body?.pending_time_off_requests ?? []);
    if (!selectedStaffId && body?.staff?.length) setSelectedStaffId(body.staff[0].id);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedStaffId) return;
    (async () => {
      const res = await fetch(`/api/scheduling/staff/${selectedStaffId}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) return;
      const fromApi = (body?.templates ?? []) as TemplateRow[];
      setTemplates(fromApi.length ? fromApi : emptyTemplate());
    })();
  }, [selectedStaffId]);

  const selected = useMemo(() => staff.find((s) => s.id === selectedStaffId) ?? null, [staff, selectedStaffId]);

  async function saveTemplate() {
    if (!selectedStaffId) return;
    setBusy(true);
    const res = await fetch(`/api/scheduling/staff/${selectedStaffId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templates }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(body?.error ?? "Failed to save template");
      return;
    }
    await load();
  }

  async function addOverride() {
    if (!selectedStaffId || !overrideDate) return;
    setBusy(true);
    const startIso = overrideStart ? `${overrideDate}T${overrideStart}:00.000Z` : null;
    const endIso = overrideEnd ? `${overrideDate}T${overrideEnd}:00.000Z` : null;
    const res = await fetch(`/api/scheduling/staff/${selectedStaffId}/overrides`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schedule_date: overrideDate, start_time: startIso, end_time: endIso }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "Failed to add override");
    setOverrideDate("");
    setOverrideStart("");
    setOverrideEnd("");
    await load();
  }

  async function reviewRequest(id: string, status: "approved" | "declined") {
    setBusy(true);
    const res = await fetch(`/api/time-off/requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "Failed to review request");
    await load();
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Workforce Operations"
        title="Staff Scheduling + Time Away"
        subtitle="Recurring templates, one-off shift overrides, and time off approvals in one scheduling surface tied to People and Payroll Time."
      />

      <AdminPanel>
        <AdminPanelTitle title="Team Weekly Posture" description="Scan schedule readiness, override volume, and approved away blocks." />
        <div className="overflow-x-auto p-4">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-neutral-400"><tr><th className="text-left">Staff</th><th className="text-left">Role</th><th className="text-left">Recurring hrs/wk</th><th className="text-left">Template rows</th><th className="text-left">Overrides (7d)</th><th className="text-left">Away blocks (7d)</th><th className="text-left">Status</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {staff.map((s) => (
                <tr key={s.id} onClick={() => setSelectedStaffId(s.id)} className={`cursor-pointer ${selectedStaffId === s.id ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <td className="py-2">{s.full_name ?? "Unnamed"}</td>
                  <td>{s.role ?? "staff"}</td>
                  <td>{minsToHours(s.weekly_recurring_minutes)}</td>
                  <td>{s.recurring_template_rows}</td>
                  <td>{s.override_count_in_range}</td>
                  <td>{s.approved_away_blocks_in_range}</td>
                  <td className={s.is_away_today ? "text-amber-300" : "text-emerald-300"}>{s.is_away_today ? "Away today" : "Available"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Pending Time Off Requests" description="Approve or decline from here; approvals automatically create schedule availability blocks." />
        <div className="space-y-2 p-4 text-sm">
          {pending.length === 0 ? <p className="text-neutral-400">No pending requests.</p> : pending.map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
              <p className="font-medium">{r.request_type} • {new Date(r.starts_at).toLocaleString()} → {new Date(r.ends_at).toLocaleString()}</p>
              <p className="text-xs text-neutral-400">{r.reason ?? "No note"}</p>
              <div className="mt-2 flex gap-2">
                <button disabled={busy} onClick={() => void reviewRequest(r.id, "approved")} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Approve</button>
                <button disabled={busy} onClick={() => void reviewRequest(r.id, "declined")} className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">Decline</button>
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Staff Schedule Detail" description="Edit recurring weekly template and create one-off override shifts." />
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-neutral-400">Selected: {selected?.full_name ?? "None"}</p>
            <div className="space-y-2">
              {templates.sort((a, b) => a.day_of_week - b.day_of_week).map((row, i) => (
                <div key={row.day_of_week} className="grid grid-cols-12 items-center gap-2 text-xs">
                  <div className="col-span-2">{DAYS[row.day_of_week]}</div>
                  <input type="checkbox" checked={row.is_working_day} onChange={(e) => setTemplates((prev) => prev.map((x, idx) => idx === i ? { ...x, is_working_day: e.target.checked } : x))} />
                  <input type="time" value={row.start_time ?? ""} onChange={(e) => setTemplates((prev) => prev.map((x, idx) => idx === i ? { ...x, start_time: e.target.value } : x))} className="col-span-3 rounded border border-white/10 bg-black/30 px-2 py-1" />
                  <input type="time" value={row.end_time ?? ""} onChange={(e) => setTemplates((prev) => prev.map((x, idx) => idx === i ? { ...x, end_time: e.target.value } : x))} className="col-span-3 rounded border border-white/10 bg-black/30 px-2 py-1" />
                  <input type="number" value={row.unpaid_break_minutes} onChange={(e) => setTemplates((prev) => prev.map((x, idx) => idx === i ? { ...x, unpaid_break_minutes: Number(e.target.value) } : x))} className="col-span-2 rounded border border-white/10 bg-black/30 px-2 py-1" />
                </div>
              ))}
            </div>
            <button disabled={busy || !selectedStaffId} onClick={() => void saveTemplate()} className="mt-3 rounded border border-white/20 bg-white/10 px-3 py-2 text-xs">Save recurring template</button>
          </div>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-neutral-400">One-off override shift</p>
            <input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} className="w-full rounded border border-white/10 bg-black/30 px-2 py-1" />
            <input type="time" value={overrideStart} onChange={(e) => setOverrideStart(e.target.value)} className="w-full rounded border border-white/10 bg-black/30 px-2 py-1" />
            <input type="time" value={overrideEnd} onChange={(e) => setOverrideEnd(e.target.value)} className="w-full rounded border border-white/10 bg-black/30 px-2 py-1" />
            <button disabled={busy || !selectedStaffId || !overrideDate} onClick={() => void addOverride()} className="rounded border border-white/20 bg-white/10 px-3 py-2 text-xs">Add override</button>
            <div className="text-xs text-neutral-400">Cross links: <Link className="text-orange-300" href="/dashboard/admin/people">People</Link> · <Link className="text-orange-300" href="/dashboard/admin/payroll-time">Payroll Time</Link></div>
          </div>
        </div>
        {error ? <p className="px-4 pb-4 text-xs text-red-300">{error}</p> : null}
      </AdminPanel>
    </AdminPageShell>
  );
}
