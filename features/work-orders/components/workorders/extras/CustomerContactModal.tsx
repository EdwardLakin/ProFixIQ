// features/work-orders/components/workorders/CustomerContactModal.tsx
"use client";

import { useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  onSendEmail?: (subject: string, body: string) => void | Promise<void>;
  onSendSms?: (message: string) => void | Promise<void>;
}

export default function CustomerContactModal({
  isOpen,
  onClose,
  customerName,
  customerEmail,
  customerPhone,
  onSendEmail,
  onSendSms,
}: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sms, setSms] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const canSendEmail = !!onSendEmail && (subject.trim() || body.trim());
  const canSendSms = !!onSendSms && sms.trim().length > 0;

  const handleSendSms = async () => {
    if (!onSendSms || !canSendSms) return;
    setSendingSms(true);
    try {
      await onSendSms(sms.trim());
      setSms("");
    } finally {
      setSendingSms(false);
    }
  };

  const handleSendEmail = onSendEmail
    ? async () => {
        if (!canSendEmail) return;
        setSendingEmail(true);
        try {
          await onSendEmail(subject.trim(), body.trim());
          setSubject("");
          setBody("");
          onClose();
        } finally {
          setSendingEmail(false);
        }
      }
    : undefined;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Contact Customer"
      size="md"
      footerLeft={
        onSendSms ? (
          <button
            type="button"
            onClick={() => void handleSendSms()}
            className="rounded border border-emerald-500/70 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
            disabled={!canSendSms || sendingSms}
          >
            {sendingSms ? "Sending SMS…" : "Send SMS"}{" "}
            {customerPhone ? `(${customerPhone})` : ""}
          </button>
        ) : null
      }
      onSubmit={handleSendEmail}
      submitText={sendingEmail ? "Sending…" : "Send Email"}
    >
      <div className="mb-3 text-sm text-muted-foreground">
        {customerName ? (
          <span className="font-medium text-foreground">{customerName}</span>
        ) : null}{" "}
        {customerEmail ? <span>• {customerEmail}</span> : null}
        {customerPhone ? <span> • {customerPhone}</span> : null}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Subject
        </span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          placeholder="Subject line…"
        />
      </label>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Email Body
        </span>
        <textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          placeholder="Write your email to the customer…"
        />
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          SMS
        </span>
        <textarea
          rows={3}
          value={sms}
          onChange={(e) => setSms(e.target.value)}
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          placeholder="Quick text message…"
        />
      </label>
    </ModalShell>
  );
}