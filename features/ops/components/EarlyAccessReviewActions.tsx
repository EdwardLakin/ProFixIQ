"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, RefreshCw, ShieldAlert, X } from "lucide-react";

type ApprovalResponse = {
  ok?: boolean;
  error?: string;
  token?: string;
  expiresAt?: string;
  reissued?: boolean;
};

async function post(url: string): Promise<ApprovalResponse> {
  try {
    const response = await fetch(url, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as ApprovalResponse;
    if (!response.ok) return { ok: false, error: data.error ?? "Request failed." };
    return { ...data, ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed.",
    };
  }
}

export default function EarlyAccessReviewActions({
  applicationId,
  mode = "review",
}: {
  applicationId: string;
  mode?: "review" | "reissue";
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function approve() {
    setSubmitting("approve");
    setError(null);
    const result = await post(`/api/ops/early-access/${applicationId}/approve`);
    setSubmitting(null);
    if (!result.ok || !result.token) {
      setError(result.error ?? "Failed to issue approval link.");
      return;
    }

    setApprovalUrl(`${window.location.origin}/early-access/approved?token=${encodeURIComponent(result.token)}`);
    setExpiresAt(result.expiresAt ?? null);
  }

  async function decline() {
    setSubmitting("decline");
    setError(null);
    const result = await post(`/api/ops/early-access/${applicationId}/decline`);
    setSubmitting(null);
    if (!result.ok) {
      setError(result.error ?? "Failed to decline application.");
      return;
    }
    router.refresh();
  }

  async function copyLink() {
    if (!approvalUrl) return;
    try {
      await navigator.clipboard.writeText(approvalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed. Select the link manually.");
    }
  }

  if (approvalUrl) {
    return (
      <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
          <Check className="h-4 w-4" /> {mode === "reissue" ? "Private link reissued" : "Approved"}
        </div>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          Send this private signup link to the applicant. Any previously issued link for this grant is now invalid. This link expires
          {expiresAt ? ` ${new Date(expiresAt).toLocaleDateString("en-CA")}` : " after the approval window"}.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={approvalUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]"
          />
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-bold text-emerald-300"
          >
            <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting !== null}
          onClick={approve}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {mode === "reissue" ? <RefreshCw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {submitting === "approve"
            ? mode === "reissue"
              ? "Reissuing…"
              : "Approving…"
            : mode === "reissue"
              ? "Reissue private signup link"
              : "Approve — 30% × 6 months"}
        </button>
        {mode === "review" ? (
          <button
            type="button"
            disabled={submitting !== null}
            onClick={decline}
            className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-bold text-[color:var(--theme-text-secondary)] transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" />
            {submitting === "decline" ? "Declining…" : "Decline"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-red-300">
          <ShieldAlert className="h-3.5 w-3.5" /> {error}
        </p>
      ) : null}
    </div>
  );
}
