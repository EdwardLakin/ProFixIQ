"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { describePunchOff, type PunchOffResult, type CloseLineResult } from "@/features/equipment/dispatch/lib/punchOff";
import { WORKSPACE_ITEM as ITEM } from "@/features/workspace/components";

const FIELD =
  "mt-1 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-transparent px-3 py-2 text-sm";
const LABEL = "block text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]";
const PRIMARY =
  "min-h-11 rounded-lg bg-[color:var(--accent-copper)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

function newKey(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

async function post<T>(url: string, key: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Try again.");
  return payload;
}

/**
 * One key per attempt: a retry or double tap reuses it, so the command applies
 * once. Editing any field starts a new attempt, because the server rejects a
 * key reused with different content.
 */
function useAttemptKey(prefix: string) {
  const key = useRef<string | null>(null);
  return {
    get: () => (key.current ??= newKey(prefix)),
    reset: () => {
      key.current = null;
    },
  };
}

export function EquipmentPunchOffForm({
  lineId,
  closesLine,
  initialCause,
  initialCorrection,
}: {
  lineId: string;
  /** This punch-off is the last one, so it completes the line. */
  closesLine: boolean;
  initialCause: string | null;
  initialCorrection: string | null;
}) {
  const router = useRouter();
  const attempt = useAttemptKey(`punch-off-${lineId}`);
  const [cause, setCause] = useState(initialCause ?? "");
  const [correction, setCorrection] = useState(initialCorrection ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const missing = closesLine && (!cause.trim() || !correction.trim());

  async function submit() {
    if (busy || missing) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await post<PunchOffResult>("/api/equipment/punch-off", attempt.get(), {
        lineId,
        cause: cause.trim() || undefined,
        correction: correction.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      attempt.reset();
      setNotice({ tone: "ok", text: describePunchOff(result) });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Punch-off failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${ITEM} grid gap-3 p-4`} aria-label="Punch off this job">
      <div>
        <h2 className="text-base font-semibold">Punch off</h2>
        <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
          {closesLine
            ? "You are the last one on this job, so punching off completes the line."
            : "Other technicians are still working this job. Punching off ends your time only."}
        </p>
      </div>

      {closesLine ? (
        <>
          <label className={LABEL}>
            Cause
            <textarea
              className={FIELD}
              rows={2}
              value={cause}
              onChange={(event) => {
                setCause(event.target.value);
                attempt.reset();
              }}
            />
          </label>
          <label className={LABEL}>
            Correction
            <textarea
              className={FIELD}
              rows={2}
              value={correction}
              onChange={(event) => {
                setCorrection(event.target.value);
                attempt.reset();
              }}
            />
          </label>
        </>
      ) : null}

      <label className={LABEL}>
        Note (optional)
        <textarea
          className={FIELD}
          rows={2}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            attempt.reset();
          }}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={PRIMARY} disabled={busy || missing} onClick={() => void submit()}>
          {busy ? "Saving…" : closesLine ? "Punch off and complete line" : "Punch off"}
        </button>
        {missing ? (
          <span className="text-xs text-[color:var(--theme-text-muted)]">Cause and correction are required to complete the line.</span>
        ) : null}
      </div>
      <NoticeLine notice={notice} />
    </section>
  );
}

export function EquipmentCloseLineForm({
  lineId,
  initialCause,
  initialCorrection,
}: {
  lineId: string;
  initialCause: string | null;
  initialCorrection: string | null;
}) {
  const router = useRouter();
  const attempt = useAttemptKey(`close-line-${lineId}`);
  const [reason, setReason] = useState("");
  const [cause, setCause] = useState(initialCause ?? "");
  const [correction, setCorrection] = useState(initialCorrection ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const missing = reason.trim().length < 3 || !cause.trim() || !correction.trim();

  async function submit() {
    if (busy || missing) return;
    if (!window.confirm("Close this line for the technician? Running timers will be ended.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await post<CloseLineResult>("/api/equipment/punch-off/close", attempt.get(), {
        lineId,
        reason: reason.trim(),
        cause: cause.trim(),
        correction: correction.trim(),
      });
      attempt.reset();
      setNotice({
        tone: "ok",
        text:
          result.timersClosed > 0
            ? `Line closed. ${result.timersClosed} running timer${result.timersClosed === 1 ? "" : "s"} ended.`
            : "Line closed.",
      });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Close failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${ITEM} grid gap-3 p-4`} aria-label="Close this line for a technician">
      <div>
        <h2 className="text-base font-semibold">Close line for technician</h2>
        <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
          Use when a technician forgot to punch off. Their time is kept, running timers end now, and your reason is recorded.
        </p>
      </div>
      <label className={LABEL}>
        Reason
        <input
          className={FIELD}
          value={reason}
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            attempt.reset();
          }}
        />
      </label>
      <label className={LABEL}>
        Cause
        <textarea
          className={FIELD}
          rows={2}
          value={cause}
          onChange={(event) => {
            setCause(event.target.value);
            attempt.reset();
          }}
        />
      </label>
      <label className={LABEL}>
        Correction
        <textarea
          className={FIELD}
          rows={2}
          value={correction}
          onChange={(event) => {
            setCorrection(event.target.value);
            attempt.reset();
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={PRIMARY} disabled={busy || missing} onClick={() => void submit()}>
          {busy ? "Closing…" : "Close line"}
        </button>
      </div>
      <NoticeLine notice={notice} />
    </section>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role={notice.tone === "error" ? "alert" : "status"}
      className={`text-sm ${notice.tone === "error" ? "text-red-300" : "text-emerald-300"}`}
    >
      {notice.text}
    </p>
  );
}
