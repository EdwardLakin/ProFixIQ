"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
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
  const coverage = useMemo(() => {
    const awayToday = staff.filter((s) => s.is_away_today).length;
    const activeCount = staff.length;
    const availableCount = Math.max(activeCount - awayToday, 0);
    const missingTemplates = staff.filter((s) => s.recurring_template_rows === 0).length;
    const overrideCount = staff.reduce((sum, s) => sum + s.override_count_in_range, 0);

    return { awayToday, activeCount, availableCount, missingTemplates, overrideCount };
  }, [staff]);

  const focus = searchParams.get("focus");
  const status = searchParams.get("status");
  const conflictType = searchParams.get("type");
  const awayDate = searchParams.get("date");
  const personId = searchParams.get("person_id");
  const filterLabel = useMemo(() => {
    if (focus === "time-off" && status === "pending") return "Pending time off";
    if (focus === "away" && awayDate === "today") return "Away today";
    if (focus === "away" && awayDate === "tomorrow") return "Away tomorrow";
    if (focus === "conflicts" && conflictType === "assigned_to_unavailable") return "Assigned to unavailable";
    if (focus === "schedule-gaps") return "Missing schedule templates";
    if (focus === "workload" && personId) return "Workload context";
    return null;
  }, [awayDate, conflictType, focus, personId, status]);

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
    const startLocal = overrideStart || null;
    const endLocal = overrideEnd || null;
    const res = await fetch(`/api/scheduling/staff/${selectedStaffId}/overrides`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schedule_date: overrideDate, start_local: startLocal, end_local: endLocal }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "Failed to add override");
    setOverrideDate("");
    setOverrideStart("");
    setOverrideEnd("");
    await load();
  }

  async function reviewRequest(id: string, statusValue: "approved" | "declined") {
    setBusy(true);
    const res = await fetch(`/api/time-off/requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: statusValue }),
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
        title="Scheduling Command"
        subtitle="Coverage, time away, and shift readiness for today’s workforce."
      />
      {filterLabel ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs text-orange-200">
          <span>Filtered from Workforce Overview: {filterLabel}</span>
          <Link href="/dashboard/workforce/scheduling" className="font-medium text-orange-300 hover:text-orange-200">Clear filter</Link>
        </div>
      ) : null}

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Available / Working</p>
          <p className="text-xl font-semibold text-emerald-200">{coverage.availableCount} / {coverage.activeCount}</p>
        </div>
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Away Today</p>
          <p className="text-xl font-semibold text-amber-200">{coverage.awayToday}</p>
        </div>
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Pending Time-Off</p>
          <p className="text-xl font-semibold text-orange-200">{pending.length}</p>
        </div>
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Missing Templates</p>
          <p className="text-xl font-semibold text-rose-200">{coverage.missingTemplates}</p>
        </div>
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Overrides (Range)</p>
          <p className="text-xl font-semibold text-sky-200">{coverage.overrideCount}</p>
        </div>
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <AdminPanel>
          <AdminPanelTitle title="Today Roster" description="Real-time posture for today's assigned workforce." />
          <div className="space-y-2 p-4 text-sm">
            <p className="text-xs text-[color:var(--theme-text-secondary)]">Available: {coverage.availableCount} · Away: {coverage.awayToday}</p>
            {staff.length === 0 ? <p className="text-[color:var(--theme-text-secondary)]">No staff in current range.</p> : staff.map((s) => (
              <div key={`today-${s.id}`} className="flex items-center justify-between rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                <span>{s.full_name ?? "Unnamed"}</span>
                <span className={s.is_away_today ? "text-amber-300" : "text-emerald-300"}>{s.is_away_today ? "Away today" : "Available"}</span>
              </div>
            ))}
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelTitle title="Tomorrow Roster" description="No explicit tomorrow-away signal is currently available from this API payload." />
          <div className="p-4 text-sm text-[color:var(--theme-text-secondary)]">
            <p>Use approved away blocks and staffing templates in the posture table below to plan tomorrow coverage.</p>
          </div>
        </AdminPanel>
      </div>

      <AdminPanel className={focus === "time-off" && status === "pending" ? "ring-1 ring-orange-400/50" : ""}>
        <AdminPanelTitle title={`Time-Off Review Queue (${pending.length})`} description="Approve or decline requests. Existing review actions and semantics are unchanged." />
        <div className="space-y-2 p-4 text-sm">
          {pending.length === 0 ? <p className="text-[color:var(--theme-text-secondary)]">No pending requests.</p> : pending.map((r) => (
            <div key={r.id} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
              <p className="font-medium">{r.request_type} • {new Date(r.starts_at).toLocaleString()} → {new Date(r.ends_at).toLocaleString()}</p>
              <p className="text-xs text-[color:var(--theme-text-secondary)]">{r.reason ?? "No note"}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => void reviewRequest(r.id, "approved")} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">Approve</button>
                <button type="button" disabled={busy} onClick={() => void reviewRequest(r.id, "declined")} className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">Decline</button>
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <AdminPanel>
            <AdminPanelTitle title="Team Weekly Posture" description="Scan readiness, schedule gaps, override volume, and approved away blocks." />
            <div className="overflow-x-auto p-4">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-[color:var(--theme-text-secondary)]"><tr><th className="text-left">Staff</th><th className="text-left">Role</th><th className="text-left">Recurring hrs/wk</th><th className="text-left">Template rows</th><th className="text-left">Overrides (7d)</th><th className="text-left">Away blocks (7d)</th><th className="text-left">Status</th></tr></thead>
                <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                  {staff.map((s) => (
                    <tr key={s.id} onClick={() => setSelectedStaffId(s.id)} className={`cursor-pointer ${selectedStaffId === s.id ? "bg-[color:var(--theme-surface-subtle)]" : "hover:bg-[color:var(--theme-surface-subtle)]"} ${focus === "schedule-gaps" && s.recurring_template_rows === 0 ? "bg-amber-500/10 ring-1 ring-amber-400/40" : ""} ${focus === "away" && awayDate === "today" && s.is_away_today ? "ring-1 ring-amber-400/40" : ""} ${focus === "workload" && personId === s.id ? "ring-1 ring-orange-400/40" : ""}`}>
                      <td className="py-2">{s.full_name ?? "Unnamed"}</td>
                      <td>{s.role ?? "staff"}</td>
                      <td>{minsToHours(s.weekly_recurring_minutes)}</td>
                      <td className={s.recurring_template_rows === 0 ? "text-amber-200" : ""}>{s.recurring_template_rows}</td>
                      <td>{s.override_count_in_range}</td>
                      <td>{s.approved_away_blocks_in_range}</td>
                      <td className={s.is_away_today ? "text-amber-300" : "text-emerald-300"}>{s.is_away_today ? "Away today" : "Available"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminPanel>
        </div>

        <div className="xl:col-span-2">
          <AdminPanel>
            <AdminPanelTitle title="Staff Schedule Editor" description="Selected staff summary, recurring weekly template, and one-off override creation." />
            <div className="space-y-4 p-4">
              <div className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm">
                <p className="text-xs text-[color:var(--theme-text-secondary)]">Selected Staff</p>
                <p className="font-medium">{selected?.full_name ?? "None"}</p>
                <p className="text-xs text-[color:var(--theme-text-secondary)]">{selected?.role ?? "staff"}</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--theme-text-secondary)]">Weekly Template</p>
                <div className="space-y-2">
                  {templates.sort((a, b) => a.day_of_week - b.day_of_week).map((row, i) => (
                    <div key={row.day_of_week} className="grid grid-cols-12 items-center gap-2 text-xs">
                      <div className="col-span-2">{DAYS[row.day_of_week]}</div>
                      <label className="col-span-2 flex items-center gap-1">
                        <span className="sr-only">{DAYS[row.day_of_week]} working day</span>
                        <input type="checkbox" checked={row.is_working_day} onChange={(e) => setTemplates((prev) => prev.map((x, idx) => idx === i ? { ...x, is_working_day: e.target.checked } : x))} />
                        <span>Work</span>
                      </label>
                      <input aria-label={`${DAYS[row.day_of_week]} start time`} type="time" value={row.start_time ?? ""} onChange={(e) => setTemplates((prev) => prev.map((x, idx) => idx === i ? { ...x, start_time: e.target.value } : x))} className="col-span-3 rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1" />
                      <input aria-label={`${DAYS[row.day_of_week]} end time`} type="time" value={row.end_time ?? ""} onChange={(e) => setTemplates((prev) => prev.map((x, idx) => idx === i ? { ...x, end_time: e.target.value } : x))} className="col-span-3 rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1" />
                      <input aria-label={`${DAYS[row.day_of_week]} unpaid break minutes`} type="number" value={row.unpaid_break_minutes} onChange={(e) => setTemplates((prev) => prev.map((x, idx) => idx === i ? { ...x, unpaid_break_minutes: Number(e.target.value) } : x))} className="col-span-2 rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1" />
                    </div>
                  ))}
                </div>
                <button type="button" disabled={busy || !selectedStaffId} onClick={() => void saveTemplate()} className="mt-3 rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs">Save recurring template</button>
              </div>

              <div className="space-y-2 border-t border-[color:var(--theme-border-soft)] pt-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--theme-text-secondary)]">One-off Override</p>
                <label className="text-xs text-[color:var(--theme-text-secondary)]" htmlFor="override-date">Date</label>
                <input id="override-date" type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} className="w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1" />
                <label className="text-xs text-[color:var(--theme-text-secondary)]" htmlFor="override-start">Start time</label>
                <input id="override-start" type="time" value={overrideStart} onChange={(e) => setOverrideStart(e.target.value)} className="w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1" />
                <label className="text-xs text-[color:var(--theme-text-secondary)]" htmlFor="override-end">End time</label>
                <input id="override-end" type="time" value={overrideEnd} onChange={(e) => setOverrideEnd(e.target.value)} className="w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1" />
                <button type="button" disabled={busy || !selectedStaffId || !overrideDate} onClick={() => void addOverride()} className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs">Add override</button>
                <div className="text-xs text-[color:var(--theme-text-secondary)]">Cross links: <Link className="text-orange-300" href="/dashboard/admin/people">People</Link> · <Link className="text-orange-300" href="/dashboard/admin/payroll-time">Payroll Time</Link></div>
              </div>
            </div>
            {error ? <p className="px-4 pb-4 text-xs text-red-300">{error}</p> : null}
          </AdminPanel>
        </div>
      </div>
    </AdminPageShell>
  );
}
