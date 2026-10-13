"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ImageIcon,
  MessageSquareText,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@shared/components/ui/Button";
import Card from "@shared/components/ui/Card";
import { cn } from "@shared/lib/utils";
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/features/feedback/lib/feedback";

type FeedbackSubmission = {
  id: string;
  description: string;
  reporterId: string | null;
  reporterRole: string | null;
  shopId: string | null;
  createdAt: string;
  context: Record<string, unknown>;
};

type FeedbackItem = {
  id: string;
  title: string;
  summary: string;
  kind: string;
  surface: string;
  status: FeedbackStatus;
  severity: string;
  needsAttention: boolean;
  recommendation: string;
  internalNotes: string | null;
  aiMode: string;
  submissionCount: number;
  uniqueUserCount: number;
  uniqueShopCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  completedAt: string | null;
  updatedAt: string;
  requesterNotifications: { pending: number; unknown: number };
  ownerNotifications: { pending: number; unknown: number };
  submissions: FeedbackSubmission[];
};

type SignedAttachment = {
  path: string;
  url: string;
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  declined: "Declined",
};

function pretty(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function attachmentPaths(context: Record<string, unknown>): string[] {
  const raw = context.attachmentIds;
  return Array.isArray(raw)
    ? raw.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
}

function statusClasses(status: FeedbackStatus): string {
  switch (status) {
    case "new":
      return "border-sky-500/40 bg-sky-500/10 text-sky-300";
    case "reviewing":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "planned":
      return "border-violet-500/40 bg-violet-500/10 text-violet-300";
    case "in_progress":
      return "border-orange-500/40 bg-orange-500/10 text-orange-300";
    case "completed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "declined":
      return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-muted)]";
  }
}

