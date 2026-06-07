"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AdminBadge,
  AdminEmptyState,
  AdminPageHeader,
  AdminPageShell,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
  AdminToolbar,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type Period = {
  id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "open" | "approved" | "exported";
  approved_at: string | null;
  exported_at: string | null;
};

type Entry = {
  id: string;
  user_id: string;
  work_date: string;
  worked_minutes: number;
  regular_minutes: number;
  overtime_minutes: number;
  unpaid_break_minutes: number;
  job_minutes: number;
  has_exceptions: boolean;
  blocking_exception_count: number;
  warning_exception_count: number;
  scheduled_minutes?: number;
  approved_time_away_minutes_in_period?: number;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

type Exception = {
  id: string;
  user_id: string;
  work_date: string | null;
  severity: "warning" | "blocking";
  code: string;
  message: string;
  resolved: boolean;
};



type ExportBatch = {
  id: string;
  period_id: string;
  provider_type: string | null;
  status: string | null;
  handoff_status: string | null;
  row_count: number | null;
  exported_at: string | null;
  exported_by: string | null;
  file_size_bytes: number | null;
  file_sha256: string | null;
  provider_template_version: string | null;
  download_count: number | null;
  last_downloaded_at: string | null;
  created_at: string | null;
};
function fmtHours(minutes: number | null | undefined) {
  return ((minutes ?? 0) / 60).toFixed(2);
}

function fmtFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PayrollTimeClient() {

  const [periods, setPeriods] = useState<Period[]>([]);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportBatch[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [downloadingBatchId, setDownloadingBatchId] = useState<string | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [exceptionSeverityFilter, setExceptionSeverityFilter] = useState<"all" | "blocking" | "warning">("all");
  const searchParams = useSearchParams();
  const personIdFilter = searchParams.get("person_id")?.trim() || "";
  const severityParam = searchParams.get("severity");
  const workforceSeverity = severityParam === "blocking" || severityParam === "warning" ? severityParam : null;

  const activePeriod = useMemo(
    () => periods.find((p) => p.id === activePeriodId) ?? null,
    [periods, activePeriodId],
  );

  const summary = useMemo(() => {
    const employeeSet = new Set(entries.map((entry) => entry.user_id));
    const totalMinutes = entries.reduce((acc, entry) => acc + Number(entry.worked_minutes ?? 0), 0);
    const overtimeMinutes = entries.reduce((acc, entry) => acc + Number(entry.overtime_minutes ?? 0), 0);
    const blocking = exceptions.filter((item) => item.severity === "blocking" && !item.resolved).length;
    const warnings = exceptions.filter((item) => item.severity === "warning" && !item.resolved).length;
    return {
      employees: employeeSet.size,
      totalHours: fmtHours(totalMinutes),
      overtimeHours: fmtHours(overtimeMinutes),
      blocking,
      warnings,
    };
  }, [entries, exceptions]);

  const filteredEntries = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const base = personIdFilter ? entries.filter((entry) => entry.user_id === personIdFilter) : entries;
    if (!q) return base;
    return base.filter((entry) => {
      const person = `${entry.profiles?.full_name ?? ""} ${entry.profiles?.email ?? ""} ${entry.user_id}`.toLowerCase();
      return person.includes(q);
    });
  }, [employeeSearch, entries, personIdFilter]);

  const filteredExceptions = useMemo(() => {
    return exceptions.filter((item) => (exceptionSeverityFilter === "all" ? true : item.severity === exceptionSeverityFilter));
  }, [exceptionSeverityFilter, exceptions]);

  const load = useCallback(async (periodId?: string | null) => {
    setLoading(true);
    setError(null);
    const url = periodId ? `/api/payroll-time/periods?period_id=${periodId}` : "/api/payroll-time/periods";
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(body?.error ?? "Failed to load payroll time data");
      setLoading(false);
      return;
    }

    setPeriods((body?.periods ?? []) as Period[]);
    setActivePeriodId((body?.activePeriodId as string | null) ?? null);
    setEntries((body?.entries ?? []) as Entry[]);
    setExceptions((body?.exceptions ?? []) as Exception[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (workforceSeverity) setExceptionSeverityFilter(workforceSeverity);
  }, [workforceSeverity]);

  useEffect(() => {
    void loadExportHistory(activePeriodId);
  }, [activePeriodId]);

  async function runAction(path: string, actionName: string, payload: Record<string, unknown>) {
    setBusyAction(actionName);
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? `${actionName} failed`);
      setBusyAction(null);
      return null;
    }
    setBusyAction(null);
    return body;
  }

  async function handleRebuild() {
    if (!activePeriodId) return;
    const result = await runAction("/api/payroll-time/rebuild", "rebuild", { period_id: activePeriodId });
    if (result) await load(activePeriodId);
  }

  async function handleApprove() {
    if (!activePeriodId) return;
    const result = await runAction("/api/payroll-time/approve", "approve", { period_id: activePeriodId });
    if (result) await load(activePeriodId);
  }

  async function handleExport() {
    if (!activePeriodId) return;
    const result = await runAction("/api/payroll-time/export", "export", {
      period_id: activePeriodId,
      provider_type: "csv",
    });
    if (result?.csv) setCsvPreview(String(result.csv));
    await load(activePeriodId);
  }

  async function loadExportHistory(periodId?: string | null) {
    const targetPeriodId = periodId ?? activePeriodId;
    if (!targetPeriodId) {
      setExportHistory([]);
      return;
    }

    const res = await fetch(`/api/payroll-time/exports?period_id=${targetPeriodId}`, { cache: "no-store" });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setHistoryError(body?.error ?? "Failed to load export history");
      setExportHistory([]);
      return;
    }

    setHistoryError(null);
    setExportHistory((body?.batches ?? []) as ExportBatch[]);
  }

  async function handleDownload(batchId: string) {
    setDownloadingBatchId(batchId);
    setHistoryError(null);

    const res = await fetch(`/api/payroll-time/exports/${batchId}/download`, { cache: "no-store" });
    const body = await res.json().catch(() => null);

    if (!res.ok || !body?.signedUrl) {
      setHistoryError(body?.error ?? "Download unavailable. Please try again.");
      setDownloadingBatchId(null);
      return;
    }

    window.open(String(body.signedUrl), "_blank", "noopener,noreferrer");
    setDownloadingBatchId(null);
    await loadExportHistory(activePeriodId);
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Workforce Payroll-Ready Time"
        title="Payroll Time Tracking"
        subtitle="Attendance-first payroll-hour review and export readiness by pay period with exception triage, approval locking, and export snapshots."
      />
      {workforceSeverity ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs text-orange-200">
          <span>Filtered from Workforce Overview: {workforceSeverity === "blocking" ? "Blocking exceptions" : "Warning exceptions"}</span>
          <Link href="/dashboard/workforce/payroll-review" className="font-medium text-orange-300 hover:text-orange-200">Clear filter</Link>
        </div>
      ) : null}

      <AdminPanel>
        <AdminPanelTitle
          title="Current Period Signals"
          description="Trust posture before approval/export. Blocking exceptions should be cleared before lock."
        />
        <AdminStatGrid>
          <AdminStatCard label="Employees in period" value={summary.employees} />
          <AdminStatCard label="Worked hours" value={summary.totalHours} />
          <AdminStatCard label="Overtime-ready hours" value={summary.overtimeHours} />
          <AdminStatCard label="Blocking exceptions" value={summary.blocking} />
          <AdminStatCard label="Warnings" value={summary.warnings} />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Connected Workforce Context"
          description="Payroll review stays aligned with employee identity/workforce posture."
        />
        <div className="flex flex-wrap items-center gap-3 p-4 text-xs">
          <Link href="/dashboard/admin/employees" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-medium text-orange-300 hover:text-orange-200">
            Open People & Staff
          </Link>
          <Link href="/dashboard/admin/people" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-medium text-orange-300 hover:text-orange-200">
            Open People Directory
          </Link>
          <Link href="/dashboard/admin/scheduling" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-medium text-orange-300 hover:text-orange-200">
            Open Scheduling Board
          </Link>
          <span className="text-neutral-400">Use People for all person-level governance, certifications, profile setup, and workforce updates.</span>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Pay Period Review" description="Rebuild while open, approve to lock, then export to a payroll-provider-ready CSV snapshot." />
        <AdminToolbar>
          <select
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none md:w-80"
            value={activePeriodId ?? ""}
            onChange={(event) => void load(event.target.value)}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.period_start} → {period.period_end} ({period.status})
              </option>
            ))}
          </select>
          <button
            className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.12em] text-neutral-100 disabled:opacity-50"
            onClick={() => void handleRebuild()}
            disabled={!activePeriodId || busyAction !== null || activePeriod?.status === "approved" || activePeriod?.status === "exported"}
          >
            {busyAction === "rebuild" ? "Rebuilding…" : "Rebuild from source"}
          </button>
          <button
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs uppercase tracking-[0.12em] text-emerald-200 disabled:opacity-50"
            onClick={() => void handleApprove()}
            disabled={!activePeriodId || busyAction !== null || activePeriod?.status === "approved" || activePeriod?.status === "exported"}
          >
            {busyAction === "approve" ? "Approving…" : "Approve + lock"}
          </button>
          <button
            className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs uppercase tracking-[0.12em] text-sky-200 disabled:opacity-50"
            onClick={() => void handleExport()}
            disabled={!activePeriodId || busyAction !== null || activePeriod?.status !== "approved"}
          >
            {busyAction === "export" ? "Exporting…" : "Export CSV snapshot"}
          </button>
        </AdminToolbar>

        {activePeriod ? (
          <div className="px-4 pb-4 text-xs text-neutral-400">
            <span className="mr-2">Period status:</span>
            <AdminBadge>{activePeriod.status}</AdminBadge>
            {activePeriod.approved_at ? <span className="ml-3">Approved: {new Date(activePeriod.approved_at).toLocaleString()}</span> : null}
            {activePeriod.exported_at ? <span className="ml-3">Exported: {new Date(activePeriod.exported_at).toLocaleString()}</span> : null}
          </div>
        ) : null}

        {error ? <p className="px-4 pb-4 text-xs text-red-300">{error}</p> : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Employee Daily Payroll Entries"
          description="Attendance is payroll base truth; job time is supplemental visibility for productivity context."
        />
        <AdminToolbar>
          {personIdFilter ? <p className="text-xs text-orange-300">Filtered to person: {personIdFilter.slice(0, 8)}</p> : null}
          <input
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none md:w-96"
            placeholder="Filter entries by employee name, email, or id"
            value={employeeSearch}
            onChange={(event) => setEmployeeSearch(event.target.value)}
          />
        </AdminToolbar>
        {loading ? (
          <AdminEmptyState title="Loading payroll period" body="Collecting derived payroll-ready rows." />
        ) : filteredEntries.length === 0 ? (
          <AdminEmptyState title="No derived entries" body="Run rebuild to derive payroll-ready entries from attendance and job source layers." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Employee</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-right">Worked</th>
                  <th className="px-4 py-2.5 text-right">Regular</th>
                  <th className="px-4 py-2.5 text-right">OT-ready</th>
                  <th className="px-4 py-2.5 text-right">Unpaid break</th>
                  <th className="px-4 py-2.5 text-right">Job context</th>
                  <th className="px-4 py-2.5 text-right">Scheduled</th>
                  <th className="px-4 py-2.5 text-right">Approved away</th>
                  <th className="px-4 py-2.5 text-left">Exceptions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredEntries.map((entry) => (
                  <tr key={entry.id} className="text-neutral-200">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-neutral-100"><Link href={`/dashboard/admin/people/${entry.user_id}`} className="font-medium text-neutral-100 hover:text-orange-300">{entry.profiles?.full_name ?? entry.user_id}</Link></p>
                      <p className="text-xs text-neutral-500">{entry.profiles?.email ?? ""}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">{entry.work_date}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{fmtHours(entry.worked_minutes)}h</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{fmtHours(entry.regular_minutes)}h</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{fmtHours(entry.overtime_minutes)}h</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{fmtHours(entry.unpaid_break_minutes)}h</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{fmtHours(entry.job_minutes)}h</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{fmtHours(entry.scheduled_minutes ?? 0)}h</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{fmtHours(entry.approved_time_away_minutes_in_period ?? 0)}h</td>
                    <td className="px-4 py-2.5">
                      {entry.blocking_exception_count > 0 ? (
                        <AdminBadge>{entry.blocking_exception_count} blocking</AdminBadge>
                      ) : entry.warning_exception_count > 0 ? (
                        <AdminBadge>{entry.warning_exception_count} warning</AdminBadge>
                      ) : (
                        <span className="text-xs text-neutral-500">Clean</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Exception Queue" description="Exceptions keep traceability; unresolved blocking exceptions prevent period approval." />
        <AdminToolbar>
          <select
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none md:w-64"
            value={exceptionSeverityFilter}
            onChange={(event) => setExceptionSeverityFilter(event.target.value as "all" | "blocking" | "warning")}
          >
            <option value="all">All severities</option>
            <option value="blocking">Blocking only</option>
            <option value="warning">Warnings only</option>
          </select>
        </AdminToolbar>
        {filteredExceptions.length === 0 ? (
          <AdminEmptyState title="No exceptions" body="No flagged anomalies in this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Severity</th>
                  <th className="px-4 py-2.5 text-left">Code</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Message</th>
                  <th className="px-4 py-2.5 text-left">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredExceptions.map((item) => (
                  <tr key={item.id} className="text-neutral-200">
                    <td className="px-4 py-2.5">
                      <AdminBadge>{item.severity}</AdminBadge>
                    </td>
                    <td className="px-4 py-2.5">{item.code}</td>
                    <td className="px-4 py-2.5">{item.work_date ?? "—"}</td>
                    <td className="px-4 py-2.5">{item.message}</td>
                    <td className="px-4 py-2.5">{item.resolved ? "resolved" : "open"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>


      <AdminPanel>
        <AdminPanelTitle title="Export History" description="Read-only export snapshots for this payroll period with secure download links." />
        {historyError ? <p className="px-4 pb-4 text-xs text-amber-300">{historyError}</p> : null}
        {exportHistory.length === 0 ? (
          <AdminEmptyState title="No export batches yet" body="Run an export to create a period snapshot artifact." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Provider / Template</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Rows</th>
                  <th className="px-4 py-2.5 text-left">Exported</th>
                  <th className="px-4 py-2.5 text-left">File size</th>
                  <th className="px-4 py-2.5 text-right">Downloads</th>
                  <th className="px-4 py-2.5 text-left">Checksum</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {exportHistory.map((batch) => (
                  <tr key={batch.id} className="text-neutral-200">
                    <td className="px-4 py-2.5">{batch.provider_type ?? "csv"} / {batch.provider_template_version ?? "—"}</td>
                    <td className="px-4 py-2.5">{batch.status ?? "—"} / {batch.handoff_status ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">{batch.row_count ?? 0}</td>
                    <td className="px-4 py-2.5">{batch.exported_at ? new Date(batch.exported_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2.5">{fmtFileSize(batch.file_size_bytes)}</td>
                    <td className="px-4 py-2.5 text-right">{batch.download_count ?? 0}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{batch.file_sha256 ? `${batch.file_sha256.slice(0, 12)}…` : "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-sky-200 disabled:opacity-50"
                        onClick={() => void handleDownload(batch.id)}
                        disabled={downloadingBatchId !== null}
                      >
                        {downloadingBatchId === batch.id ? "Preparing…" : "Download"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      {csvPreview ? (
        <AdminPanel>
          <AdminPanelTitle title="Latest CSV Snapshot" description="Export foundation artifact (provider adapter-compatible row shape)." />
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-neutral-300">{csvPreview}</pre>
        </AdminPanel>
      ) : null}
    </AdminPageShell>
  );
}
