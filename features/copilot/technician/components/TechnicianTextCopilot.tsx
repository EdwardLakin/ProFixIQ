"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Mic, Square, VolumeX } from "lucide-react";

import { useTechnicianInteractionGateway } from "@/features/copilot/technician/voice/useTechnicianInteractionGateway";
import {
  describeNewTechnicianAssignments,
  detectNewTechnicianAssignments,
  type AnnouncementAgendaItem,
} from "@/features/copilot/technician/client/dayAgendaAnnouncements";
import {
  describeNewTechnicianMessages,
  detectNewTechnicianMessages,
  type ConversationDigestItem,
} from "@/features/copilot/technician/client/messageAnnouncements";
import { useTechnicianMessageWatch } from "@/features/copilot/technician/client/useTechnicianMessageWatch";
import { useOperationsLiveRefresh } from "@/features/work-orders/hooks/useOperationsLiveRefresh";
import { cn } from "@/features/shared/utils/cn";

type Turn = {
  eventId: string;
  role: "user" | "assistant";
  text: string;
  turnId: string | null;
};

type TimelineEntry = {
  eventId: string;
  label: string;
  occurredAt: string;
};

type Context = {
  currentTask: string | null;
  complaint: string | null;
  conversation: Turn[];
  observations: Array<{
    eventId: string;
    text: string;
    assessment: "abnormal" | "normal" | "unknown" | null;
  }>;
  findings: Array<{
    eventId: string;
    text: string;
    disposition: "suspected" | "confirmed" | "ruled_out" | "normal";
  }>;
  measurements: Array<{
    eventId: string;
    label: string;
    value: string;
    unit: string | null;
  }>;
  dtcs: Array<{ eventId: string; code: string }>;
  documentation: {
    capturedEventCount: number;
    lastCapturedAt: string | null;
    repairNoteDraft: string;
    timeline: TimelineEntry[];
  };
};

type WorkOrder = {
  customId: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleUnitNumber: string | null;
};

type Snapshot = {
  sessionId?: string | null;
  session?: { id: string } | null;
  context: Context | null;
  workOrder: WorkOrder | null;
  capabilities?: { documentation: boolean; voice?: boolean };
  reply?: string;
  /**
   * Deterministic "here's your day" opening line, present only when there's
   * no active repair session yet. Not a model reply — see
   * describeTechnicianDayAgenda.
   */
  greeting?: string | null;
  error?: string;
  shopId?: string | null;
  /** The technician's full assigned queue, refreshed on every fetch — used
   * to notice newly-assigned work while the CoPilot is already open. */
  dayAgenda?: { items: AnnouncementAgendaItem[] } | null;
  /** The technician's conversations with their latest message, refreshed on
   * every fetch — used to notice a new incoming message. */
  conversationDigest?: ConversationDigestItem[] | null;
};

type InputMode = "ui" | "voice";

type TurnRequest = {
  message: string;
  sessionId: string | null;
  turnId: string;
  inputMode: InputMode;
  recentConversations: { conversationId: string; title: string | null }[];
};

const COPILOT_TURN_TIMEOUT_MS = 45_000;
const RECOVERABLE_TURN_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

class TechnicianCopilotTurnRequestError extends Error {
  readonly recoverable: boolean;

  constructor(message: string, recoverable: boolean) {
    super(message);
    this.name = "TechnicianCopilotTurnRequestError";
    this.recoverable = recoverable;
  }
}

