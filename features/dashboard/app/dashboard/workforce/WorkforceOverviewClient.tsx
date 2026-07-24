"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type InboxSeverity = "blocking" | "warning" | "info";

type InboxItem = {
  id: string;
  type: string;
  severity: InboxSeverity;
  title: string;
  description: string;
  personName?: string;
  count?: number;
  href: string;
};
type OverviewPayload = {
  summary: Record<string, number | null>;
  inbox: InboxItem[];
  sections: Record<string, InboxItem[]>;
  generatedAt: string | null;
  permissions: {
    canAccessPeople: boolean;
  };
};
const severityStyles: Record<InboxSeverity, { chip: string; border: string; dot: string; label: string }> = {
  blocking: {
    chip: "bg-red-500/15 text-[color:var(--theme-danger-text)] border-red-400/40",
    border: "border-red-500/30 hover:border-red-400/60",
    dot: "bg-red-400",
    label: "Blocking",
  },
  warning: {
    chip: "bg-amber-500/15 text-[color:var(--theme-warning-text)] border-amber-400/40",
    border: "border-amber-500/30 hover:border-amber-400/60",
    dot: "bg-amber-300",
    label: "Warning",
  },
  info: {
    chip: "bg-sky-500/15 text-[color:var(--theme-info-text)] border-sky-300/40",
    border: "border-sky-500/30 hover:border-sky-300/60",
    dot: "bg-sky-300",
    label: "Info",
  },
};