export default function FeedbackConsole() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [surfaceFilter, setSurfaceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [notifyRequesters, setNotifyRequesters] = useState(true);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>(
    {},
  );

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/feedback", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load feedback");
      const payload = (await response.json()) as { items: FeedbackItem[] };
      setItems(payload.items ?? []);
      const requested = new URLSearchParams(window.location.search).get(
        "feedback",
      );
      setSelectedId((current) => {
        if (current && payload.items.some((item) => item.id === current)) {
          return current;
        }
        if (requested && payload.items.some((item) => item.id === requested)) {
          return requested;
        }
        return payload.items[0]?.id ?? null;
      });
    } catch (error) {
      console.error(error);
      toast.error("Could not load feedback");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setInternalNotes(selected?.internalNotes ?? "");
    setNotifyRequesters(true);
  }, [selected?.id, selected?.internalNotes]);

  useEffect(() => {
    const paths = selected
      ? [
          ...new Set(
            selected.submissions.flatMap((submission) =>
              attachmentPaths(submission.context),
            ),
          ),
        ]
      : [];

    if (paths.length === 0) {
      setAttachmentUrls({});
      return;
    }

    let cancelled = false;
    void fetch("/api/feedback/attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load attachments");
        return (await response.json()) as { attachments?: SignedAttachment[] };
      })
      .then((payload) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const attachment of payload.attachments ?? []) {
          if (attachment.path && attachment.url) {
            next[attachment.path] = attachment.url;
          }
        }
        setAttachmentUrls(next);
      })
      .catch((error) => {
        console.warn("feedback attachment load failed", error);
        if (!cancelled) setAttachmentUrls({});
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const surfaces = useMemo(
    () => [...new Set(items.map((item) => item.surface))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (surfaceFilter !== "all" && item.surface !== surfaceFilter)
        return false;
      if (
        statusFilter === "active" &&
        ["completed", "declined"].includes(item.status)
      ) {
        return false;
      }
      if (statusFilter === "attention" && !item.needsAttention) return false;
      if (
        statusFilter !== "all" &&
        statusFilter !== "active" &&
        statusFilter !== "attention" &&
        item.status !== statusFilter
      ) {
        return false;
      }
      if (!query) return true;
      return [
        item.title,
        item.summary,
        item.recommendation,
        item.surface,
        item.kind,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [items, search, statusFilter, surfaceFilter]);

  const metrics = useMemo(
    () => ({
      newCount: items.filter((item) => item.status === "new").length,
      attention: items.filter(
        (item) =>
          item.needsAttention &&
          item.status !== "completed" &&
          item.status !== "declined",
      ).length,
      repeated: items.filter(
        (item) =>
          item.submissionCount >= 3 &&
          item.status !== "completed" &&
          item.status !== "declined",
      ).length,
      completed: items.filter((item) => item.status === "completed").length,
    }),
    [items],
  );

  async function updateItem(input: {
    status?: FeedbackStatus;
    needsAttention?: boolean;
    saveNotes?: boolean;
    retryNotifications?: boolean;
    retryUnknown?: boolean;
  }) {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/feedback/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: selected.updatedAt,
          retryUnknownNotifications: input.retryUnknown,
          status: input.status,
          needsAttention: input.needsAttention,
          internalNotes: input.saveNotes ? internalNotes : undefined,
          notifyRequesters:
            input.status === "completed" || input.retryNotifications
              ? notifyRequesters
              : false,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        notified?: number;
        pendingNotifications?: number;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Update failed");
      }
      if (input.retryNotifications || input.status === "completed") {
        toast.success(
          `${payload?.notified ?? 0} requester notifications sent; ${payload?.pendingNotifications ?? 0} pending.`,
        );
      } else toast.success("Feedback updated");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Could not update feedback",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-orange-300">
            <MessageSquareText className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">
              Product Intelligence
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Feedback & Requests
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Customer feedback from every ProFixIQ surface, automatically grouped
            and prioritized by frequency and impact. AI organizes the queue;
            product decisions and implementation stay human-controlled.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void load()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="New"
          value={metrics.newCount}
          icon={<Clock3 className="h-4 w-4" />}
        />
        <Metric
          label="Needs attention"
          value={metrics.attention}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <Metric
          label="Repeated requests"
          value={metrics.repeated}
          icon={<Users className="h-4 w-4" />}
        />
        <Metric
          label="Completed"
          value={metrics.completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search feedback, summaries, or recommendations…"
            className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="attention">Needs Attention</option>
            <option value="all">All Statuses</option>
            {FEEDBACK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            value={surfaceFilter}
            onChange={(event) => setSurfaceFilter(event.target.value)}
            className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm"
          >
            <option value="all">All Surfaces</option>
            {surfaces.map((surface) => (
              <option key={surface} value={surface}>
                {pretty(surface)}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid min-h-[620px] gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.4fr)]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[color:var(--theme-text-muted)]">
            {filtered.length} feedback item{filtered.length === 1 ? "" : "s"}
          </div>
          <div className="max-h-[70dvh] overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "w-full border-b border-[color:var(--theme-border-soft)] p-4 text-left transition hover:bg-[color:var(--theme-surface-subtle)]",
                  selectedId === item.id && "bg-orange-500/8",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.needsAttention ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : null}
                      <span className="font-semibold text-[color:var(--theme-text-primary)]">
                        {item.title}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--theme-text-muted)]">
                      {item.summary}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase",
                      statusClasses(item.status),
                    )}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--theme-text-muted)]">
                  <span>{pretty(item.surface)}</span>
                  <span>{pretty(item.kind)}</span>
                  <span>
                    {item.submissionCount} report
                    {item.submissionCount === 1 ? "" : "s"}
                  </span>
                  <span>
                    {item.uniqueShopCount} shop
                    {item.uniqueShopCount === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
            ))}
            {!loading && filtered.length === 0 ? (
              <p className="p-6 text-sm text-[color:var(--theme-text-muted)]">
                No feedback matches these filters.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="p-5">
          {selected ? (
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-1 text-[10px] font-bold uppercase",
                      statusClasses(selected.status),
                    )}
                  >
                    {STATUS_LABELS[selected.status]}
                  </span>
                  <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-1 text-[10px] font-bold uppercase text-[color:var(--theme-text-secondary)]">
                    {pretty(selected.surface)}
                  </span>
                  <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-1 text-[10px] font-bold uppercase text-[color:var(--theme-text-secondary)]">
                    {pretty(selected.kind)}
                  </span>
                  <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-1 text-[10px] font-bold uppercase text-[color:var(--theme-text-secondary)]">
                    {pretty(selected.severity)}
                  </span>
                </div>
                <h2 className="mt-3 text-2xl font-bold">{selected.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
                  {selected.summary}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Reports" value={selected.submissionCount} />
                <MiniMetric
                  label="Unique users"
                  value={selected.uniqueUserCount}
                />
                <MiniMetric
                  label="Unique shops"
                  value={selected.uniqueShopCount}
                />
              </div>

              <section className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-sky-300">
                  AI recommendation
                </p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
                  {selected.recommendation}
                </p>
                <p className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
                  Triage mode: {selected.aiMode}. Frequency and shop counts
                  above are measured from actual submissions.
                </p>
              </section>

              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--theme-text-muted)]">
                  Product decision
                </p>
                <div className="flex flex-wrap gap-2">
                  {FEEDBACK_STATUSES.map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={
                        selected.status === status ? "default" : "outline"
                      }
                      disabled={saving || selected.status === status}
                      onClick={() => void updateItem({ status })}
                    >
                      {STATUS_LABELS[status]}
                    </Button>
                  ))}
                </div>
                {selected.status !== "completed" ? (
                  <label className="mt-3 flex items-center gap-2 text-sm text-[color:var(--theme-text-secondary)]">
                    <input
                      type="checkbox"
                      checked={notifyRequesters}
                      onChange={(event) =>
                        setNotifyRequesters(event.target.checked)
                      }
                    />
                    Notify requesters automatically when I mark this Completed
                  </label>
                ) : (
                  <div className="mt-3 space-y-2 text-sm text-[color:var(--theme-text-secondary)]">
                    <p>
                      {selected.requesterNotifications.pending} requester
                      notifications pending.
                    </p>
                    <Button
                      variant="outline"
                      disabled={
                        saving || selected.requesterNotifications.pending === 0
                      }
                      onClick={() =>
                        void updateItem({ retryNotifications: true })
                      }
                    >
                      Retry requester notifications
                    </Button>
                  </div>
                )}
                {selected.ownerNotifications.pending > 0 ? (
                  <div className="mt-3 text-sm">
                    <p>
                      {selected.ownerNotifications.pending} owner alerts
                      pending.
                    </p>
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        void updateItem({ retryNotifications: true })
                      }
                    >
                      Retry pending alerts
                    </Button>
                  </div>
                ) : null}
                {selected.requesterNotifications.unknown +
                  selected.ownerNotifications.unknown >
                0 ? (
                  <div className="mt-3 block text-sm text-amber-300">
                    Delivery could not be confirmed for{" "}
                    {selected.requesterNotifications.unknown +
                      selected.ownerNotifications.unknown}{" "}
                    notifications. Resending may send a duplicate.
                    <Button
                      className="mt-2"
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        void updateItem({
                          retryNotifications: true,
                          retryUnknown: true,
                        })
                      }
                    >
                      Resend unconfirmed notifications
                    </Button>
                  </div>
                ) : null}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--theme-text-muted)]">
                    Internal notes
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void updateItem({ saveNotes: true })}
                  >
                    Save Notes
                  </Button>
                </div>
                <textarea
                  value={internalNotes}
                  onChange={(event) => setInternalNotes(event.target.value)}
                  rows={4}
                  maxLength={12_000}
                  placeholder="Decision, implementation notes, PR number, reason for declining, etc."
                  className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 text-sm"
                />
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--theme-text-muted)]">
                    Original submissions
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() =>
                      void updateItem({
                        needsAttention: !selected.needsAttention,
                      })
                    }
                  >
                    {selected.needsAttention
                      ? "Clear Attention Flag"
                      : "Flag for Attention"}
                  </Button>
                </div>
                <div className="space-y-3">
                  {[...selected.submissions].reverse().map((submission) => {
                    const paths = attachmentPaths(submission.context);
                    return (
                      <div
                        key={submission.id}
                        className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4"
                      >
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--theme-text-muted)]">
                          <span>{formatDate(submission.createdAt)}</span>
                          {submission.reporterRole ? (
                            <span>{pretty(submission.reporterRole)}</span>
                          ) : null}
                          {submission.shopId ? (
                            <span>Shop {submission.shopId.slice(0, 8)}…</span>
                          ) : null}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                          {submission.description}
                        </p>
                        {typeof submission.context.location === "string" ? (
                          <p className="mt-2 text-xs text-[color:var(--theme-text-muted)]">
                            Location: {submission.context.location}
                          </p>
                        ) : null}
                        {paths.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {paths.map((path, index) => {
                              const url = attachmentUrls[path];
                              return url ? (
                                <a
                                  key={path}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-xs font-semibold transition hover:border-orange-500/40"
                                >
                                  <ImageIcon className="h-4 w-4" />
                                  Screenshot {index + 1}
                                </a>
                              ) : (
                                <span
                                  key={path}
                                  className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs text-[color:var(--theme-text-muted)]"
                                >
                                  <ImageIcon className="h-4 w-4" />
                                  Loading screenshot…
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              <p className="text-xs text-[color:var(--theme-text-muted)]">
                First reported {formatDate(selected.firstSeenAt)} · Last
                activity {formatDate(selected.lastSeenAt)}
              </p>
            </div>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-[color:var(--theme-text-muted)]">
              Select a feedback item to review it.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-[color:var(--theme-text-muted)]">
        <span className="text-xs font-bold uppercase tracking-wider">
          {label}
        </span>
        {icon}
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--theme-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
