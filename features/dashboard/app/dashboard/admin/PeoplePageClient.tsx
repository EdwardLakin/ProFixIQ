"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AdminBadge,
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
  AdminToolbar,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type PersonRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  completed_onboarding: boolean;
  last_active_at: string | null;
  workforce_role: string | null;
  employment_status: "active" | "inactive" | "on_leave" | null;
  payroll_ready: boolean;
  payroll_blocking_exceptions: number;
  payroll_warning_exceptions: number;
  payroll_open_period_entries: number;
  open_certifications: number;
  expiring_certifications: number;
  cert_expiring_60: number;
  expired_certifications: number;
  revoked_certifications: number;
  has_schedule_template: boolean;
  pending_time_off_requests: number;
  upcoming_approved_time_away: number;
  needs_action: boolean;
  highest_action_severity: "blocking" | "warning" | "informational" | null;
  action_counts: { blocking: number; warning: number; informational: number };
  action_reasons: Array<{
    code: string;
    severity: "blocking" | "warning" | "informational";
    label: string;
    action_label: string;
    action_href: string;
  }>;
};

function certificationPosture(row: PersonRow) {
  if (row.expired_certifications > 0) return { label: "Expired", tone: "text-[color:var(--theme-danger-text)]" };
  if (row.expiring_certifications > 0) return { label: "Expiring ≤30d", tone: "text-[color:var(--theme-warning-text)]" };
  if (row.cert_expiring_60 > 0) return { label: "Expiring 31-60d", tone: "text-[color:var(--theme-warning-text)]" };
  if (row.open_certifications > 0) return { label: "Active", tone: "text-[color:var(--theme-success-text)]" };
  return { label: "No certs", tone: "text-[color:var(--theme-text-secondary)]" };
}

