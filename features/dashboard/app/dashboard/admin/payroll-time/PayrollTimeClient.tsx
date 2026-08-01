"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import OwnerPinModal from "@shared/components/OwnerPinModal";
import { DEFAULT_BIWEEKLY_ANCHOR_DATE } from "@/features/payroll-time/lib/payPeriodBounds";
import {
  AdminBadge,
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
  AdminToolbar,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";
import { FlatRateCreditReview } from "@/features/workforce/components/FlatRateCreditReview";

type Period = {
  id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "open" | "approved" | "exported";
  approved_at: string | null;
  exported_at: string | null;
};

type PayrollSettings = {
  cadence: "weekly" | "biweekly" | "semimonthly" | "monthly";
  week_starts_on: number;
  period_anchor_date: string | null;
};

type Entry = {
  id: string;
  user_id: string;
  work_date: string;
  worked_minutes: number;
  regular_minutes: number;
  overtime_minutes: number;
  unpaid_break_minutes: number;
  paid_break_minutes: number;
  attendance_minutes: number;
  job_minutes: number;
  flagged_minutes: number;
  source_snapshot?: {
    shifts?: Array<{ start_time?: string | null; end_time?: string | null }>;
    punch_events?: Array<{
      event_type?: string | null;
      timestamp?: string | null;
    }>;
    punch_event_count?: number;
  } | null;
  roster_only?: boolean;
  payroll_ready?: boolean;
  payroll_status_label?: string;
  has_exceptions: boolean;
  blocking_exception_count: number;
  warning_exception_count: number;
  scheduled_minutes?: number;
  approved_time_away_minutes?: number;
  profiles?: {
    full_name?: string | null;
    username?: string | null;
    email?: string | null;
  } | null;
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
  exported_by_name: string | null;
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

function timeEvidence(
  entry: Entry,
  timezone: string,
): { range: string; detail: string; punchTimeline: string | null } {
  const shifts = (entry.source_snapshot?.shifts ?? [])
    .filter((shift) => shift.start_time)
    .sort(
      (a, b) =>
        new Date(a.start_time ?? 0).getTime() -
        new Date(b.start_time ?? 0).getTime(),
    );
  if (shifts.length === 0) {
    return {
      range: entry.roster_only ? "No punches recorded" : "Time evidence unavailable",
      detail: "0 shifts · 0 punches",
      punchTimeline: null,
    };
  }
  const first = shifts[0];
  const last = shifts[shifts.length - 1];
  const format = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          timeZone: timezone,
        })
      : "In progress";
  const eventLabel = (value: string | null | undefined) => {
    if (value === "start_shift") return "Clock in";
    if (value === "end_shift") return "Clock out";
    if (value === "break_start") return "Break start";
    if (value === "break_end") return "Break end";
    if (value === "lunch_start") return "Lunch start";
    if (value === "lunch_end") return "Lunch end";
    return String(value ?? "Punch").replaceAll("_", " ");
  };
  const punches = (entry.source_snapshot?.punch_events ?? [])
    .filter((event) => event.timestamp)
    .sort(
      (a, b) =>
        new Date(a.timestamp ?? 0).getTime() -
        new Date(b.timestamp ?? 0).getTime(),
    );
  return {
    range: `${format(first.start_time)} → ${format(last.end_time)}`,
    detail: `${shifts.length} ${shifts.length === 1 ? "shift" : "shifts"} · ${Number(entry.source_snapshot?.punch_event_count ?? 0)} punches`,
    punchTimeline:
      punches.length > 0
        ? punches
            .map(
              (event) =>
                `${eventLabel(event.event_type)} ${format(event.timestamp)}`,
            )
            .join(" · ")
        : null,
  };
}

function fmtFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function PayrollTimeClient({
  canAccessPeople,
}: {
  canAccessPeople: boolean;
}) {

  const router = useRouter();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings | null>(null);
  const [canConfigurePeriods, setCanConfigurePeriods] = useState(false);
  const [settingsForm, setSettingsForm] = useState<PayrollSettings>({
    cadence: "biweekly",
    week_starts_on: 1,
    period_anchor_date: DEFAULT_BIWEEKLY_ANCHOR_DATE,
  });
  const [shopId, setShopId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportBatch[]>([]);
  const [zeroState, setZeroState] = useState<{ trueZero?: boolean; message?: string | null } | null>(null);
  const [rosterSummary, setRosterSummary] = useState({
    activeWorkforce: 0,
    payrollEligible: 0,
    payrollSetupIncomplete: 0,
    recordedEmployees: 0,
  });
  const [refreshState, setRefreshState] = useState<{ reason?: string; refreshError?: string | null; hasSourceTime?: boolean } | null>(null);
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
    const employeeSet = new Set(
      entries
        .filter(
          (entry) =>
            !entry.roster_only &&
            (Number(entry.worked_minutes ?? 0) > 0 ||
              Number(entry.attendance_minutes ?? 0) > 0 ||
              Number(entry.job_minutes ?? 0) > 0),
        )
        .map((entry) => entry.user_id),
    );
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
      const person =
        `${entry.profiles?.full_name ?? ""} ${entry.profiles?.username ?? ""} ${entry.profiles?.email ?? ""}`.toLowerCase();
      return person.includes(q);
    });
  }, [employeeSearch, entries, personIdFilter]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { userId: string; name: string; email: string; rows: Entry[] }>();
    for (const entry of filteredEntries) {
      const group = groups.get(entry.user_id) ?? {
        userId: entry.user_id,
        name:
          entry.profiles?.full_name?.trim() ||
          entry.profiles?.username?.trim() ||
          entry.profiles?.email?.trim() ||
          "Employee profile unavailable",
        email: entry.profiles?.email ?? "",
        rows: [],
      };
      group.rows.push(entry);
      groups.set(entry.user_id, group);
    }
    return [...groups.values()]
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) => a.work_date.localeCompare(b.work_date)),
        worked: group.rows.reduce((sum, row) => sum + Number(row.worked_minutes ?? 0), 0),
        regular: group.rows.reduce((sum, row) => sum + Number(row.regular_minutes ?? 0), 0),
        overtime: group.rows.reduce((sum, row) => sum + Number(row.overtime_minutes ?? 0), 0),
        job: group.rows.reduce((sum, row) => sum + Number(row.job_minutes ?? 0), 0),
        flagged: group.rows.reduce((sum, row) => sum + Number(row.flagged_minutes ?? 0), 0),
        blocking: group.rows.reduce((sum, row) => sum + Number(row.blocking_exception_count ?? 0), 0),
        warnings: group.rows.reduce((sum, row) => sum + Number(row.warning_exception_count ?? 0), 0),
        rosterOnly: group.rows.every((row) => row.roster_only),
        payrollReady: group.rows.every((row) => row.payroll_ready !== false),
        statusLabel: group.rows[0]?.payroll_status_label ?? "Ready",
      }))
      .sort((a, b) => b.blocking - a.blocking || b.warnings - a.warnings || a.name.localeCompare(b.name));
  }, [filteredEntries]);

  const employeeOptions = useMemo(() => {
    const byUser = new Map<
      string,
      { id: string; name: string; email: string }
    >();
    for (const entry of entries) {
      if (byUser.has(entry.user_id)) continue;
      byUser.set(entry.user_id, {
        id: entry.user_id,
        name:
          entry.profiles?.full_name?.trim() ||
          entry.profiles?.username?.trim() ||
          entry.profiles?.email?.trim() ||
          "Employee profile unavailable",
        email: entry.profiles?.email?.trim() || "",
      });
    }
    return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const selectedPerson = employeeOptions.find(
    (employee) => employee.id === personIdFilter,
  );
  const employeeNameById = useMemo(
    () =>
      new Map(
        employeeOptions.map((employee) => [employee.id, employee.name]),
      ),
    [employeeOptions],
  );

  const filteredExceptions = useMemo(() => {
    return exceptions.filter(
      (item) =>
        (!personIdFilter || item.user_id === personIdFilter) &&
        (exceptionSeverityFilter === "all" ||
          item.severity === exceptionSeverityFilter),
    );
  }, [exceptionSeverityFilter, exceptions, personIdFilter]);

  const load = useCallback(async (periodId?: string | null) => {
    setLoading(true);
    setLoadError(null);
    setError(null);
    try {
      const url = periodId ? `/api/payroll-time/periods?period_id=${periodId}` : "/api/payroll-time/periods";
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setPeriods([]);
        setActivePeriodId(null);
        setEntries([]);
        setExceptions([]);
        setCanConfigurePeriods(false);
        setLoadError(
          body?.error ??
            "Payroll is temporarily unavailable. Recorded punches are safe; retry the payroll load.",
        );
        return;
      }

      const nextSettings = (body?.settings ?? null) as PayrollSettings | null;
      setShopId(typeof body?.shopId === "string" ? body.shopId : null);
      setTimezone(
        typeof body?.timezone === "string" && body.timezone
          ? body.timezone
          : "UTC",
      );
      setPayrollSettings(nextSettings);
      setCanConfigurePeriods(Boolean(body?.canConfigure));
      if (nextSettings) {
        setSettingsForm({
          cadence: nextSettings.cadence,
          week_starts_on: Number(nextSettings.week_starts_on ?? 1),
          period_anchor_date:
            nextSettings.period_anchor_date ?? DEFAULT_BIWEEKLY_ANCHOR_DATE,
        });
      }
      setPeriods((body?.periods ?? []) as Period[]);
      setActivePeriodId((body?.activePeriodId as string | null) ?? null);
      setEntries((body?.entries ?? []) as Entry[]);
      setExceptions((body?.exceptions ?? []) as Exception[]);
      setZeroState(body?.zeroState ?? null);
      setRosterSummary({
        activeWorkforce: Number(body?.rosterSummary?.activeWorkforce ?? 0),
        payrollEligible: Number(body?.rosterSummary?.payrollEligible ?? 0),
        payrollSetupIncomplete: Number(
          body?.rosterSummary?.payrollSetupIncomplete ?? 0,
        ),
        recordedEmployees: Number(body?.rosterSummary?.recordedEmployees ?? 0),
      });
      setRefreshState(body?.refresh ?? null);
    } catch {
      setPeriods([]);
      setActivePeriodId(null);
      setEntries([]);
      setExceptions([]);
      setCanConfigurePeriods(false);
      setLoadError(
        "Payroll is temporarily unavailable. Recorded punches are safe; retry the payroll load.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExportHistory = useCallback(async (periodId?: string | null) => {
    if (!periodId) {
      setExportHistory([]);
      return;
    }

    const res = await fetch(`/api/payroll-time/exports?period_id=${periodId}`, {
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setHistoryError(body?.error ?? "Failed to load export history");
      setExportHistory([]);
      return;
    }

    setHistoryError(null);
    setExportHistory((body?.batches ?? []) as ExportBatch[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (workforceSeverity) setExceptionSeverityFilter(workforceSeverity);
  }, [workforceSeverity]);

  useEffect(() => {
    void loadExportHistory(activePeriodId);
  }, [activePeriodId, loadExportHistory]);

  useEffect(() => {
    const refresh = () => void load(activePeriodId);
    window.addEventListener("workforce:shift-state", refresh);
    return () =>
      window.removeEventListener("workforce:shift-state", refresh);
  }, [activePeriodId, load]);

  async function runAction(path: string, actionName: string, payload: unknown, method: "POST" | "PUT" = "POST") {
    setBusyAction(actionName);
    setError(null);
    const res = await fetch(path, {
      method,
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

  async function handleSavePeriodSettings() {
    setBusyAction("settings");
    setError(null);
    setNotice(null);
    const response = await fetch("/api/payroll-time/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settingsForm),
    });
    const body = await response.json().catch(() => null);
    setBusyAction(null);
    if (!response.ok) {
      if (
        response.status === 401 &&
        String(body?.error ?? "").toLowerCase().includes("pin")
      ) {
        setPinModalOpen(true);
        return;
      }
      setError(body?.error ?? "Unable to save pay-period settings.");
      return;
    }
    await load(body?.currentPeriod?.id ?? null);
    setNotice(
      body?.warning ?? "Pay-period settings saved and the current period refreshed.",
    );
  }

  function updateEmployeeFilter(nextPersonId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPersonId) params.set("person_id", nextPersonId);
    else params.delete("person_id");
    router.replace(
      `/dashboard/workforce/payroll-review${params.size ? `?${params.toString()}` : ""}`,
    );
  }

  async function handleRebuild() {
    if (!activePeriodId) return;
    const result = await runAction("/api/payroll-time/rebuild", "rebuild", { period_id: activePeriodId });
    if (result) await load(activePeriodId);
  }

  async function handleApprove() {
    if (!activePeriodId) return;
    const confirmed = window.confirm(`Approve Payroll?\n\nEmployees: ${summary.employees}\nPayroll hours: ${summary.totalHours}\nOvertime hours: ${summary.overtimeHours}\nUnresolved blocking issues: ${summary.blocking}\nAdvisory warnings: ${summary.warnings}\n\nAdvisory warnings can be acknowledged without changing valid hours. Only blocking integrity issues prevent approval.`);
    if (!confirmed) return;
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

  if (loading && periods.length === 0) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          eyebrow="Pay-period review"
          title="Payroll Review"
          subtitle="Review attendance, job time, flat-rate credit, exceptions, approvals, and export readiness."
        />
        <AdminPanel>
          <AdminEmptyState
            title="Loading payroll from recorded time"
            body="Connecting shift punches, job punches, and pay-period settings."
          />
        </AdminPanel>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          eyebrow="Pay-period review"
          title="Payroll Review"
          subtitle="Review attendance, job time, flat-rate credit, exceptions, approvals, and export readiness."
        />
        <AdminPanel>
          <AdminPanelTitle
            title="Payroll is unavailable"
            description="This is a payroll assembly failure, not a zero-time result. Recorded shift and job punches have not been removed."
          />
          <div className="space-y-3 p-4">
            <p className="text-sm text-[color:var(--theme-danger-text)]">
              {loadError}
            </p>
            <button
              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-primary)]"
              onClick={() => void load()}
            >
              Retry payroll load
            </button>
          </div>
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="Pay-period review"
        title="Payroll Review"
        subtitle="Review attendance, job time, flat-rate credit, exceptions, approvals, and export readiness."
      />
      {workforceSeverity ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs text-[color:var(--theme-accent-text)]">
          <span>Filtered from Workforce Overview: {workforceSeverity === "blocking" ? "Blocking exceptions" : "Warning exceptions"}</span>
          <Link href="/dashboard/workforce/payroll-review" className="font-medium text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]">Clear filter</Link>
        </div>
      ) : null}

      <AdminPanel>
        <AdminPanelTitle
          title="Current-period summary"
          description="Recorded attendance is refreshed automatically for open periods. Overtime and warnings are advisory unless a blocking integrity issue remains."
        />
        <AdminStatGrid>
          <AdminStatCard label="Payroll eligible" value={rosterSummary.payrollEligible} hint={`${rosterSummary.activeWorkforce} active workforce`} />
          <AdminStatCard label="Recorded employees" value={rosterSummary.recordedEmployees} hint="Has attendance or job time" />
          <AdminStatCard label="Payroll hours" value={summary.totalHours} />
          <AdminStatCard label="Regular hours" value={fmtHours(entries.reduce((acc, entry) => acc + Number(entry.regular_minutes ?? 0), 0))} />
          <AdminStatCard label="Overtime" value={summary.overtimeHours} />
          <AdminStatCard label="Needs review" value={summary.blocking + summary.warnings} />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Payroll Assistant"
          description="Deterministic review aid only. It cannot change payroll records, approval state, or blocking status."
        />
        <div className="space-y-2 p-4 text-sm text-[color:var(--theme-text-primary)]">
          {summary.blocking > 0 ? <p>{summary.blocking} blocking integrity issue{summary.blocking === 1 ? "" : "s"} must be resolved before payroll can be finalized.</p> : null}
          {Number(summary.overtimeHours) > 0 ? <p>{entries.filter((entry) => entry.overtime_minutes > 0).length} employee day{entries.filter((entry) => entry.overtime_minutes > 0).length === 1 ? "" : "s"} recorded overtime this period.</p> : null}
          {summary.warnings > 0 ? <p>{summary.warnings} advisory warning{summary.warnings === 1 ? "" : "s"} may need owner review, but do not remove recorded payable hours.</p> : null}
          {rosterSummary.payrollEligible === 0 ? (
            <p>
              No active people are included in payroll.{" "}
              {canAccessPeople ? (
                <Link href="/dashboard/workforce/people?filter=payroll" className="font-medium text-[color:var(--theme-accent-text)]">
                  Review payroll readiness in People →
                </Link>
              ) : (
                "An owner or admin must complete payroll readiness."
              )}
            </p>
          ) : summary.blocking === 0 && summary.warnings === 0 ? <p>Payroll totals are ready for review.</p> : null}
          {rosterSummary.payrollSetupIncomplete > 0 ? <p>{rosterSummary.payrollSetupIncomplete} active person{rosterSummary.payrollSetupIncomplete === 1 ? " needs" : " need"} payroll setup. Their recorded time remains visible, but payroll cannot be approved until readiness is complete.</p> : null}
          <p className="text-xs text-[color:var(--theme-text-muted)]">Overtime, long shifts, missing lunch, and job-time ratio flags are advisory. Valid recorded attendance remains visible and payable for owner/admin decisions.</p>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Pay period settings"
          description="Choose how payroll periods are generated. Approved and exported periods remain locked historical snapshots."
        />
        <AdminToolbar>
          <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Frequency
            <select
              className="min-w-52 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
              value={settingsForm.cadence}
              disabled={!canConfigurePeriods || busyAction !== null}
              onChange={(event) => setSettingsForm((current) => ({ ...current, cadence: event.target.value as PayrollSettings["cadence"] }))}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="semimonthly">Semi-monthly (1–15 / 16–end)</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {settingsForm.cadence === "weekly" ? (
            <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
              Week starts
              <select
                className="min-w-44 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
                value={settingsForm.week_starts_on}
                disabled={!canConfigurePeriods || busyAction !== null}
                onChange={(event) => setSettingsForm((current) => ({ ...current, week_starts_on: Number(event.target.value) }))}
              >
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
          ) : null}
          {settingsForm.cadence === "biweekly" ? (
            <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
              Anchor period starts
              <input
                type="date"
                className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
                value={settingsForm.period_anchor_date ?? ""}
                disabled={!canConfigurePeriods || busyAction !== null}
                onChange={(event) => setSettingsForm((current) => ({ ...current, period_anchor_date: event.target.value }))}
              />
            </label>
          ) : null}
          <button
            className="self-end rounded-lg border border-orange-400/40 bg-orange-500/10 px-3 py-2 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-accent-text)] disabled:opacity-50"
            disabled={!canConfigurePeriods || busyAction !== null}
            onClick={() => void handleSavePeriodSettings()}
          >
            {busyAction === "settings" ? "Saving…" : "Save period settings"}
          </button>
        </AdminToolbar>
        <p className="px-4 pb-4 text-xs text-[color:var(--theme-text-muted)]">
          {canConfigurePeriods
            ? `Current rule: ${payrollSettings?.cadence ?? "not configured"}${payrollSettings?.cadence === "biweekly" ? ` anchored to ${payrollSettings.period_anchor_date ?? DEFAULT_BIWEEKLY_ANCHOR_DATE}` : ""}. Changing it selects the matching current period without rewriting approved history.`
            : "Only an owner or admin can change the pay-period rule."}
        </p>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Pay Period Review" description="Open periods refresh from time records automatically. Approved, locked, and exported periods show their durable snapshot." />
        <AdminToolbar>
          <select
            className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none md:w-80"
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
            className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-primary)] disabled:opacity-50"
            onClick={() => void handleRebuild()}
            disabled={!activePeriodId || busyAction !== null || activePeriod?.status === "approved" || activePeriod?.status === "exported"}
          >
            {busyAction === "rebuild" ? "Recalculating…" : "Recalculate"}
          </button>
          <button
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-success-text)] disabled:opacity-50"
            onClick={() => void handleApprove()}
            disabled={!activePeriodId || summary.employees === 0 || busyAction !== null || summary.blocking > 0 || Boolean(refreshState?.refreshError) || activePeriod?.status === "approved" || activePeriod?.status === "exported"}
          >
            {busyAction === "approve" ? "Approving…" : "Approve Payroll"}
          </button>
          <button
            className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-info-text)] disabled:opacity-50"
            onClick={() => void handleExport()}
            disabled={!activePeriodId || busyAction !== null || activePeriod?.status !== "approved"}
          >
            {busyAction === "export" ? "Exporting…" : "Export Payroll"}
          </button>
        </AdminToolbar>

        {activePeriod ? (
          <div className="space-y-3 px-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <AdminStatCard label="Selected period" value={`${activePeriod.period_start} → ${activePeriod.period_end}`} />
              <AdminStatCard label="Status" value={activePeriod.status} />
              <AdminStatCard label="Recorded employees" value={summary.employees} />
              <AdminStatCard label="Payroll hours" value={summary.totalHours} />
              <AdminStatCard label="Open issues" value={summary.blocking + summary.warnings} />
            </div>
            <div className="text-xs text-[color:var(--theme-text-secondary)]">
              {activePeriod.approved_at ? <span className="mr-3">Approved: {new Date(activePeriod.approved_at).toLocaleString([], { timeZone: timezone })}</span> : null}
              {activePeriod.exported_at ? <span>Exported: {new Date(activePeriod.exported_at).toLocaleString([], { timeZone: timezone })}</span> : null}
              {!activePeriod.approved_at && summary.employees === 0 ? <span>No employee time is recorded, so this period cannot be approved.</span> : null}
            </div>
          </div>
        ) : null}

        {error ? <p className="px-4 pb-4 text-xs text-[color:var(--theme-danger-text)]">{error}</p> : null}
        {notice ? (
          <p className="px-4 pb-4 text-xs text-[color:var(--theme-success-text)]">
            {notice}
          </p>
        ) : null}
        {refreshState?.refreshError ? (
          <div className="mx-4 mb-4 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-[color:var(--theme-danger-text)]">
            <p>Time records exist, but payroll totals could not be refreshed.</p>
            <button className="mt-2 rounded-lg border border-red-300/40 px-3 py-1 text-xs" onClick={() => void handleRebuild()}>Retry refresh</button>
          </div>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Employee hours"
          description="Attendance determines payroll hours; productive job time is shown separately from other paid shop time."
        />
        <AdminToolbar>
          <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Employee
            <select
              className="min-w-64 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
              value={selectedPerson?.id ?? ""}
              onChange={(event) => updateEmployeeFilter(event.target.value)}
            >
              <option value="">All active employees</option>
              {employeeOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}{employee.email && employee.email !== employee.name ? ` — ${employee.email}` : ""}
                </option>
              ))}
            </select>
          </label>
          {personIdFilter && !selectedPerson ? (
            <p className="text-xs text-[color:var(--theme-warning-text)]">
              The selected employee is unavailable. Choose another employee or show all.
            </p>
          ) : selectedPerson ? (
            <p className="text-xs text-[color:var(--theme-accent-text)]">
              Showing {selectedPerson.name}
            </p>
          ) : null}
          <input
            className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none md:w-96"
            placeholder="Search employee name or email"
            value={employeeSearch}
            onChange={(event) => setEmployeeSearch(event.target.value)}
          />
        </AdminToolbar>
        {loading ? (
          <AdminEmptyState title="Loading payroll period" body="Refreshing employee time records." />
        ) : filteredEntries.length === 0 ? (
          <AdminEmptyState
            title={zeroState?.message ?? "No employee time has been recorded for this pay period."}
            body={rosterSummary.payrollEligible === 0
              ? canAccessPeople
                ? "Open People and mark each employee who belongs in payroll as payroll-ready."
                : "An owner or admin must mark the appropriate employees as payroll-ready."
              : activePeriod
                ? `${activePeriod.period_start} → ${activePeriod.period_end}. Attendance—not the schedule template—creates payable hours.`
                : "Open Attendance to review recorded employee time."}
          />
        ) : (
          <div className="space-y-3 p-4">
            {groupedEntries.map((group) => (
              <details
                key={group.userId}
                className="group rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
                open={group.blocking > 0}
              >
                <summary className="cursor-pointer list-none p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(180px,2fr)_repeat(6,minmax(72px,1fr))] md:items-center">
                    <div>
                      {canAccessPeople ? (
                        <Link href={`/dashboard/workforce/people/${group.userId}`} className="font-semibold text-[color:var(--theme-text-primary)] hover:text-[color:var(--theme-accent-text)]">
                          {group.name}
                        </Link>
                      ) : (
                        <p className="font-semibold text-[color:var(--theme-text-primary)]">
                          {group.name}
                        </p>
                      )}
                      <p className="text-xs text-[color:var(--theme-text-muted)]">{group.email || `${group.rows.length} recorded day${group.rows.length === 1 ? "" : "s"}`}</p>
                    </div>
                    <div><p className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">Payroll</p><p className="font-semibold">{fmtHours(group.worked)}h</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">Regular</p><p className="font-semibold">{fmtHours(group.regular)}h</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">Overtime</p><p className="font-semibold">{fmtHours(group.overtime)}h</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">Job time</p><p className="font-semibold">{fmtHours(group.job)}h</p></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)]">Flagged</p><p className="font-semibold">{fmtHours(group.flagged)}h</p></div>
                    <div>
                      {group.blocking > 0 ? (
                        <AdminBadge>{group.blocking} blocking</AdminBadge>
                      ) : group.warnings > 0 ? (
                        <AdminBadge>{group.warnings} review</AdminBadge>
                      ) : group.rosterOnly || !group.payrollReady ? (
                        <AdminBadge>{group.statusLabel}</AdminBadge>
                      ) : (
                        <span className="text-xs font-medium text-[color:var(--theme-success-text)]">Ready</span>
                      )}
                    </div>
                  </div>
                </summary>
                <div className="border-t border-[color:var(--theme-border-soft)] p-3">
                  <div className="hidden grid-cols-[minmax(120px,1.5fr)_repeat(6,minmax(64px,1fr))_minmax(92px,1fr)] gap-2 px-3 pb-2 text-[10px] uppercase tracking-wide text-[color:var(--theme-text-muted)] md:grid">
                    <span>Date / clock</span><span>Payroll</span><span>Regular</span><span>OT</span><span>Job</span><span>Flagged</span><span>Other paid</span><span>Status</span>
                  </div>
                  <div className="space-y-2">
                    {group.rows.map((entry) => {
                      const evidence = timeEvidence(entry, timezone);
                      return (
                      <div key={entry.id} className="grid gap-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm md:grid-cols-[minmax(120px,1.5fr)_repeat(6,minmax(64px,1fr))_minmax(92px,1fr)] md:items-center">
                        <div>
                          <p className="font-medium">{entry.work_date}</p>
                          <p className="text-xs text-[color:var(--theme-text-muted)]">{evidence.range}</p>
                          <p className="text-[10px] text-[color:var(--theme-text-muted)]">{evidence.detail}</p>
                          {evidence.punchTimeline ? (
                            <p className="mt-1 text-[10px] leading-relaxed text-[color:var(--theme-text-secondary)]">
                              {evidence.punchTimeline}
                            </p>
                          ) : null}
                          {Number(entry.scheduled_minutes ?? 0) > 0 ||
                          Number(entry.approved_time_away_minutes ?? 0) > 0 ? (
                            <p className="mt-1 text-[10px] text-[color:var(--theme-text-muted)]">
                              Scheduled {fmtHours(entry.scheduled_minutes)}h
                              {Number(entry.approved_time_away_minutes ?? 0) > 0
                                ? ` · Approved away ${fmtHours(entry.approved_time_away_minutes)}h`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                        <p><span className="md:hidden text-[color:var(--theme-text-muted)]">Payroll: </span>{fmtHours(entry.worked_minutes)}h</p>
                        <p><span className="md:hidden text-[color:var(--theme-text-muted)]">Regular: </span>{fmtHours(entry.regular_minutes)}h</p>
                        <p><span className="md:hidden text-[color:var(--theme-text-muted)]">OT: </span>{fmtHours(entry.overtime_minutes)}h</p>
                        <p><span className="md:hidden text-[color:var(--theme-text-muted)]">Job: </span>{fmtHours(entry.job_minutes)}h</p>
                        <p><span className="md:hidden text-[color:var(--theme-text-muted)]">Flagged: </span>{fmtHours(entry.flagged_minutes)}h</p>
                        <p><span className="md:hidden text-[color:var(--theme-text-muted)]">Other: </span>{fmtHours(Math.max(0, Number(entry.worked_minutes ?? 0) - Number(entry.job_minutes ?? 0)))}h</p>
                        <div>
                          {entry.blocking_exception_count > 0 ? <AdminBadge>Blocked</AdminBadge> : entry.warning_exception_count > 0 ? <AdminBadge>Review</AdminBadge> : <span className="text-xs text-[color:var(--theme-success-text)]">{entry.payroll_status_label ?? "Ready"}</span>}
                          <Link className="mt-1 block text-xs font-medium text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]" href={`/dashboard/workforce/attendance?person_id=${entry.user_id}&date=${entry.work_date}`}>View timecard</Link>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </AdminPanel>

      {activePeriod ? (
        <FlatRateCreditReview
          periodStart={activePeriod.period_start}
          periodEnd={activePeriod.period_end}
          locked={["approved", "exported"].includes(activePeriod.status)}
          onSaved={() => void load(activePeriod.id)}
        />
      ) : null}

      <details className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">Advanced: exceptions, exports, source details</summary>
      <AdminPanel>
        <AdminPanelTitle title="Exceptions" description="Only unresolved blocking integrity exceptions prevent final approval. Advisory warnings can be acknowledged by owner/admin decision." />
        <AdminToolbar>
          <select
            className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none md:w-64"
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
              <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Severity</th>
                  <th className="px-4 py-2.5 text-left">Employee</th>
                  <th className="px-4 py-2.5 text-left">Code</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-left">Message</th>
                  <th className="px-4 py-2.5 text-left">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {filteredExceptions.map((item) => (
                  <tr key={item.id} className="text-[color:var(--theme-text-primary)]">
                    <td className="px-4 py-2.5">
                      <AdminBadge>{item.severity}</AdminBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      {employeeNameById.get(item.user_id) ??
                        "Employee profile unavailable"}
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
        {historyError ? <p className="px-4 pb-4 text-xs text-[color:var(--theme-warning-text)]">{historyError}</p> : null}
        {exportHistory.length === 0 ? (
          <AdminEmptyState title="No export batches yet" body="Run an export to create a period snapshot artifact." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Provider / Template</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Rows</th>
                  <th className="px-4 py-2.5 text-left">Exported</th>
                  <th className="px-4 py-2.5 text-left">Exported by</th>
                  <th className="px-4 py-2.5 text-left">File size</th>
                  <th className="px-4 py-2.5 text-right">Downloads</th>
                  <th className="px-4 py-2.5 text-left">Checksum</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {exportHistory.map((batch) => (
                  <tr key={batch.id} className="text-[color:var(--theme-text-primary)]">
                    <td className="px-4 py-2.5">{batch.provider_type ?? "csv"} / {batch.provider_template_version ?? "—"}</td>
                    <td className="px-4 py-2.5">{batch.status ?? "—"} / {batch.handoff_status ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">{batch.row_count ?? 0}</td>
                    <td className="px-4 py-2.5">{batch.exported_at ? new Date(batch.exported_at).toLocaleString([], { timeZone: timezone }) : "—"}</td>
                    <td className="px-4 py-2.5">{batch.exported_by_name ?? "—"}</td>
                    <td className="px-4 py-2.5">{fmtFileSize(batch.file_size_bytes)}</td>
                    <td className="px-4 py-2.5 text-right">{batch.download_count ?? 0}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[color:var(--theme-text-secondary)]">{batch.file_sha256 ? `${batch.file_sha256.slice(0, 12)}…` : "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs uppercase tracking-[0.12em] text-[color:var(--theme-info-text)] disabled:opacity-50"
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
      </details>

      {csvPreview ? (
        <AdminPanel>
          <AdminPanelTitle title="Latest CSV Snapshot" description="Export foundation artifact (provider adapter-compatible row shape)." />
          <pre className="overflow-x-auto rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-xs text-[color:var(--theme-text-secondary)]">{csvPreview}</pre>
        </AdminPanel>
      ) : null}
      <OwnerPinModal
        shopId={shopId}
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onVerified={() => {
          setPinModalOpen(false);
          void handleSavePeriodSettings();
        }}
      />
    </div>
  );
}
