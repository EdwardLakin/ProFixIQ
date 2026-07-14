"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ShopReelDraftDto, ShopReelOpportunityDto } from "../types";

type Props = {
  opportunities: ShopReelOpportunityDto[];
  drafts: ShopReelDraftDto[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function ShopReelLifecycleQueue({ opportunities, drafts }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const draftByOpportunity = useMemo(() => {
    return new Map(drafts.map((draft) => [draft.opportunityId, draft]));
  }, [drafts]);

  async function runOpportunityAction(opportunityId: string, action: "accepted" | "dismissed" | "generated") {
    setBusyId(opportunityId);
    try {
      await fetch("/api/shopreel/opportunities/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId, action }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function createDraft(opportunityId: string) {
    setBusyId(opportunityId);
    try {
      await fetch("/api/shopreel/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function updateDraft(draftId: string, payload: Record<string, string>) {
    setBusyId(draftId);
    try {
      await fetch(`/api/shopreel/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 text-[color:var(--theme-text-primary)]">
        <h2 className="text-lg font-semibold">Opportunity queue</h2>
        <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">Canonical lifecycle queue for source-derived opportunities.</p>

        <div className="mt-4 space-y-3">
          {opportunities.length ? (
            opportunities.map((opportunity) => {
              const linkedDraft = draftByOpportunity.get(opportunity.id) ?? null;

              return (
                <div key={opportunity.id} className="rounded-lg border border-[color:var(--theme-border-soft)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{opportunity.title}</div>
                      <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{opportunity.eventType} · status {opportunity.status}</div>
                    </div>
                    <div className="text-xs text-[color:var(--theme-text-muted)]">{formatDate(opportunity.sourceOccurredAt)}</div>
                  </div>

                  {opportunity.angle ? <div className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">Angle: {opportunity.angle}</div> : null}
                  {opportunity.summary ? <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{opportunity.summary}</div> : null}

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      className="rounded-md border border-emerald-400/40 px-2 py-1 text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-60"
                      onClick={() => runOpportunityAction(opportunity.id, "accepted")}
                      disabled={busyId === opportunity.id}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-rose-400/40 px-2 py-1 text-rose-100 hover:bg-rose-500/10 disabled:opacity-60"
                      onClick={() => runOpportunityAction(opportunity.id, "dismissed")}
                      disabled={busyId === opportunity.id}
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-sky-400/40 px-2 py-1 text-sky-100 hover:bg-sky-500/10 disabled:opacity-60"
                      onClick={() => createDraft(opportunity.id)}
                      disabled={busyId === opportunity.id || (opportunity.status !== "accepted" && opportunity.status !== "generated")}
                    >
                      {linkedDraft ? "Open draft" : "Generate draft"}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-[color:var(--theme-border-soft)] p-3 text-sm text-[color:var(--theme-text-muted)]">No lifecycle opportunities yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 text-[color:var(--theme-text-primary)]">
        <h2 className="text-lg font-semibold">Draft review</h2>
        <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">Minimal build entity tied to accepted/generated opportunities.</p>

        <div className="mt-4 space-y-3">
          {drafts.length ? (
            drafts.map((draft) => (
              <form
                key={draft.id}
                className="space-y-2 rounded-lg border border-[color:var(--theme-border-soft)] p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  updateDraft(draft.id, {
                    title: String(formData.get("title") ?? ""),
                    angle: String(formData.get("angle") ?? ""),
                    script: String(formData.get("script") ?? ""),
                    status: String(formData.get("status") ?? "draft"),
                  });
                }}
              >
                <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--theme-text-muted)]">
                  <span>Status: {draft.status}</span>
                  <span>Updated: {formatDate(draft.updatedAt)}</span>
                </div>

                <input
                  name="title"
                  defaultValue={draft.title}
                  className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)]"
                  placeholder="Draft title"
                />
                <input
                  name="angle"
                  defaultValue={draft.angle ?? ""}
                  className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)]"
                  placeholder="Angle"
                />
                <textarea
                  name="script"
                  rows={3}
                  defaultValue={draft.script ?? ""}
                  className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)]"
                  placeholder="Script"
                />
                <select
                  name="status"
                  defaultValue={draft.status}
                  className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)]"
                >
                  <option value="draft">draft</option>
                  <option value="in_review">in_review</option>
                  <option value="approved">approved</option>
                </select>
                <button
                  type="submit"
                  disabled={busyId === draft.id}
                  className="rounded-md border border-[color:var(--theme-border-soft)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
                >
                  Save draft
                </button>
              </form>
            ))
          ) : (
            <div className="rounded-md border border-[color:var(--theme-border-soft)] p-3 text-sm text-[color:var(--theme-text-muted)]">No drafts created yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}