export default function PeoplePageClient() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "on_leave">("all");
  const [actionFilter, setActionFilter] = useState<"all" | "needs_action" | "payroll_issues" | "cert_expiry">("all");
  const actionParam = searchParams.get("action");
  const workforceAction = actionParam === "cert_expired" || actionParam === "cert_expiring" || actionParam === "missing_schedule_template" ? actionParam : null;

  useEffect(() => {
    const view = searchParams.get("view");
    if (view === "workforce") {
      setActionFilter("needs_action");
    }
    if (workforceAction === "cert_expired" || workforceAction === "cert_expiring") {
      setActionFilter("cert_expiry");
    }
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/people", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Failed to load people directory");
        setRows([]);
        return;
      }
      setRows((body?.people ?? []) as PersonRow[]);
    })();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter((row) => {
      const matchesStatus = statusFilter === "all" ? true : (row.employment_status ?? "active") === statusFilter;
      const matchesActionFilter = actionFilter === "all"
        ? true
        : actionFilter === "needs_action"
          ? row.needs_action
          : actionFilter === "payroll_issues"
            ? row.payroll_blocking_exceptions > 0 || row.payroll_warning_exceptions > 0 || !row.payroll_ready
            : row.expired_certifications > 0 || row.expiring_certifications > 0;
      const text = `${row.full_name ?? ""} ${row.email ?? ""} ${row.phone ?? ""} ${row.role ?? ""} ${row.workforce_role ?? ""}`.toLowerCase();
      const matchesWorkforceAction = workforceAction === "cert_expired"
        ? row.expired_certifications > 0
        : workforceAction === "cert_expiring"
          ? row.expiring_certifications > 0
          : workforceAction === "missing_schedule_template"
            ? !row.has_schedule_template
            : true;
      return matchesStatus && matchesActionFilter && matchesWorkforceAction && (!q || text.includes(q));
      })
      .sort((a, b) => {
        const score = (value: PersonRow["highest_action_severity"]) => (value === "blocking" ? 3 : value === "warning" ? 2 : value === "informational" ? 1 : 0);
        return score(b.highest_action_severity) - score(a.highest_action_severity);
      });
  }, [rows, search, statusFilter, actionFilter, workforceAction]);

  const summary = useMemo(() => {
    const source = rows ?? [];
    return {
      total: source.length,
      profileSetupMissing: source.filter((row) => !row.completed_onboarding).length,
      payrollFollowUp: source.filter((row) => row.payroll_blocking_exceptions > 0 || row.payroll_warning_exceptions > 0 || !row.payroll_ready).length,
      certFollowUp: source.filter((row) => row.expired_certifications > 0 || row.expiring_certifications > 0).length,
      pendingTimeOff: source.filter((row) => row.pending_time_off_requests > 0).length,
      inactive: source.filter((row) => row.employment_status === "inactive").length,
      needsAction: source.filter((row) => row.needs_action).length,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <AdminPageHeader
          eyebrow="Team directory"
          title="People"
          subtitle="Manage each employee’s access, workforce profile, schedule readiness, documents, certifications, and payroll follow-up."
        />
        <Link href="/dashboard/owner/create-user" className="inline-flex items-center justify-center rounded-lg border border-orange-300/40 bg-orange-500/15 px-4 py-2 text-sm font-medium text-[color:var(--theme-accent-text)] hover:border-orange-300/70 hover:bg-orange-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70">
          Add person
        </Link>
      </div>
      {workforceAction ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-400/40 bg-orange-500/10 px-4 py-2 text-xs text-[color:var(--theme-accent-text)]">
          <span>Filtered from Workforce Overview: {workforceAction === "cert_expired" ? "Expired certifications" : workforceAction === "cert_expiring" ? "Expiring certifications" : "Missing schedule templates"}</span>
          <Link href="/dashboard/workforce/people" className="font-medium text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]">Clear filter</Link>
        </div>
      ) : null}

      <AdminPanel>
        <AdminPanelTitle
          title="What this page is for"
          description="Open a person record to manage account access, workforce profile, certifications, and payroll posture in one place."
        />
        <AdminStatGrid>
          <AdminStatCard label="People" value={summary.total} />
          <AdminStatCard label="Profile setup incomplete" value={summary.profileSetupMissing} />
          <AdminStatCard label="Payroll follow-up" value={summary.payrollFollowUp} hint="Exceptions or not payroll-ready" />
          <AdminStatCard label="Credential follow-up" value={summary.certFollowUp} hint="Expired or expiring in 30 days" />
          <AdminStatCard label="Pending time off" value={summary.pendingTimeOff} />
          <AdminStatCard label="Needs action now" value={summary.needsAction} hint="Blocking/warning/informational triage" />
          <AdminStatCard label="Inactive workforce" value={summary.inactive} />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Find people quickly"
          description="Search by person identity, role, workforce category, or contact details."
          action={
            <div className="flex items-center gap-3 text-xs">
              <Link href="/dashboard/workforce/payroll-review" className="font-medium text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]">Payroll Time →</Link>
              <Link href="/dashboard/workforce/activity" className="font-medium text-[color:var(--theme-accent-text)]">Activity →</Link>
            </div>
          }
        />
        <AdminToolbar>
          <AdminField label="Search" className="flex-1">
            <input
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-orange-400/70"
              placeholder="Name, email, phone, role, workforce role"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </AdminField>
          <AdminField label="Employment status" className="w-full md:w-56">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-orange-400/70"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive" | "on_leave")}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </select>
          </AdminField>
          <AdminField label="Triage filter" className="w-full md:w-56">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-orange-400/70"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value as "all" | "needs_action" | "payroll_issues" | "cert_expiry")}
            >
              <option value="all">All people</option>
              <option value="needs_action">Needs action</option>
              <option value="payroll_issues">Payroll issues</option>
              <option value="cert_expiry">Cert expiry</option>
            </select>
          </AdminField>
        </AdminToolbar>
        {error ? <p className="px-4 pb-4 text-xs text-[color:var(--theme-danger-text)]">{error}</p> : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="People directory" description="Click a row to open the person workspace." />
        {!rows ? (
          <AdminEmptyState title="Loading people" body="Collecting identity, workforce, certification, and payroll posture." />
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState title="No people matched" body="Adjust filters or create people records first." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Person</th>
                  <th className="px-4 py-2.5 text-left">Identity role</th>
                  <th className="px-4 py-2.5 text-left">Workforce</th>
                  <th className="px-4 py-2.5 text-left">Certifications</th>
                  <th className="px-4 py-2.5 text-left">Payroll posture</th>
                  <th className="px-4 py-2.5 text-left">Scheduling</th>
                  <th className="px-4 py-2.5 text-left">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {filteredRows.map((row) => {
                  const cert = certificationPosture(row);
                  const topReason = row.action_reasons[0];
                  const severityTone = row.highest_action_severity === "blocking"
                    ? "text-[color:var(--theme-danger-text)]"
                    : row.highest_action_severity === "warning"
                      ? "text-[color:var(--theme-warning-text)]"
                      : "text-[color:var(--theme-info-text)]";

                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
                      onClick={() => {
                        window.location.href = `/dashboard/workforce/people/${row.id}`;
                      }}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[color:var(--theme-text-primary)]">{row.full_name ?? "Unnamed"}</p>
                        <p className="text-xs text-[color:var(--theme-text-muted)]">{row.email ?? "No email"}</p>
                        <p className="text-xs text-[color:var(--theme-text-secondary)]">{row.action_counts.blocking} blocking • {row.action_counts.warning} warning</p>
                      </td>
                      <td className="px-4 py-2.5"><AdminBadge>{row.role ?? "Unassigned"}</AdminBadge></td>
                      <td className="px-4 py-2.5">
                        <p>{row.workforce_role ?? "General"}</p>
                        <p className="text-xs text-[color:var(--theme-text-muted)]">{row.employment_status ?? "active"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <p className={cert.tone}>{cert.label}</p>
                        <p className="text-[color:var(--theme-text-secondary)]">{row.open_certifications} open • {row.expired_certifications} expired</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {row.payroll_blocking_exceptions > 0 ? `${row.payroll_blocking_exceptions} blocking` : row.payroll_warning_exceptions > 0 ? `${row.payroll_warning_exceptions} warning` : row.payroll_ready ? "Ready" : "Not ready"}
                        <p className="text-[color:var(--theme-text-secondary)]">{row.payroll_open_period_entries} open entries</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <p className={row.has_schedule_template ? "text-[color:var(--theme-success-text)]" : "text-[color:var(--theme-warning-text)]"}>
                          {row.has_schedule_template ? "Template set" : "No template"}
                        </p>
                        <p className="text-[color:var(--theme-text-secondary)]">
                          {row.pending_time_off_requests} pending · {row.upcoming_approved_time_away} upcoming away
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <AdminBadge>{row.needs_action ? "Needs action" : "Healthy"}</AdminBadge>
                        {row.needs_action ? (
                          <p className={`mt-1 text-xs ${severityTone}`}>{topReason?.label ?? "Action required"}</p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
