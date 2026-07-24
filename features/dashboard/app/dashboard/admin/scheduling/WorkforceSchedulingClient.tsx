"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminPageHeader, AdminPanel, AdminPanelTitle } from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type Staff = {
  id: string;
  full_name: string | null;
  role: string | null;
  weekly_recurring_minutes: number;
  recurring_template_rows: number;
  override_count_in_range: number;
  approved_away_blocks_in_range: number;
  is_away_today: boolean;
  is_away_tomorrow: boolean;
  active_assigned_work_count: number;
};

type TimeOffRequest = {
  id: string;
  user_id: string;
  request_type: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  reason: string | null;
  employee_name: string;
  employee_role: string | null;
  scheduled_minutes_affected: number;
  overlapping_approved_absences: number;
  active_assigned_work_count: number;
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
  const [showCreateRequest, setShowCreateRequest] = useState(false);
  const [requestType, setRequestType] = useState("vacation");
  const [requestStart, setRequestStart] = useState("");
  const [requestEnd, setRequestEnd] = useState("");
  const [requestReason, setRequestReason] = useState("");
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
    const reviewNote = window.prompt(
      statusValue === "approved" ? "Approval note (optional)" : "Reason for declining (recommended)",
      "",
    );
    if (reviewNote === null) return;
    setBusy(true);
    const res = await fetch(`/api/time-off/requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: statusValue, review_note: reviewNote.trim() || null }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "Failed to review request");
    await load();
  }

  async function createRequestForStaff() {
    if (!selectedStaffId || !requestStart || !requestEnd) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/time-off/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: selectedStaffId,
        request_type: requestType,
        starts_at: new Date(requestStart).toISOString(),
        ends_at: new Date(requestEnd).toISOString(),
        is_partial_day: requestStart.slice(0, 10) === requestEnd.slice(0, 10),
        reason: requestReason.trim() || null,
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(body?.error ?? "Failed to create time-away request");
      return;
    }
    setRequestStart("");
    setRequestEnd("");
    setRequestReason("");
    setShowCreateRequest(false);
    await load();
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="Coverage planning"
        title="Schedule & Time Away"
        subtitle="Plan recurring coverage, handle exceptions, and review time-away requests without leaving Workforce."
      />
      {filterLabel ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs text-[color:var(--theme-accent-text)]">
          <span>Filtered from Workforce Overview: {filterLabel}</span>
          <Link href="/dashboard/workforce/scheduling" className="font-medium text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]">Clear filter</Link>
        </div>
      ) : null}

      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Available / Working</p>
          <p className="text-xl font-semibold text-[color:var(--theme-success-text)]">{coverage.availableCount} / {coverage.activeCount}</p>
        </div>
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Away Today</p>
          <p className="text-xl font-semibold text-[color:var(--theme-warning-text)]">{coverage.awayToday}</p>
        </div>
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Pending Time-Off</p>
          <p className="text-xl font-semibold text-[color:var(--theme-accent-text)]">{pending.length}</p>
        </div>
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Missing Templates</p>
          <p className="text-xl font-semibold text-[color:var(--theme-danger-text)]">{coverage.missingTemplates}</p>
        </div>
        <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">Overrides (Range)</p>
          <p className="text-xl font-semibold text-[color:var(--theme-info-text)]">{coverage.overrideCount}</p>
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
                <span className={s.is_away_today ? "text-[color:var(--theme-warning-text)]" : "text-[color:var(--theme-success-text)]"}>{s.is_away_today ? "Away today" : "Available"}</span>
              </div>
            ))}
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelTitle title="Tomorrow Roster" description="Approved time away is reflected before assigning tomorrow's work." />
          <div className="space-y-2 p-4 text-sm">
            {staff.map((s) => (
              <div key={`tomorrow-${s.id}`} className="flex items-center justify-between rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2">
                <span>{s.full_name ?? "Unnamed"}</span>
                <span className={s.is_away_tomorrow ? "text-[color:var(--theme-warning-text)]" : "text-[color:var(--theme-success-text)]"}>{s.is_away_tomorrow ? "Away tomorrow" : "Available"}</span>
              </div>
            ))}
          </div>
        </AdminPanel>
      </div>

      <AdminPanel className={focus === "time-off" && status === "pending" ? "ring-1 ring-orange-400/50" : ""}>
        <AdminPanelTitle title={`Time-Away Approval (${pending.length})`} description="Review the employee, scheduled hours affected, coverage pressure, and active assigned work before deciding." />
        <div className="space-y-2 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[color:var(--theme-text-secondary)]">Approvals create schedule availability blocks in the same transaction.</p>
            <button type="button" onClick={() => setShowCreateRequest((current) => !current)} className="rounded border border-orange-400/40 bg-orange-500/10 px-3 py-2 text-xs text-[color:var(--theme-accent-text)]">
              {showCreateRequest ? "Close" : "Create for employee"}
            </button>
          </div>
          {showCreateRequest ? (
            <div className="grid gap-2 rounded-lg border border-orange-400/30 bg-orange-500/5 p-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
                Employee
                <select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-2">
                  {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name ?? "Unnamed"} · {person.role ?? "staff"}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
                Type
                <select value={requestType} onChange={(event) => setRequestType(event.target.value)} className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-2">
                  <option value="vacation">Vacation</option>
                  <option value="personal">Personal</option>
                  <option value="appointment">Appointment</option>
                  <option value="sick">Sick</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">Starts<input type="datetime-local" value={requestStart} onChange={(event) => setRequestStart(event.target.value)} className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-2" /></label>
              <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">Ends<input type="datetime-local" value={requestEnd} onChange={(event) => setRequestEnd(event.target.value)} className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-2" /></label>
              <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)] md:col-span-2">Note<input value={requestReason} onChange={(event) => setRequestReason(event.target.value)} className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-2" /></label>
              <button type="button" disabled={busy || !selectedStaffId || !requestStart || !requestEnd} onClick={() => void createRequestForStaff()} className="rounded bg-orange-500 px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)] disabled:opacity-50">Create pending request</button>
            </div>
          ) : null}
          {pending.length === 0 ? <p className="text-[color:var(--theme-text-secondary)]">No pending requests.</p> : pending.map((r) => (
            <div key={r.id} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.employee_name}</p>
                  <p className="font-medium capitalize">{r.request_type} • {new Date(r.starts_at).toLocaleString()} → {new Date(r.ends_at).toLocaleString()}</p>
                </div>
                <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-1 text-xs text-[color:var(--theme-text-secondary)]">{r.employee_role ?? "staff"}</span>
              </div>
              <p className="text-xs text-[color:var(--theme-text-secondary)]">{r.reason ?? "No note"}</p>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <span>{minsToHours(r.scheduled_minutes_affected)} scheduled hours affected</span>
                <span className={r.overlapping_approved_absences > 0 ? "text-[color:var(--theme-warning-text)]" : "text-[color:var(--theme-success-text)]"}>{r.overlapping_approved_absences} other approved absence{r.overlapping_approved_absences === 1 ? "" : "s"}</span>
                <span className={r.active_assigned_work_count > 0 ? "text-[color:var(--theme-warning-text)]" : "text-[color:var(--theme-success-text)]"}>{r.active_assigned_work_count} active assigned job{r.active_assigned_work_count === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy} onClick={() => void reviewRequest(r.id, "approved")} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-[color:var(--theme-success-text)]">Approve</button>
                <button type="button" disabled={busy} onClick={() => void reviewRequest(r.id, "declined")} className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-[color:var(--theme-danger-text)]">Decline</button>
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
                      <td className={s.recurring_template_rows === 0 ? "text-[color:var(--theme-warning-text)]" : ""}>{s.recurring_template_rows}</td>
                      <td>{s.override_count_in_range}</td>
                      <td>{s.approved_away_blocks_in_range}</td>
                      <td className={s.is_away_today ? "text-[color:var(--theme-warning-text)]" : "text-[color:var(--theme-success-text)]"}>{s.is_away_today ? "Away today" : "Available"}</td>
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
                <div className="text-xs text-[color:var(--theme-text-secondary)]">Related: <Link className="text-[color:var(--theme-accent-text)]" href="/dashboard/workforce/people">People</Link> · <Link className="text-[color:var(--theme-accent-text)]" href="/dashboard/workforce/payroll-review">Payroll</Link></div>
              </div>
            </div>
            {error ? <p className="px-4 pb-4 text-xs text-[color:var(--theme-danger-text)]">{error}</p> : null}
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}
