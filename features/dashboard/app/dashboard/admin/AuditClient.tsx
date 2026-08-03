"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type ActivityEvent = {
  id: string;
  occurredAt: string;
  actionKey: string;
  actionLabel: string;
  category:
    | "People"
    | "Attendance"
    | "Scheduling"
    | "Payroll"
    | "Compliance"
    | "Operations";
  severity: "high" | "normal";
  actorName: string;
  targetLabel: string;
  summary: string;
};

export default function AdminAuditClient() {
  const [rows, setRows] = useState<ActivityEvent[] | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState<"all" | "high" | "normal">("all");

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch("/api/workforce/activity", {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!active) return;
      if (!response.ok) {
        setErr(body?.error ?? "Unable to load workforce activity.");
        setRows([]);
        return;
      }
      setRows(Array.isArray(body?.events) ? body.events : []);
      setTimezone(
        typeof body?.timezone === "string" && body.timezone
          ? body.timezone
          : "UTC",
      );
    })();
    return () => {
      active = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (category !== "all" && row.category !== category) return false;
      if (severity !== "all" && row.severity !== severity) return false;
      if (!normalized) return true;
      return [
        row.actionLabel,
        row.actorName,
        row.targetLabel,
        row.summary,
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [category, query, rows, severity]);

  const summary = useMemo(() => {
    const current = rows ?? [];
    return {
      total: current.length,
      high: current.filter((row) => row.severity === "high").length,
      last24h: current.filter(
        (row) =>
          Date.now() - new Date(row.occurredAt).getTime() <=
          24 * 60 * 60 * 1000,
      ).length,
      people: new Set(current.map((row) => row.actorName)).size,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="Workforce trail"
        title="Activity"
        subtitle="A shop-scoped history of people, attendance, scheduling, payroll, and compliance changes."
      />

      <AdminPanel>
        <AdminPanelTitle
          title="Activity health"
          description="Every entry is resolved to an employee name and kept inside the current shop."
        />
        <AdminStatGrid>
          <AdminStatCard label="Recent events" value={summary.total} />
          <AdminStatCard label="Important events" value={summary.high} />
          <AdminStatCard label="Last 24 hours" value={summary.last24h} />
          <AdminStatCard label="People involved" value={summary.people} />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Review activity"
          description="Search by employee name, action, or readable context."
        />
        <AdminToolbar>
          <AdminField label="Search names and actions" className="flex-1">
            <input
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[color:var(--brand-accent)]"
              placeholder="Employee name, payroll, schedule…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </AdminField>
          <AdminField label="Area" className="w-full md:w-48">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">All areas</option>
              <option value="People">People</option>
              <option value="Attendance">Attendance</option>
              <option value="Scheduling">Scheduling</option>
              <option value="Payroll">Payroll</option>
              <option value="Compliance">Compliance</option>
              <option value="Operations">Operations</option>
            </select>
          </AdminField>
          <AdminField label="Importance" className="w-full md:w-44">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
              value={severity}
              onChange={(event) =>
                setSeverity(
                  event.target.value as "all" | "high" | "normal",
                )
              }
            >
              <option value="all">All events</option>
              <option value="high">Important</option>
              <option value="normal">Routine</option>
            </select>
          </AdminField>
        </AdminToolbar>
        {err ? (
          <p className="px-4 pb-3 text-sm text-[color:var(--theme-danger-text)]">
            {err}
          </p>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Recent workforce events"
          description="Names and plain-language context replace raw database identifiers."
        />
        {!rows ? (
          <AdminEmptyState
            title="Loading activity"
            body="Gathering the latest workforce events."
          />
        ) : filteredRows.length === 0 ? (
          <AdminEmptyState
            title="No matching activity"
            body="No events match the current filters."
          />
        ) : (
          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {filteredRows.map((row) => (
              <article
                key={row.id}
                className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminBadge>{row.category}</AdminBadge>
                    {row.severity === "high" ? (
                      <AdminBadge>Important</AdminBadge>
                    ) : null}
                    <p className="font-semibold text-[color:var(--theme-text-primary)]">
                      {row.actionLabel}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                    <span className="font-medium text-[color:var(--theme-text-primary)]">
                      {row.actorName}
                    </span>{" "}
                    · {row.summary}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                    Target: {row.targetLabel}
                  </p>
                </div>
                <time
                  className="text-sm text-[color:var(--theme-text-secondary)] md:text-right"
                  dateTime={row.occurredAt}
                >
                  {new Date(row.occurredAt).toLocaleString([], {
                    timeZone: timezone,
                  })}
                </time>
              </article>
            ))}
          </div>
        )}
      </AdminPanel>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/dashboard/workforce/attendance"
          className="text-[color:var(--theme-accent-text)] underline"
        >
          Review attendance
        </Link>
        <Link
          href="/dashboard/workforce/payroll-review"
          className="text-[color:var(--theme-accent-text)] underline"
        >
          Review payroll
        </Link>
      </div>
    </div>
  );
}
