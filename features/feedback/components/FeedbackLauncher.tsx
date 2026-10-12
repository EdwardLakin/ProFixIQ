"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";

import FeedbackModal from "@/features/feedback/components/FeedbackModal";

/**
 * Feedback entry point for authenticated routes that intentionally render
 * outside the desktop AppShell (mobile, customer portal, and Ops surfaces).
 */
export default function FeedbackLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[70] inline-flex items-center gap-2 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-xs font-bold text-[color:var(--theme-text-primary)] shadow-lg backdrop-blur transition hover:border-orange-500/50 hover:bg-orange-500/10 sm:bottom-5 sm:right-5"
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-4 w-4 text-orange-400" />
        <span className="hidden sm:inline">Feedback</span>
      </button>
      <FeedbackModal open={open} onOpenChange={setOpen} />
    </>
  );
}
