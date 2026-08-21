"use client";

import { useMemo, useState } from "react";

import InboxModal from "@/features/chat/components/InboxModal";
import PageShell from "@/features/shared/components/PageShell";

type ChatListClientProps = {
  startCustomerCompose: boolean;
  contextType?: "vehicle" | "work_order" | null;
  contextId: string | null;
  customerId: string | null;
};

export default function ChatListClient({
  startCustomerCompose,
  contextType = "vehicle",
  contextId,
  customerId,
}: ChatListClientProps): JSX.Element {
  const [open, setOpen] = useState(true);
  const contextOverride = useMemo(
    () =>
      startCustomerCompose && contextId
        ? {
            context_type: contextType ?? "vehicle",
            context_id: contextId,
            deep_link:
              contextType === "work_order"
                ? `/work-orders/${contextId}`
                : `/vehicles/${contextId}`,
            context_label:
              contextType === "work_order"
                ? "Work order workspace"
                : "Vehicle workspace",
          }
        : null,
    [contextId, contextType, startCustomerCompose],
  );

  return (
    <PageShell title="Inbox">
      <div className="rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
        <p className="mb-3">
          Inbox is now layered as an operational modal so messaging stays in
          context.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-[var(--accent-copper-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-copper-soft)] hover:bg-orange-500/10"
        >
          Open Inbox
        </button>
      </div>
      <InboxModal
        open={open}
        onClose={() => setOpen(false)}
        startNew={startCustomerCompose}
        initialCustomerId={customerId}
        contextOverride={contextOverride}
      />
    </PageShell>
  );
}
