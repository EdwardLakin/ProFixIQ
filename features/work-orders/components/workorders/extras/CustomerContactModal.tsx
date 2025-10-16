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

export default function CustomerContactModal(props: any) {
  const {
    isOpen,
    onClose,
    customerName,
    customerEmail,
    customerPhone,
    onSendEmail,
    onSendSms,
  } = props as Props;

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sms, setSms] = useState("");

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Contact Customer"
      size="md"
      footerLeft={
        onSendSms ? (
          <button
            onClick={async () => {
              if (!sms.trim()) return;
              await onSendSms(sms.trim());
              setSms("");
            }}
            className="rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            disabled={!sms.trim()}
          >
            Send SMS {customerPhone ? `(${customerPhone})` : ""}
          </button>
        ) : null
      }
      onSubmit={
        onSendEmail
          ? async () => {
              if (!subject.trim() && !body.trim()) return;
              await onSendEmail(subject.trim(), body.trim());
              setSubject("");
              setBody("");
              onClose();
            }
          : undefined
      }
      submitText="Send Email"
    >
      <div className="mb-3 text-sm text-neutral-500">
        {customerName ? <span className="font-medium">{customerName}</span> : null}{" "}
        {customerEmail ? <span>• {customerEmail}</span> : null}
        {customerPhone ? <span> • {customerPhone}</span> : null}
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-neutral-400">Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
        />
      </label>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-neutral-400">Email Body</span>
        <textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
        />
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-neutral-400">SMS</span>
        <textarea
          rows={3}
          value={sms}
          onChange={(e) => setSms(e.target.value)}
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
          placeholder="Quick text message…"
        />
      </label>
    </ModalShell>
  );
}