const sectionOrder = ["operations", "time", "payroll", "compliance", "certification"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function metric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metricDisplay(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function normalizeSeverity(value: unknown): InboxSeverity {
  return value === "blocking" || value === "warning" || value === "info" ? value : "info";
}

function safeHref(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : "/dashboard/workforce/overview";
}

function buildInboxItem(item: Record<string, unknown>, fallbackId: string): InboxItem | null {
  const title = typeof item.title === "string" ? item.title.trim() : "";
  const description = typeof item.description === "string" ? item.description.trim() : "";
  if (!title || !description) return null;

  const normalized: InboxItem = {
    id: typeof item.id === "string" && item.id.trim() ? item.id : fallbackId,
    type: typeof item.type === "string" ? item.type : "info",
    severity: normalizeSeverity(item.severity),
    title,
    description,
    href: safeHref(item.href),
  };

  if (typeof item.personName === "string" && item.personName.trim()) {
    normalized.personName = item.personName;
  }
  if (typeof item.count === "number" && Number.isFinite(item.count)) {
    normalized.count = item.count;
  }

  return normalized;
}



function roleSafeHref(href: string, canAccessPeople: boolean): string {
  if (canAccessPeople) return href;
  const blocked = [
    "/dashboard/workforce/people",
    "/dashboard/workforce/documents",
    "/dashboard/workforce/certifications",
    "/dashboard/workforce/required-document-matrix",
  ];
  return blocked.some((prefix) => href.startsWith(prefix)) ? "/dashboard/workforce/overview" : href;
}

function formatSectionLabel(key: string) {
  const normalized = key.replace(/[_-]/g, " ").trim();
  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatGeneratedAt(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WorkforceOverviewClient() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadWarning(null);
    try {
      const res = await fetch("/api/workforce/overview", { cache: "no-store" });
      if (!res.ok) {
        setError("Unable to load workforce overview.");
        setData(null);
        return;
      }

      const json = (await res.json()) as unknown;
      const summary = isRecord(json) && isRecord(json.summary) ? json.summary : {};
      const inbox = isRecord(json) ? asArray<Record<string, unknown>>(json.inbox) : [];
      const sections = isRecord(json) && isRecord(json.sections) ? json.sections : {};
      const generatedAt = isRecord(json) && typeof json.generatedAt === "string" ? json.generatedAt : null;
      const permissions = isRecord(json) && isRecord(json.permissions) ? json.permissions : {};

      const malformedMetrics = Object.entries(summary).filter(([, value]) => metric(value) === null);
      if (!isRecord(json) || !isRecord(json.summary)) {
        setLoadWarning("Workforce overview metrics are unavailable.");
      } else if (malformedMetrics.length > 0) {
        setLoadWarning("Some workforce overview metrics were unavailable or malformed.");
      }

      const normalizedData: OverviewPayload = {
        summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, metric(value)])),
        inbox: inbox
          .map((item, index) => buildInboxItem(item, `inbox-${index}`))
          .filter((item): item is InboxItem => item !== null),
        sections: Object.fromEntries(
          Object.entries(sections).map(([key, value]) => [
            key,
            asArray<Record<string, unknown>>(value)
              .map((item, index) => buildInboxItem(item, `${key}-${index}`))
              .filter((item): item is InboxItem => item !== null),
          ]),
        ),
        generatedAt,
        permissions: {
          canAccessPeople: permissions.canAccessPeople === true,
        },
      };

      setData(normalizedData);
    } catch {
      setError("Unable to load workforce overview.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const panelEntries = useMemo(() => {
    if (!data) return [];
    const ordered = Object.entries(data.sections).sort((a, b) => {
      const indexA = sectionOrder.findIndex((entry) => a[0].toLowerCase().includes(entry));
      const indexB = sectionOrder.findIndex((entry) => b[0].toLowerCase().includes(entry));
      const normalizedA = indexA === -1 ? 99 : indexA;
      const normalizedB = indexB === -1 ? 99 : indexB;
      if (normalizedA !== normalizedB) return normalizedA - normalizedB;
      return a[0].localeCompare(b[0]);
    });
    return ordered;
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-28 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-[color:var(--theme-danger-text)]">
        <h2 className="text-lg font-semibold">Workforce command unavailable</h2>
        <p className="mt-2 text-sm text-[color:var(--theme-danger-text)]">{error ?? "Failed to load workforce overview."}</p>
        <button
          type="button"
          className="mt-3 rounded-md border border-red-300/40 px-3 py-1.5 text-sm text-[color:var(--theme-danger-text)] underline-offset-2 hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          Retry
        </button>
      </div>
    );
  }

  const kpiGroups = [
    {
      title: "Needs action",
      accent: "text-[color:var(--theme-danger-text)]",
      items: [
        { label: "Pending time off", value: data.summary.pendingTimeOff, tone: "border-red-500/35" },
        { label: "Payroll blocking", value: data.summary.payrollBlocking, tone: "border-red-500/45" },
        { label: "Assigned unavailable", value: data.summary.assignedToUnavailable, tone: "border-red-500/30" },
        { label: "Unassigned jobs", value: data.summary.unassignedJobs, tone: "border-red-500/30" },
        { label: "Attendance exceptions", value: data.summary.activeAttendanceExceptions ?? 0, tone: "border-red-500/40" },
      ],
    },
    {
      title: "Coverage",
      accent: "text-[color:var(--theme-info-text)]",
      items: [
        { label: "Scheduled today", value: data.summary.scheduledToday, tone: "border-sky-400/30" },
        { label: "Clocked in", value: data.summary.workingToday, tone: "border-sky-400/30" },
        { label: "Working on jobs", value: data.summary.workingOnJobs ?? 0, tone: "border-emerald-400/30" },
        { label: "Clocked in, no job", value: data.summary.idleTechnicians ?? 0, tone: "border-orange-400/30" },
        { label: "Away today", value: data.summary.awayToday, tone: "border-sky-500/20" },
      ],
    },
    {
      title: "Compliance",
      accent: "text-[color:var(--theme-warning-text)]",
      items: [
        { label: "Expired certs", value: data.summary.expiredCertifications, tone: "border-amber-400/35" },
        { label: "Expiring certs", value: data.summary.expiringCertifications, tone: "border-amber-300/30" },
        { label: "Schedule gaps", value: data.summary.scheduleGaps, tone: "border-amber-300/25" },
      ],
    },
  ];

  const groupedInbox = {
    blockers: data.inbox.filter((item) => item.severity === "blocking"),
    followUp: data.inbox.filter((item) => item.severity === "warning"),
    watchlist: data.inbox.filter((item) => item.severity === "info"),
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--theme-accent-text)]">Today</p>
            <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)] md:text-3xl">Command Overview</h1>
            <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
              Coverage, exceptions, and people signals for today’s shop flow.
            </p>
          </div>
          <p className="inline-flex items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-xs text-[color:var(--theme-info-text)]">
            Last updated {formatGeneratedAt(data.generatedAt)}
          </p>
        </div>
      </header>

      {loadWarning ? <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm text-[color:var(--theme-warning-text)]">{loadWarning}</div> : null}

      <section className="overflow-x-auto pb-1" aria-label="Workforce key metrics">
        <div className="grid min-w-[680px] gap-3 md:grid-cols-2 lg:min-w-0 lg:grid-cols-3">
          {kpiGroups.map((group) => (
            <article key={group.title} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
              <h2 className={`text-sm font-semibold ${group.accent}`}>{group.title}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <div key={item.label} className={`rounded-lg border bg-[color:var(--theme-surface-inset)] p-3 ${item.tone}`}>
                    <p className="text-xs text-[color:var(--theme-text-secondary)]">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">{metricDisplay(item.value)}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 md:p-6">
        <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">Workforce Inbox</h2>
        {data.inbox.length === 0 ? (
          <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-[color:var(--theme-success-text)]">
            <p className="font-medium">Workforce is clear right now.</p>
            <p className="mt-1 text-[color:var(--theme-success-text)]">No immediate staffing or compliance issues are waiting in queue.</p>
            <p className="mt-2 text-[color:var(--theme-success-text)]">
              Stay ahead from <Link href="/dashboard/workforce/scheduling" className="underline hover:text-[color:var(--theme-text-primary)]">Schedule &amp; Time Away</Link>.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {[
              ["Immediate blockers", groupedInbox.blockers],
              ["Today follow-up", groupedInbox.followUp],
              ["Watchlist", groupedInbox.watchlist],
            ].map(([label, entries]) => {
              const list = entries as InboxItem[];
              if (list.length === 0) return null;
              return (
                <div key={label as string}>
                  <h3 className="text-sm font-medium text-[color:var(--theme-text-primary)]">{label as string}</h3>
                  <div className="mt-2 space-y-2">
                    {list.map((item) => {
                      const styles = severityStyles[item.severity];
                      return (
                        <Link
                          href={roleSafeHref(safeHref(item.href), data.permissions.canAccessPeople)}
                          key={item.id}
                          className={`block rounded-xl border bg-[color:var(--theme-surface-inset)] p-3 transition ${styles.border} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${styles.chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden />
                              {styles.label}
                            </span>
                            {item.count !== undefined ? <span className="text-xs text-[color:var(--theme-text-secondary)]">Count: {item.count}</span> : null}
                            {item.personName ? <span className="text-xs text-[color:var(--theme-text-secondary)]">Person: {item.personName}</span> : null}
                          </div>
                          <p className="mt-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">{item.title}</p>
                          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">{item.description}</p>
                          <p className="mt-2 text-xs text-[color:var(--theme-accent-text)]">Open action →</p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2" aria-label="Operational risk panels">
        {panelEntries.map(([key, items]) => (
          <article key={key} className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-gradient-to-br from-[color:var(--theme-surface-page)] to-[color:var(--theme-surface-page)] p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-copper-200">{formatSectionLabel(key)}</h3>
            {items.length === 0 ? (
              <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">No active items.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link href={roleSafeHref(safeHref(item.href), data.permissions.canAccessPeople)} className="flex items-start justify-between gap-3 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] hover:border-orange-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70">
                      <span>
                        <span className="font-medium text-[color:var(--theme-text-primary)]">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-[color:var(--theme-text-secondary)]">{item.description}</span>
                      </span>
                      {item.count !== undefined ? <span className="shrink-0 text-xs text-[color:var(--theme-text-secondary)]">{item.count}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
