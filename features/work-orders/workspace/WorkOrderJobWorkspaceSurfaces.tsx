"use client";

import Link from "next/link";
import { Camera, MessageSquare, MessageSquareText } from "lucide-react";

import WorkOrderMediaGallery from "@/features/work-orders/components/workorders/extras/WorkOrderMediaGallery";

const actionClassName =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60";

export function WorkOrderJobCommunicationWorkspace({
  jobLabel,
  customerMessageHref = null,
  onOpenJobChat,
  disabled = false,
}: {
  jobLabel: string;
  customerMessageHref?: string | null;
  onOpenJobChat: () => void;
  disabled?: boolean;
}) {
  return (
    <section>
      <div className="mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
          Communication
        </div>
        <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
          Keep this job in context
        </h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <MessageSquare className="h-5 w-5 text-sky-300" aria-hidden="true" />
          <h4 className="mt-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Job conversation
          </h4>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            Start or continue an internal conversation anchored to {jobLabel}.
          </p>
          <button
            type="button"
            className={`${actionClassName} mt-4`}
            onClick={onOpenJobChat}
            disabled={disabled}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            Open job chat
          </button>
        </article>

        <article className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
          <MessageSquareText
            className="h-5 w-5 text-[color:var(--brand-primary)]"
            aria-hidden="true"
          />
          <h4 className="mt-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Customer update
          </h4>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            {customerMessageHref
              ? "Open the existing customer conversation with this Work Order attached."
              : "Customer messaging is not available for this job or role."}
          </p>
          {customerMessageHref ? (
            <Link
              href={customerMessageHref}
              className={`${actionClassName} mt-4`}
            >
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
              Message customer
            </Link>
          ) : null}
        </article>
      </div>
    </section>
  );
}

export function WorkOrderJobDocumentsWorkspace({
  workOrderId,
  workOrderLineId,
  refreshKey,
  onAddMedia,
  disabled = false,
}: {
  workOrderId: string;
  workOrderLineId: string;
  refreshKey: number;
  onAddMedia: () => void;
  disabled?: boolean;
}) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            Documents &amp; evidence
          </div>
          <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
            Job photos, videos, and markup
          </h3>
        </div>
        <button
          type="button"
          className={actionClassName}
          onClick={onAddMedia}
          disabled={disabled}
        >
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Add photo or video
        </button>
      </div>

      <WorkOrderMediaGallery
        workOrderId={workOrderId}
        workOrderLineId={workOrderLineId}
        refreshKey={refreshKey}
      />
    </section>
  );
}
