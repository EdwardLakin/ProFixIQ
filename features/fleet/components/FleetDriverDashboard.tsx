"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Mic,
  RefreshCw,
  Send,
  Truck,
} from "lucide-react";

import type {
  FleetDriverClarification,
  FleetDriverDashboardPayload,
  FleetDriverIssue,
  FleetDriverIssueStatus,
} from "@/features/fleet/types/driverPortal";

const STATUS_LABELS: Record<FleetDriverIssueStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  scheduled: "Scheduled",
  in_shop: "In shop",
  completed: "Completed",
  closed: "Closed",
};

const TIMELINE: FleetDriverIssueStatus[] = [
  "submitted",
  "under_review",
  "scheduled",
  "in_shop",
  "completed",
];

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function DriverIssueTimeline({ issue }: { issue: FleetDriverIssue }) {
  if (issue.status === "closed") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-[color:var(--theme-surface-page)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
        <CheckCircle2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
        Dispatch closed this report after review.
      </div>
    );
  }

  const activeIndex = Math.max(0, TIMELINE.indexOf(issue.status));
  return (
    <ol className="mt-4 grid grid-cols-5 gap-1" aria-label="Issue status">
      {TIMELINE.map((status, index) => (
        <li key={status} className="min-w-0 text-center">
          <div
            className={`mx-auto h-2.5 w-2.5 rounded-full ${
              index <= activeIndex ? "bg-sky-400" : "bg-slate-400/25"
            }`}
          />
          <div
            className={`mt-1 truncate text-[9px] ${
              index <= activeIndex
                ? "text-[color:var(--theme-text-secondary)]"
                : "text-[color:var(--theme-text-muted)]"
            }`}
          >
            {STATUS_LABELS[status]}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ClarificationResponse({
  clarification,
  onSent,
}: {
  clarification: FleetDriverClarification;
  onSent: () => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("clarificationId", clarification.id);
      formData.set("responseText", answer);
      if (file) formData.set("evidence", file);
      const response = await fetch("/api/fleet/clarifications", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Unable to send response");
      await onSent();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to send response",
      );
    } finally {
      setBusy(false);
    }
  }

  const Icon =
    clarification.responseType === "photo"
      ? Camera
      : clarification.responseType === "voice"
        ? Mic
        : Send;

  return (
    <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.08] p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 dark:text-amber-200" />
        <div>
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-100">
            Dispatch needs one more thing
          </div>
          <p className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
            {clarification.prompt}
          </p>
        </div>
      </div>

      {clarification.responseType === "answer" ? (
        <textarea
          rows={2}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Type a quick answer"
          className="mt-3 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2 text-sm"
        />
      ) : (
        <label className="mt-3 block rounded-xl border border-dashed border-amber-300/40 bg-[color:var(--theme-surface-inset)] p-3 text-xs font-semibold">
          {clarification.responseType === "photo"
            ? "Take or choose a photo"
            : "Record or choose a voice note"}
          <input
            type="file"
            accept={
              clarification.responseType === "photo" ? "image/*" : "audio/*"
            }
            capture={
              clarification.responseType === "photo" ? "environment" : undefined
            }
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-xs font-normal"
          />
        </label>
      )}

      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-200">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {busy ? "Sending…" : "Send to dispatch"}
      </button>
    </div>
  );
}

export default function FleetDriverDashboard({
  view = "home",
}: {
  view?: "home" | "updates";
}) {
  const pathname = usePathname() ?? "";
  const internalRoutes = pathname.startsWith("/portal/fleet");
  const updatesView = view === "updates";
  const [data, setData] = useState<FleetDriverDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/fleet/driver/dashboard", {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as
      | FleetDriverDashboardPayload
      | { error?: string };
    if (!response.ok || !("assignments" in body)) {
      throw new Error(
        "error" in body && body.error
          ? body.error
          : "Unable to load your driver dashboard",
      );
    }
    setData(body);
  }, []);

  useEffect(() => {
    let active = true;
    void load()
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load your driver dashboard",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  const openClarifications = useMemo(
    () =>
      data?.issues.filter(
        (issue) => issue.clarification?.status === "requested",
      ) ?? [],
    [data?.issues],
  );
  const primaryAssignment =
    data?.assignments.find(
      (assignment) => assignment.state === "pretrip_due",
    ) ??
    data?.assignments[0] ??
    null;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
        Loading today’s driver workspace…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-400/25 bg-red-400/10 p-5">
        <p className="text-sm text-red-700 dark:text-red-200">
          {error || "Driver workspace unavailable"}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load()
              .catch((cause) => {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Unable to load your driver dashboard",
                );
              })
              .finally(() => setLoading(false));
          }}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-400/30 px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 pb-24 lg:pb-6">
      <header className="rounded-3xl border border-sky-400/20 bg-gradient-to-br from-sky-400/[0.14] via-[color:var(--theme-surface-inset)] to-[color:var(--theme-surface-inset)] p-5 shadow-[var(--theme-shadow-medium)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-300">
          {data.fleetName} · Driver
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {updatesView
            ? "Issue updates"
            : `Ready to roll, ${data.driverName.split(" ")[0]}?`}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          {updatesView
            ? "See what happened after each report and answer any dispatch questions."
            : "Complete today’s inspection, report what you see, and check updates."}
        </p>
      </header>

      {openClarifications.length ? (
        <section className="rounded-3xl border border-amber-300/30 bg-amber-300/[0.08] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-200" />
            {openClarifications.length} update
            {openClarifications.length === 1 ? "" : "s"} need your response
          </div>
          <div className="mt-3 space-y-3">
            {openClarifications.map((issue) => (
              <div
                key={issue.id}
                className="rounded-2xl bg-[color:var(--theme-surface-inset)] p-3"
              >
                <div className="text-sm font-semibold">
                  {issue.unitLabel} · {issue.label}
                </div>
                {issue.clarification ? (
                  <ClarificationResponse
                    clarification={issue.clarification}
                    onSent={load}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!updatesView ? (
        <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-soft)]">
          {primaryAssignment ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-500 dark:text-sky-300">
                    Required today
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {primaryAssignment.unitLabel}
                  </h2>
                  <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                    {primaryAssignment.routeLabel ||
                      primaryAssignment.vehicleType}
                  </p>
                </div>
                <span className="rounded-full bg-amber-300/15 px-3 py-1 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-100">
                  {primaryAssignment.state === "pretrip_due"
                    ? "Inspection due"
                    : "Assigned"}
                </span>
              </div>

              <Link
                href={`${internalRoutes ? "/portal/fleet/pretrip" : "/pre-trips/start"}/${encodeURIComponent(primaryAssignment.vehicleId)}?fleetId=${encodeURIComponent(primaryAssignment.fleetId)}`}
                className="mt-4 flex min-h-14 w-full items-center justify-between rounded-2xl bg-sky-300 px-4 text-base font-semibold text-slate-950 shadow-[0_12px_30px_rgba(56,189,248,0.22)]"
              >
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" /> Start pre-trip
                </span>
                <ChevronRight className="h-5 w-5" />
              </Link>
              <Link
                href={`${internalRoutes ? "/portal/fleet/pretrip" : "/pre-trips/start"}/${encodeURIComponent(primaryAssignment.vehicleId)}?fleetId=${encodeURIComponent(primaryAssignment.fleetId)}&mode=defect`}
                className="mt-2 flex min-h-12 w-full items-center justify-between rounded-2xl border border-[color:var(--theme-border-soft)] px-4 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-200" />
                  Report an issue
                </span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <div className="py-5 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <h2 className="mt-3 font-semibold">No active asset assignment</h2>
              <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                Dispatch will assign your next unit here.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {!updatesView && data.assignments.length > 1 ? (
        <section>
          <h2 className="px-1 text-sm font-semibold">Other assigned assets</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {data.assignments
              .filter((assignment) => assignment.id !== primaryAssignment?.id)
              .map((assignment) => (
                <Link
                  key={assignment.id}
                  href={`${internalRoutes ? "/portal/fleet/pretrip" : "/pre-trips/start"}/${encodeURIComponent(assignment.vehicleId)}?fleetId=${encodeURIComponent(assignment.fleetId)}`}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
                >
                  <Truck className="h-5 w-5 text-sky-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {assignment.unitLabel}
                    </span>
                    <span className="block truncate text-xs text-[color:var(--theme-text-muted)]">
                      {assignment.routeLabel || assignment.vehicleType}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {updatesView ? "All reported issues" : "My reported issues"}
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-muted)]">
              You report the condition. Dispatch handles the next step.
            </p>
          </div>
          {!updatesView ? (
            <Link
              href={internalRoutes ? "/portal/fleet/updates" : "/updates"}
              className="text-xs font-semibold text-sky-500 dark:text-sky-300"
            >
              View all
            </Link>
          ) : null}
        </div>

        <div className="mt-3 space-y-3">
          {data.issues
            .slice(0, updatesView ? data.issues.length : 4)
            .map((issue) => (
              <article
                key={issue.id}
                className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {issue.unitLabel} · {issue.label}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-[color:var(--theme-text-muted)]">
                      <Clock3 className="h-3 w-3" />{" "}
                      {dateTime(issue.reportedAt)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-sky-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase text-sky-600 dark:text-sky-200">
                    {STATUS_LABELS[issue.status]}
                  </span>
                </div>
                <DriverIssueTimeline issue={issue} />
              </article>
            ))}
          {!data.issues.length ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-400/10 p-3 text-sm text-emerald-700 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" /> No reported issues.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
