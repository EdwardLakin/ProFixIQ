"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CircleDot, KeyRound, ShieldAlert } from "lucide-react";
import { cn } from "@shared/lib/utils";
import type { DemoProspect, DemoShopContext } from "@/features/ops/server/demoAccess";

const DURATION_PRESETS = [
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 24 * 7 },
  { label: "14 days", hours: 24 * 14 },
  { label: "30 days", hours: 24 * 30 },
] as const;
const CUSTOM_DURATION_VALUE = "custom";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function stateTone(state: DemoProspect["state"]): string {
  return state === "active"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-muted)]";
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false, error: data.error ?? "Request failed." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Request failed." };
  }
}

function CreateProspectForm({ onCreated }: { onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [durationHours, setDurationHours] = useState<string>(String(DURATION_PRESETS[1].hours));
  const [customExpiresAt, setCustomExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const expiresAt =
      durationHours === CUSTOM_DURATION_VALUE
        ? customExpiresAt
          ? new Date(customExpiresAt).toISOString()
          : ""
        : new Date(Date.now() + Number(durationHours) * 60 * 60 * 1000).toISOString();

    if (!expiresAt) {
      setError("Choose an expiration date/time.");
      return;
    }

    setSubmitting(true);
    const result = await postJson("/api/ops/demo-access/create", {
      fullName,
      email,
      expiresAt,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? "Failed to create demo access.");
      return;
    }

    setFullName("");
    setEmail("");
    setCustomExpiresAt("");
    onCreated();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-card sm:p-5"
    >
      <h2 className="font-bold">Create demo access</h2>
      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
        Provisions a temporary owner account in the configured Demo Shop and
        emails the prospect their sign-in details.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
          Prospect name
          <input
            type="text"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
            placeholder="Jordan Ramirez"
          />
        </label>
        <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
          Prospect email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
            placeholder="jordan@example.com"
          />
        </label>
        <label className="text-xs font-semibold text-[color:var(--theme-text-secondary)] sm:col-span-2">
          Expiration
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <select
              value={durationHours}
              onChange={(event) => setDurationHours(event.target.value)}
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] sm:max-w-[200px]"
            >
              {DURATION_PRESETS.map((preset) => (
                <option key={preset.hours} value={preset.hours}>
                  {preset.label}
                </option>
              ))}
              <option value={CUSTOM_DURATION_VALUE}>Custom date/time…</option>
            </select>
            {durationHours === CUSTOM_DURATION_VALUE ? (
              <input
                type="datetime-local"
                required
                value={customExpiresAt}
                onChange={(event) => setCustomExpiresAt(event.target.value)}
                className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
              />
            ) : null}
          </div>
        </label>
      </div>

      {error ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-300">
          <ShieldAlert className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-400 disabled:opacity-60"
      >
        <KeyRound className="h-4 w-4" />
        {submitting ? "Creating…" : "Create Demo Access"}
      </button>
    </form>
  );
}

function ExtendControl({
  profileId,
  onDone,
}: {
  profileId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [durationHours, setDurationHours] = useState<string>(String(DURATION_PRESETS[1].hours));
  const [customExpiresAt, setCustomExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[color:var(--theme-border-soft)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--theme-text-secondary)] transition hover:border-orange-500/40 hover:text-orange-300"
      >
        Extend
      </button>
    );
  }

  async function handleExtend() {
    setError(null);
    const expiresAt =
      durationHours === CUSTOM_DURATION_VALUE
        ? customExpiresAt
          ? new Date(customExpiresAt).toISOString()
          : ""
        : new Date(Date.now() + Number(durationHours) * 60 * 60 * 1000).toISOString();

    if (!expiresAt) {
      setError("Choose an expiration date/time.");
      return;
    }

    setSubmitting(true);
    const result = await postJson("/api/ops/demo-access/extend", { profileId, expiresAt });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? "Failed to extend demo access.");
      return;
    }

    setOpen(false);
    onDone();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={durationHours}
          onChange={(event) => setDurationHours(event.target.value)}
          className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1.5 text-xs text-[color:var(--theme-text-primary)]"
        >
          {DURATION_PRESETS.map((preset) => (
            <option key={preset.hours} value={preset.hours}>
              +{preset.label}
            </option>
          ))}
          <option value={CUSTOM_DURATION_VALUE}>Custom date/time…</option>
        </select>
        {durationHours === CUSTOM_DURATION_VALUE ? (
          <input
            type="datetime-local"
            value={customExpiresAt}
            onChange={(event) => setCustomExpiresAt(event.target.value)}
            className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-1.5 text-xs text-[color:var(--theme-text-primary)]"
          />
        ) : null}
      </div>
      {error ? <p className="text-[11px] font-semibold text-red-300">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleExtend()}
          disabled={submitting}
          className="rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-orange-400 disabled:opacity-60"
        >
          {submitting ? "Extending…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[color:var(--theme-border-soft)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--theme-text-secondary)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RevokeButton({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    if (!window.confirm("Revoke this prospect's Demo Shop access immediately?")) return;
    setError(null);
    setSubmitting(true);
    const result = await postJson("/api/ops/demo-access/revoke", { profileId });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? "Failed to revoke demo access.");
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void handleRevoke()}
        disabled={submitting}
        className="rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
      >
        {submitting ? "Revoking…" : "Revoke"}
      </button>
      {error ? <p className="text-[11px] font-semibold text-red-300">{error}</p> : null}
    </div>
  );
}

export default function OpsDemoAccess({
  shop,
  prospects,
}: {
  shop: DemoShopContext;
  prospects: DemoProspect[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-400">
          <CircleDot className="h-4 w-4" />
          Demo Shop access
        </div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Temporary prospect access — {shop.shopDisplayName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
          Issues and revokes temporary owner accounts scoped to the one
          configured Demo Shop. Does not create shops or manage any other
          tenant.
        </p>
      </section>

      <CreateProspectForm onCreated={refresh} />

      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card">
        <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-4 sm:px-5">
          <h2 className="font-bold">Prospect accounts</h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            {prospects.length} temporary account{prospects.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="divide-y divide-[color:var(--theme-border-soft)]">
          {prospects.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[color:var(--theme-text-secondary)]">
              No temporary prospect accounts yet.
            </div>
          ) : (
            prospects.map((prospect) => (
              <div
                key={prospect.profileId}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {prospect.fullName ?? prospect.username ?? "Unnamed prospect"}
                    </p>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        stateTone(prospect.state),
                      )}
                    >
                      {prospect.state}
                    </span>
                  </div>
                  <p className="truncate text-xs text-[color:var(--theme-text-muted)]">
                    {prospect.email ?? "no contact email"}
                    {prospect.username ? ` · ${prospect.username}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                    <span>Created {formatDateTime(prospect.createdAt)}</span>
                    <span>Last sign-in {formatDateTime(prospect.lastSignInAt)}</span>
                    <span>Expires {formatDateTime(prospect.expiresAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <div className="flex gap-2">
                    <ExtendControl profileId={prospect.profileId} onDone={refresh} />
                    <RevokeButton profileId={prospect.profileId} onDone={refresh} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
