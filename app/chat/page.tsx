"use client";

import { useEffect, useState } from "react";
import PageShell from "@/features/shared/components/PageShell";
import InboxModal from "@/features/chat/components/InboxModal";

export default function ChatListPage(): JSX.Element {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(true);
  }, []);

  return (
    <PageShell title="Inbox">
      <div className="rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
        <p className="mb-3">Inbox is now layered as an operational modal so messaging stays in context.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded border border-[var(--accent-copper-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-copper-soft)] hover:bg-orange-500/10"
        >
          Open Inbox
        </button>
      </div>
      <InboxModal open={open} onClose={() => setOpen(false)} />
    </PageShell>
  );
}