function sameTurnInput(
  request: TurnRequest,
  message: string,
  inputMode: InputMode,
) {
  return request.message === message && request.inputMode === inputMode;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function voiceStatus(phase: ReturnType<typeof useTechnicianInteractionGateway>["phase"]) {
  if (phase === "connecting") return "Connecting microphone…";
  if (phase === "listening") return "Listening…";
  if (phase === "thinking") return "CoPilot is thinking…";
  if (phase === "speaking") return "CoPilot is replying…";
  if (phase === "error") return "Voice stopped";
  return "Voice ready";
}

export function TechnicianTextCopilot({
  embedded = false,
  active = true,
  compact = false,
}: {
  embedded?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    context: null,
    workOrder: null,
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingTurnRef = useRef<TurnRequest | null>(null);

  // Tracks the assigned-line IDs seen on the last agenda fetch so a new
  // fetch can tell "just assigned" apart from "already knew about this".
  // Starts null so the very first fetch establishes a baseline instead of
  // announcing the technician's entire existing queue as if it were new.
  const previousAssignmentIdsRef = useRef<Set<string> | null>(null);
  // Same idea, keyed by conversation id -> its latest message id, so a
  // conversation whose latest message changes is noticed as a new message.
  const previousMessageIdsRef = useRef<Map<string, string> | null>(null);
  // Accumulates new-assignment/new-message items across fetches until
  // they're actually delivered, so a second realtime tick before delivery
  // adds to the announcement instead of replacing or losing the first one.
  const pendingAssignmentItemsRef = useRef<AnnouncementAgendaItem[]>([]);
  const pendingMessageItemsRef = useRef<ConversationDigestItem[]>([]);
  // The conversation(s) from the most recent new-message notice, sent back
  // on every subsequent turn so "reply: ..." has something concrete and
  // real to target — never a conversation the technician wasn't actually
  // just told about. Replaced (not merged) by the next notice, and persists
  // across turns until then so a few back-and-forth turns composing a
  // reply don't lose the target.
  const recentConversationsRef = useRef<
    { conversationId: string; title: string | null }[]
  >([]);
  const [pendingAnnouncement, setPendingAnnouncement] = useState<string | null>(
    null,
  );
  const [notices, setNotices] = useState<string[]>([]);

  const updatePendingAnnouncement = useCallback(() => {
    const combined = [
      describeNewTechnicianAssignments(pendingAssignmentItemsRef.current),
      describeNewTechnicianMessages(pendingMessageItemsRef.current),
    ]
      .filter((text): text is string => Boolean(text))
      .join(" ");
    setPendingAnnouncement(combined || null);
  }, []);

  const ingestDayAgenda = useCallback(
    (dayAgenda: Snapshot["dayAgenda"]) => {
      const items = dayAgenda?.items ?? [];
      const newlyAssigned = detectNewTechnicianAssignments(
        previousAssignmentIdsRef.current,
        items,
      );
      previousAssignmentIdsRef.current = new Set(
        items.map((item) => item.workOrderLineId),
      );
      if (newlyAssigned.length === 0) return;
      pendingAssignmentItemsRef.current = [
        ...pendingAssignmentItemsRef.current,
        ...newlyAssigned,
      ];
      updatePendingAnnouncement();
    },
    [updatePendingAnnouncement],
  );

  const ingestConversationDigest = useCallback(
    (conversationDigest: Snapshot["conversationDigest"]) => {
      const items = conversationDigest ?? [];
      const newMessages = detectNewTechnicianMessages(
        previousMessageIdsRef.current,
        items,
      );
      previousMessageIdsRef.current = new Map(
        items.map((item) => [item.conversationId, item.latestMessageId]),
      );
      if (newMessages.length === 0) return;
      pendingMessageItemsRef.current = [
        ...pendingMessageItemsRef.current,
        ...newMessages,
      ];
      recentConversationsRef.current = newMessages.map((item) => ({
        conversationId: item.conversationId,
        title: item.title,
      }));
      updatePendingAnnouncement();
    },
    [updatePendingAnnouncement],
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/copilot/technician/session", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as Snapshot;
        if (!response.ok) {
          throw new Error(body.error || "Unable to load CoPilot.");
        }
        if (!cancelled) {
          setSnapshot(body);
          ingestDayAgenda(body.dayAgenda);
          ingestConversationDigest(body.conversationDigest);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "Unable to load CoPilot.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ingestConversationDigest, ingestDayAgenda]);

  const refreshCopilotSignals = useCallback(async () => {
    try {
      const response = await fetch("/api/copilot/technician/session", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as Snapshot;
      ingestDayAgenda(body.dayAgenda);
      ingestConversationDigest(body.conversationDigest);
    } catch {
      // Best-effort background refresh: a missed tick just means the next
      // realtime event, or the technician's next turn, tries again.
    }
  }, [ingestConversationDigest, ingestDayAgenda]);

  const sessionId = snapshot.session?.id ?? snapshot.sessionId ?? null;
  const documentationEnabled =
    snapshot.capabilities?.documentation !== false;
  const voiceEnabled = snapshot.capabilities?.voice === true;
  // The greeting only applies before the technician has said anything —
  // once there's a real reply or conversation history it should never
  // resurface, even if a stale snapshot still carries it.
  const idleGreeting =
    !snapshot.reply && !snapshot.context?.conversation?.length
      ? snapshot.greeting?.trim() || null
      : null;

  // Notices a new assignment the moment it lands, whether or not a job is
  // already active, by re-fetching the agenda whenever the shop's work
  // orders/lines change. Reuses the same shop-scoped realtime hook the
  // operations dashboard already relies on rather than standing up a new
  // subscription — this table set is already proven to be realtime-enabled.
  useOperationsLiveRefresh({
    shopId: active ? (snapshot.shopId ?? null) : null,
    onRefresh: () => void refreshCopilotSignals(),
  });

  // Same idea for messages: watch exactly the conversations the technician
  // is currently in (mirroring the chat inbox's own proven per-conversation
  // realtime filter) and re-fetch on any new message.
  const conversationIds = useMemo(
    () =>
      (snapshot.conversationDigest ?? []).map((item) => item.conversationId),
    [snapshot.conversationDigest],
  );
  useTechnicianMessageWatch({
    conversationIds: active ? conversationIds : [],
    onMessage: () => void refreshCopilotSignals(),
  });

  const applyTurnSnapshot = useCallback((body: Snapshot) => {
    setSnapshot((current) => ({
      ...current,
      ...body,
      session:
        Object.prototype.hasOwnProperty.call(body, "session")
          ? body.session
          : body.sessionId
            ? { id: body.sessionId }
            : current.session,
    }));
  }, []);

  const requestTurn = useCallback(async (request: TurnRequest) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      COPILOT_TURN_TIMEOUT_MS,
    );

    try {
      const response = await fetch("/api/copilot/technician/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(request),
      });
      const body = (await response.json()) as Snapshot;
      if (!response.ok) {
        const recoverable = RECOVERABLE_TURN_STATUSES.has(response.status);
        if (recoverable) {
          pendingTurnRef.current = request;
        } else if (pendingTurnRef.current?.turnId === request.turnId) {
          pendingTurnRef.current = null;
        }
        throw new TechnicianCopilotTurnRequestError(
          body.error || "CoPilot could not process that turn.",
          recoverable,
        );
      }

      if (pendingTurnRef.current?.turnId === request.turnId) {
        pendingTurnRef.current = null;
      }
      return body;
    } catch (reason) {
      if (reason instanceof TechnicianCopilotTurnRequestError) throw reason;

      // Aborting the browser request does not cancel the server operation. Keep
      // the exact turn key so the next attempt reconciles the persisted result
      // instead of issuing a second mutation under a fresh idempotency key.
      pendingTurnRef.current = request;
      if (controller.signal.aborted) {
        throw new TechnicianCopilotTurnRequestError(
          "CoPilot took too long to respond. Please try again; the same turn will resume safely.",
          true,
        );
      }
      throw new TechnicianCopilotTurnRequestError(
        "The CoPilot connection was interrupted. Please try again; the same turn will resume safely.",
        true,
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  const sendTurn = useCallback(
    async (text: string, inputMode: InputMode): Promise<Snapshot> => {
      const normalized = text.trim();
      if (!normalized) {
        throw new Error("CoPilot turn is empty.");
      }
      if (busy) {
        throw new Error("CoPilot is already processing a turn.");
      }

      setBusy(true);
      setError(null);
      try {
        let activeSessionId = sessionId;
        const pending = pendingTurnRef.current;
        if (pending) {
          const reconciled = await requestTurn(pending);
          applyTurnSnapshot(reconciled);
          activeSessionId =
            reconciled.session?.id ?? reconciled.sessionId ?? activeSessionId;
          if (sameTurnInput(pending, normalized, inputMode)) {
            return reconciled;
          }
        }

        const body = await requestTurn({
          message: normalized,
          sessionId: activeSessionId,
          turnId: crypto.randomUUID(),
          inputMode,
          recentConversations: recentConversationsRef.current,
        });
        applyTurnSnapshot(body);
        return body;
      } catch (reason) {
        const failure =
          reason instanceof Error
            ? reason
            : new Error("CoPilot could not process that turn.");
        setError(failure.message);
        throw failure;
      } finally {
        setBusy(false);
      }
    },
    [applyTurnSnapshot, busy, requestTurn, sessionId],
  );

  const handleVoiceUtterance = useCallback(
    async (text: string) => {
      const result = await sendTurn(text, "voice");
      return { reply: result.reply };
    },
    [sendTurn],
  );

  const voice = useTechnicianInteractionGateway({
    enabled: voiceEnabled,
    autoStart: active,
    onUtterance: handleVoiceUtterance,
    greeting: idleGreeting,
  });

  useEffect(() => {
    if (!active && voice.active) voice.stop();
  }, [active, voice]);

  // Delivers a queued "you've just been assigned..."/"new message..." notice
  // at the next safe turn boundary instead of interrupting speech or an
  // in-flight turn. With voice active, that means waiting for the gateway
  // to report "listening" (mic open, nothing being said or spoken) before
  // speaking it — voice.announce() itself refuses anything else. Without
  // voice active, it only needs the text turn to be free. Either way it's
  // always also added to the visible notice list so it isn't voice-only.
  useEffect(() => {
    if (!pendingAnnouncement) return;
    if (voice.active) {
      if (voice.phase !== "listening") return;
      if (!voice.announce(pendingAnnouncement)) return;
    } else if (busy) {
      return;
    }
    setNotices((current) => [...current, pendingAnnouncement]);
    pendingAssignmentItemsRef.current = [];
    pendingMessageItemsRef.current = [];
    setPendingAnnouncement(null);
  }, [pendingAnnouncement, voice, busy]);

  const vehicleLabel = useMemo(() => {
    const workOrder = snapshot.workOrder;
    if (!workOrder) return null;
    const vehicle = [
      workOrder.vehicleYear,
      workOrder.vehicleMake,
      workOrder.vehicleModel,
    ]
      .filter(Boolean)
      .join(" ");
    const unit = workOrder.vehicleUnitNumber
      ? `Unit ${workOrder.vehicleUnitNumber}`
      : "";
    return [workOrder.customId, vehicle, unit].filter(Boolean).join(" · ");
  }, [snapshot.workOrder]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy || voice.active) return;
    setMessage("");
    try {
      await sendTurn(text, "ui");
    } catch {
      // sendTurn already surfaced the user-facing error.
    }
  }

  if (loading) {
    return (
      <main
        className={cn(
          "mx-auto max-w-4xl p-4 text-sm text-[color:var(--theme-text-secondary)]",
          embedded && "flex h-full items-center justify-center",
          compact && "min-h-20",
        )}
      >
        Connecting Technician CoPilot…
      </main>
    );
  }

  const recentTimeline = snapshot.context?.documentation.timeline.slice(-8) ?? [];
  const latestAssistantReply =
    snapshot.reply?.trim() ||
    [...(snapshot.context?.conversation ?? [])]
      .reverse()
      .find((turn) => turn.role === "assistant")
      ?.text.trim() ||
    snapshot.greeting?.trim() ||
    null;
  const visibleVoiceError = voice.error ?? error;
  const voiceContinuityMessage = voice.active
    ? voice.wakeLockActive
      ? "AI-generated voice · Screen stays awake while voice is active."
      : "AI-generated voice · Keep this screen on; locking the phone pauses Safari voice."
    : "Replies use an AI-generated voice.";

  if (compact) {
    return (
      <main className="h-full min-h-0 overflow-y-auto p-3 text-[color:var(--theme-text-primary)]">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                voice.phase === "listening"
                  ? "animate-pulse bg-emerald-400"
                  : voice.phase === "thinking" || voice.phase === "speaking"
                    ? "animate-pulse bg-sky-400"
                    : voice.phase === "error"
                      ? "bg-rose-400"
                      : "bg-[color:var(--theme-text-muted)]",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold" aria-live="polite">
                {voiceEnabled
                  ? voiceStatus(voice.phase)
                  : "Voice is not enabled for this technician"}
              </div>
              {vehicleLabel ? (
                <div className="truncate text-xs text-[color:var(--theme-text-secondary)]">
                  {vehicleLabel}
                </div>
              ) : null}
              {voiceEnabled ? (
                <div className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                  {voiceContinuityMessage}
                </div>
              ) : null}
            </div>
            {voiceEnabled ? (
              <button
                type="button"
                disabled={busy && !voice.active}
                onClick={() =>
                  voice.active ? voice.stop() : void voice.start()
                }
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  borderColor: "var(--theme-border-soft)",
                  background: "var(--theme-surface-panel)",
                }}
              >
                {voice.active ? (
                  <Square className="h-4 w-4" aria-hidden />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden />
                )}
                {voice.active ? "Stop" : "Start"}
              </button>
            ) : null}
          </div>

          {voice.heardTranscript ? (
            <div
              className="rounded-xl px-3 py-2 text-sm"
              style={{ background: "var(--theme-surface-subtle)" }}
            >
              <span className="font-semibold">You:</span>{" "}
              {voice.heardTranscript}
            </div>
          ) : null}

          {notices.length > 0 ? (
            <div
              className="rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--theme-border-soft)",
                background: "var(--theme-surface-subtle)",
              }}
              aria-live="polite"
            >
              <span className="font-semibold">Heads up:</span>{" "}
              {notices[notices.length - 1]}
            </div>
          ) : null}

          {latestAssistantReply ? (
            <div
              className="max-h-24 overflow-y-auto rounded-xl px-3 py-2 text-sm"
              style={{ background: "var(--theme-surface-panel)" }}
              aria-live="polite"
            >
              <span className="font-semibold">CoPilot:</span>{" "}
              {latestAssistantReply}
            </div>
          ) : null}

          {visibleVoiceError ? (
            <div className="text-sm text-rose-400" role="alert">
              {visibleVoiceError}
            </div>
          ) : null}

          {voice.phase === "speaking" ? (
            <button
              type="button"
              onClick={voice.interrupt}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{
                borderColor: "var(--theme-border-soft)",
                background: "var(--theme-surface-panel)",
              }}
            >
              <VolumeX className="h-4 w-4" aria-hidden />
              Interrupt reply
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main
      className={cn(
        "mx-auto flex max-w-4xl flex-col gap-4 p-4",
        embedded
          ? "h-full min-h-0 overflow-y-auto pb-4"
          : "min-h-[100dvh] pb-28",
      )}
    >
      <header className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {embedded
            ? "Persistent repair collaborator"
            : "Phase 4 Preview · Text + realtime voice + silent documentation"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold">Technician CoPilot</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Work naturally. Text and voice use the same persistent Repair Session
          while the documentation engine quietly structures the repair record.
        </p>
        {vehicleLabel ? (
          <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm font-medium">
            {vehicleLabel}
          </div>
        ) : null}
      </header>

      {voiceEnabled ? (
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Voice collaborator
              </div>
              <div className="mt-1 text-sm font-medium" aria-live="polite">
                {voiceStatus(voice.phase)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Realtime transcription feeds the same CoPilot turn runtime. The
                mic pauses while the persisted reply is spoken, then resumes.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {voiceContinuityMessage}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy && !voice.active}
                onClick={() =>
                  voice.active ? voice.stop() : void voice.start()
                }
                className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {voice.active ? (
                  <Square className="h-4 w-4" aria-hidden />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden />
                )}
                {voice.active ? "Stop voice" : "Start voice"}
              </button>
              {voice.phase === "speaking" ? (
                <button
                  type="button"
                  onClick={voice.interrupt}
                  className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2 text-sm font-medium"
                >
                  <VolumeX className="h-4 w-4" aria-hidden />
                  Interrupt reply
                </button>
              ) : null}
            </div>
          </div>
          {voice.heardTranscript ? (
            <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm">
              Heard: “{voice.heardTranscript}”
            </div>
          ) : null}
          {voice.error ? (
            <div className="mt-3 text-sm text-destructive" role="alert">
              {voice.error}
            </div>
          ) : null}
        </section>
      ) : null}

      {notices.length > 0 ? (
        <section className="rounded-2xl border bg-card p-4" aria-live="polite">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Heads up
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {notices.map((notice, index) => (
              <li key={`${index}-${notice}`}>{notice}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {!documentationEnabled ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Silent documentation is disabled for this technician. Conversation
          remains available, and no structured repair facts will be added.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="flex min-h-[42vh] flex-col gap-3 rounded-2xl border bg-card p-4">
        {!snapshot.context?.conversation.length ? (
          <div className="my-auto text-center text-sm text-muted-foreground">
            Start naturally: “What do I have?” or “Start the Ford.”
          </div>
        ) : (
          snapshot.context.conversation.map((turn) => (
            <div
              key={turn.eventId}
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                turn.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted"
              }`}
            >
              {turn.text}
            </div>
          ))
        )}
      </section>

      {snapshot.context ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current repair memory
              </div>
              <div className="mt-2 text-sm">
                <span className="font-medium">Task:</span>{" "}
                {snapshot.context.currentTask ?? "Not established"}
              </div>
              <div className="mt-1 text-sm">
                <span className="font-medium">Complaint:</span>{" "}
                {snapshot.context.complaint ?? "None captured"}
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Structured documentation
              </div>
              <div className="mt-2 text-sm">
                {snapshot.context.observations.length} observations ·{" "}
                {snapshot.context.findings.length} findings ·{" "}
                {snapshot.context.measurements.length} measurements ·{" "}
                {snapshot.context.dtcs.length} DTCs
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {snapshot.context.documentation.capturedEventCount} structured
                timeline events captured in this session.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Draft repair note
              </div>
              <div className="text-xs text-muted-foreground">
                Session draft only · not written to the work order
              </div>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6">
              {snapshot.context.documentation.repairNoteDraft}
            </pre>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Intelligent repair timeline
            </div>
            {!recentTimeline.length ? (
              <div className="mt-3 text-sm text-muted-foreground">
                The timeline will build as repair facts are captured.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {recentTimeline.map((entry) => (
                  <div key={entry.eventId} className="flex gap-3 text-sm">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {timeLabel(entry.occurredAt)}
                    </span>
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      <form
        onSubmit={send}
        className={cn(
          "border-t bg-background/95 p-3 backdrop-blur",
          embedded
            ? "sticky bottom-0 z-20 -mx-4 -mb-4 mt-auto"
            : "fixed inset-x-0 bottom-0 z-20",
        )}
      >
        <div className="mx-auto flex max-w-4xl gap-2">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={
              voice.active
                ? "Stop voice mode to type…"
                : sessionId
                  ? "Talk to your CoPilot…"
                  : "Start a job naturally…"
            }
            className="min-w-0 flex-1 rounded-xl border bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
            disabled={busy || voice.active}
          />
          <button
            type="submit"
            disabled={busy || voice.active || !message.trim()}
            className="rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </form>
    </main>
  );
}
