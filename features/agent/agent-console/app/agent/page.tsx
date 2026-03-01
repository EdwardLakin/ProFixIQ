// features/agent/agent-console/app/agent/page.tsx (FULL FILE REPLACEMENT)
"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@shared/components/ui/Button";
import Card from "@shared/components/ui/Card";
import { Badge } from "@shared/components/ui/badge";
import { Separator } from "@shared/components/ui/separator";
import { cn } from "@shared/lib/utils";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type AgentRequestStatus =
  | "submitted"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "merged";

type AgentQuestion = { id?: string; question: string };

type AgentResponse = {
  id: string;
  created_at: string;
  user_id: string | null;
  message: string;
  answers?: Record<string, string> | null;
};

type AgentContext = {
  location?: string | null;
  steps?: string | null;
  expected?: string | null;
  actual?: string | null;
  device?: string | null;
  attachmentIds?: string[];

  // optional: worker can put questions here later
  questions?: AgentQuestion[];

  // answers/replies stored here by /reply route
  responses?: AgentResponse[];

  [key: string]: unknown;
};

type AgentRequest = {
  id: string;
  shop_id: string | null;
  reporter_id: string | null;
  reporter_role: string | null;
  description: string;
  intent: string | null;
  normalized_json: AgentContext | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_pr_number: number | null;
  github_pr_url: string | null;
  github_branch: string | null;
  github_commit_sha: string | null;
  llm_model: string | null;
  llm_confidence: number | null;
  llm_notes: string | null;
  status: AgentRequestStatus;
  created_at: string;
  updated_at: string;
};

type SignedUrlRow = {
  signedUrl: string | null;
  path: string | null;
  error?: string | null;
};

function statusClasses(status: AgentRequestStatus) {
  switch (status) {
    case "submitted":
      return "border-neutral-700 bg-neutral-900 text-neutral-200";
    case "in_progress":
      return "border-sky-700/70 bg-sky-900/40 text-sky-200";
    case "awaiting_approval":
      return "border-amber-700/70 bg-amber-900/40 text-amber-200";
    case "approved":
      return "border-emerald-700/70 bg-emerald-900/40 text-emerald-200";
    case "merged":
      return "border-green-700/70 bg-green-900/40 text-green-200";
    case "rejected":
    case "failed":
      return "border-red-700/70 bg-red-900/40 text-red-200";
    default:
      return "border-neutral-700 bg-neutral-900 text-neutral-200";
  }
}

function prettyIntent(intent: string | null): string {
  if (!intent) return "unknown";
  return intent.replace(/_/g, " ");
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

export default function AgentConsolePage() {
  const [requests, setRequests] = useState<AgentRequest[]>([]);
  const [selected, setSelected] = useState<AgentRequest | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>(
    {}
  );
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // reply UI
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  const selectedContext: AgentContext | null = selected?.normalized_json ?? null;

  const questions = useMemo<AgentQuestion[]>(() => {
    const raw = selectedContext?.questions;
    if (!raw || !Array.isArray(raw)) return [];
    // keep only well-formed entries
    return raw
      .filter((q): q is AgentQuestion => !!q && typeof q === "object")
      .filter((q) => isString((q as { question?: unknown }).question))
      .map((q) => ({
        id: isString((q as { id?: unknown }).id) ? (q as { id: string }).id : undefined,
        question: (q as { question: string }).question,
      }));
  }, [selectedContext?.questions]);

  const responses = useMemo<AgentResponse[]>(() => {
    const raw = selectedContext?.responses;
    const arr: AgentResponse[] =
      raw && Array.isArray(raw)
        ? raw
            .filter((r): r is AgentResponse => !!r && typeof r === "object")
            .filter((r) => {
              const obj = r as {
                id?: unknown;
                created_at?: unknown;
                user_id?: unknown;
                message?: unknown;
              };
              return (
                isString(obj.id) &&
                isString(obj.created_at) &&
                isString(obj.message) &&
                (obj.user_id === null || isString(obj.user_id))
              );
            })
            .map((r) => {
              const obj = r as {
                id: string;
                created_at: string;
                user_id: string | null;
                message: string;
                answers?: unknown;
              };

              const answers =
                obj.answers &&
                typeof obj.answers === "object" &&
                !Array.isArray(obj.answers)
                  ? (obj.answers as Record<string, string>)
                  : null;

              return {
                id: obj.id,
                created_at: obj.created_at,
                user_id: obj.user_id,
                message: obj.message,
                answers,
              };
            })
        : [];

    // newest last
    return arr.slice().sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return ta - tb;
    });
  }, [selectedContext?.responses]);

  async function loadRequests() {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch("/api/agent/requests");
      if (!res.ok) {
        throw new Error(`Failed to load (status ${res.status})`);
      }

      const json = (await res.json()) as { requests: AgentRequest[] };
      setRequests(json.requests);

      if (selected?.id) {
        const nextSelected =
          json.requests.find((r) => r.id === selected.id) ?? null;
        setSelected(nextSelected);
      }
    } catch (err) {
      console.error("Failed to load agent requests", err);
      setError("Failed to load agent requests. Check logs.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const paths =
      (selectedContext?.attachmentIds ?? []).filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0
      ) || [];

    if (!paths.length) {
      setAttachmentUrls({});
      setAttachmentsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSignedUrls() {
      try {
        setAttachmentsLoading(true);
        const supabase = createBrowserSupabase();

        const { data, error } = await supabase.storage
          .from("agent_uploads")
          .createSignedUrls(paths, 60 * 60);

        if (error) {
          console.error("createSignedUrls error for agent_uploads:", error);
          if (!cancelled) setAttachmentUrls({});
          return;
        }

        const rows = (data ?? []) as SignedUrlRow[];

        const map: Record<string, string> = {};
        for (let i = 0; i < paths.length; i++) {
          const row = rows[i];
          const url = row?.signedUrl ?? null;
          if (url) map[paths[i]] = url;
        }

        if (!cancelled) setAttachmentUrls(map);
      } catch (err) {
        console.error("Error loading signed URLs for agent_uploads:", err);
        if (!cancelled) setAttachmentUrls({});
      } finally {
        if (!cancelled) setAttachmentsLoading(false);
      }
    }

    fetchSignedUrls();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function updateStatus(action: "approve" | "reject", request: AgentRequest) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/agent/requests/${request.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        if (!res.ok) {
          console.error("Failed to update agent request", await res.text());
          window.alert("Failed to update request (check logs).");
          return;
        }

        const json = (await res.json()) as { request: AgentRequest };

        setRequests((prev) =>
          prev.map((r) => (r.id === json.request.id ? json.request : r))
        );
        setSelected(json.request);
      } catch (err) {
        console.error("Error updating agent request", err);
        window.alert("Error updating request (check logs).");
      }
    });
  }

  async function notifyDiscord(request: AgentRequest) {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/agent/requests/${request.id}/notify-discord`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.error("Notify Discord failed", txt);
          window.alert("Notify Discord failed (check logs).");
          return;
        }

        await loadRequests();
      } catch (err) {
        console.error("Notify Discord error", err);
        window.alert("Notify Discord error (check logs).");
      }
    });
  }

  async function deleteRequest(request: AgentRequest) {
    const confirmed = window.confirm(
      "Delete this agent request and its metadata? This cannot be undone."
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/agent/requests/${request.id}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          console.error("Failed to delete agent request", await res.text());
          window.alert("Failed to delete (check logs).");
          return;
        }

        setRequests((prev) => prev.filter((r) => r.id !== request.id));
        if (selected?.id === request.id) {
          setSelected(null);
          setAttachmentUrls({});
          setLightboxUrl(null);
        }
      } catch (err) {
        console.error("Error deleting request", err);
        window.alert("Error deleting (check logs).");
      }
    });
  }

  async function sendReply() {
    if (!selected) return;
    const msg = replyText.trim();
    if (!msg) return;

    setReplySending(true);
    try {
      const res = await fetch(`/api/agent/requests/${selected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("Reply failed", txt);
        window.alert("Reply failed (check logs).");
        return;
      }

      setReplyText("");
      await loadRequests();
    } catch (err) {
      console.error("Reply error", err);
      window.alert("Reply error (check logs).");
    } finally {
      setReplySending(false);
    }
  }

  // (optional) ensure bucket exists / auth works in console, but don’t block UI
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().catch(() => null);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 text-white">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
            Agent Console
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Review AI-generated issues, pull requests, and catalog changes for ProFixIQ.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-neutral-300 backdrop-blur-md">
          <div className="flex flex-col">
            <span className="text-[0.65rem] uppercase tracking-[0.13em] text-neutral-500">
              Requests
            </span>
            <span className="font-semibold">{requests.length} open</span>
          </div>
          <Separator orientation="vertical" className="h-6 bg-white/10" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-orange-500/60 bg-black/40 text-xs font-semibold text-orange-400 hover:bg-orange-600 hover:text-black"
            onClick={() => loadRequests()}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        {/* LEFT LIST */}
        <Card className="flex h-[70vh] flex-col rounded-2xl border border-white/10 bg-black/30 p-3 shadow-card backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
              Requests
            </h2>
            {isLoading && (
              <span className="text-[0.7rem] text-neutral-500">Syncing…</span>
            )}
          </div>

          <Separator className="mb-2 bg-white/10" />

          <div className="flex-1 space-y-2 overflow-auto">
            {error && <p className="text-xs text-red-400">{error}</p>}

            {!isLoading && !error && requests.length === 0 && (
              <p className="text-xs text-neutral-500">No agent requests yet.</p>
            )}

            {requests.map((req) => (
              <button
                key={req.id}
                type="button"
                onClick={() => setSelected(req)}
                className={cn(
                  "w-full rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-left text-xs text-neutral-100 transition hover:border-orange-500/70 hover:bg-orange-500/5",
                  selected?.id === req.id && "border-orange-500/80 bg-orange-500/10"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="line-clamp-1 text-[0.8rem] font-medium text-neutral-50">
                      {req.description}
                    </span>
                    <span className="text-[0.7rem] text-neutral-400">
                      {prettyIntent(req.intent)} •{" "}
                      {new Date(req.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      className={cn(
                        "border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        statusClasses(req.status)
                      )}
                    >
                      {req.status.replace(/_/g, " ")}
                    </Badge>
                    {req.llm_confidence != null && (
                      <span className="text-[10px] text-neutral-500">
                        Conf: {req.llm_confidence.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* RIGHT DETAILS */}
        <Card className="flex h-[70vh] flex-col rounded-2xl border border-white/10 bg-black/30 p-4 shadow-card backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">
              {selected ? "Request Details" : "Select a Request"}
            </h2>
          </div>

          <Separator className="mb-3 bg-white/10" />

          <div className="flex-1 space-y-4 overflow-auto text-sm text-neutral-100">
            {!selected && (
              <p className="text-xs text-neutral-500">
                Choose a request on the left to see description, GitHub links, context, and LLM notes.
              </p>
            )}

            {selected && (
              <>
                {/* DESCRIPTION */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-neutral-50">Description</h3>
                    <Badge
                      className={cn(
                        "border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        statusClasses(selected.status)
                      )}
                    >
                      {selected.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-line text-xs text-neutral-200">
                    {selected.description}
                  </p>
                </div>

                <Separator className="bg-white/10" />

                {/* META */}
                <div className="grid grid-cols-2 gap-4 text-[0.75rem]">
                  <div className="space-y-1">
                    <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                      Intent
                    </div>
                    <div className="text-neutral-100">{prettyIntent(selected.intent)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                      LLM Model
                    </div>
                    <div className="text-neutral-100">{selected.llm_model ?? "n/a"}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                      Confidence
                    </div>
                    <div className="text-neutral-100">
                      {selected.llm_confidence != null
                        ? selected.llm_confidence.toFixed(3)
                        : "n/a"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                      Reporter Role
                    </div>
                    <div className="text-neutral-100">{selected.reporter_role ?? "unknown"}</div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* CONTEXT */}
                {selectedContext && Object.keys(selectedContext).length > 0 && (
                  <>
                    <div className="space-y-2 text-[0.75rem]">
                      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                        Context
                      </div>
                      <div className="space-y-1 text-neutral-200">
                        {selectedContext.location && (
                          <div>
                            <span className="text-neutral-500">Location:</span>{" "}
                            {selectedContext.location}
                          </div>
                        )}
                        {selectedContext.device && (
                          <div>
                            <span className="text-neutral-500">Device:</span>{" "}
                            {selectedContext.device}
                          </div>
                        )}
                        {selectedContext.steps && (
                          <div>
                            <div className="text-neutral-500">Steps to Reproduce:</div>
                            <pre className="mt-0.5 whitespace-pre-wrap rounded-md bg-black/40 p-2 text-[0.7rem] text-neutral-200">
                              {selectedContext.steps}
                            </pre>
                          </div>
                        )}
                        {selectedContext.expected && (
                          <div>
                            <div className="text-neutral-500">Expected:</div>
                            <pre className="mt-0.5 whitespace-pre-wrap rounded-md bg-black/40 p-2 text-[0.7rem] text-neutral-200">
                              {selectedContext.expected}
                            </pre>
                          </div>
                        )}
                        {selectedContext.actual && (
                          <div>
                            <div className="text-neutral-500">Actual:</div>
                            <pre className="mt-0.5 whitespace-pre-wrap rounded-md bg-black/40 p-2 text-[0.7rem] text-neutral-200">
                              {selectedContext.actual}
                            </pre>
                          </div>
                        )}

                        {/* ATTACHMENTS */}
                        {Array.isArray(selectedContext.attachmentIds) &&
                          selectedContext.attachmentIds.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-neutral-500">Attachments:</div>

                              {attachmentsLoading && (
                                <div className="text-[0.7rem] text-neutral-500">
                                  Loading screenshots…
                                </div>
                              )}

                              <ul className="mt-0.5 space-y-2 text-[0.7rem]">
                                {selectedContext.attachmentIds
                                  .filter((p): p is string => typeof p === "string" && p.length > 0)
                                  .map((path, idx) => {
                                    const url = attachmentUrls[path];

                                    return (
                                      <li key={path} className="text-neutral-300">
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            disabled={!url}
                                            onClick={() => url && setLightboxUrl(url)}
                                            className={cn(
                                              "text-left text-orange-400 underline underline-offset-2 hover:text-orange-300",
                                              !url && "cursor-not-allowed opacity-60"
                                            )}
                                          >
                                            Screenshot {idx + 1}
                                          </button>
                                          <span className="truncate text-neutral-500">
                                            ({path.split("/")[path.split("/").length - 1]})
                                          </span>
                                        </div>

                                        {url && (
                                          <div className="mt-1">
                                            <button
                                              type="button"
                                              className="block"
                                              onClick={() => setLightboxUrl(url)}
                                              aria-label={`Open Screenshot ${idx + 1}`}
                                            >
                                              <Image
                                                src={url}
                                                alt={`Screenshot ${idx + 1}`}
                                                width={640}
                                                height={360}
                                                unoptimized
                                                className="max-h-40 w-auto cursor-zoom-in rounded-md border border-white/10 bg-black/40 object-contain"
                                              />
                                            </button>
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                              </ul>
                            </div>
                          )}
                      </div>
                    </div>

                    <Separator className="bg-white/10" />
                  </>
                )}

                {/* GITHUB */}
                <div className="space-y-1 text-[0.75rem]">
                  <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                    GitHub
                  </div>
                  <div className="space-y-1 text-neutral-200">
                    {selected.github_issue_url ? (
                      <div>
                        Issue:{" "}
                        <a
                          href={selected.github_issue_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-orange-400 underline underline-offset-2 hover:text-orange-300"
                        >
                          #{selected.github_issue_number}
                        </a>
                      </div>
                    ) : (
                      <div>Issue: n/a</div>
                    )}
                    {selected.github_pr_url ? (
                      <div>
                        PR:{" "}
                        <a
                          href={selected.github_pr_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-orange-400 underline underline-offset-2 hover:text-orange-300"
                        >
                          #{selected.github_pr_number}
                        </a>
                      </div>
                    ) : (
                      <div>PR: n/a</div>
                    )}
                    {selected.github_branch && <div>Branch: {selected.github_branch}</div>}
                    {selected.github_commit_sha && (
                      <div className="truncate">Commit: {selected.github_commit_sha}</div>
                    )}
                  </div>
                </div>

                {/* LLM NOTES */}
                {selected.llm_notes && (
                  <>
                    <Separator className="bg-white/10" />
                    <div className="space-y-1 text-[0.75rem]">
                      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                        LLM Notes
                      </div>
                      <p className="whitespace-pre-line text-neutral-300">{selected.llm_notes}</p>
                    </div>
                  </>
                )}

                {/* QUESTIONS + RESPONSES */}
                <Separator className="bg-white/10" />
                <div className="space-y-2 text-[0.75rem]">
                  <div className="flex items-center justify-between">
                    <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                      Agent Q&A
                    </div>
                    <span className="text-[10px] text-neutral-500">
                      {responses.length} repl{responses.length === 1 ? "y" : "ies"}
                    </span>
                  </div>

                  {questions.length > 0 ? (
                    <div className="rounded-lg border border-white/10 bg-black/25 p-2">
                      <div className="text-[0.7rem] text-neutral-400">
                        Questions the agent needs answered:
                      </div>
                      <ul className="mt-2 space-y-2">
                        {questions.map((q, idx) => (
                          <li key={q.id ?? `${idx}`} className="rounded-md bg-black/40 p-2">
                            <div className="text-xs text-neutral-200">
                              <span className="text-neutral-500">Q{idx + 1}:</span>{" "}
                              {q.question}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="text-[0.7rem] text-neutral-500">
                      No structured questions yet. (Once the worker starts asking, they’ll show here.)
                    </div>
                  )}

                  {responses.length > 0 && (
                    <div className="rounded-lg border border-white/10 bg-black/25 p-2">
                      <div className="text-[0.7rem] text-neutral-400">Replies</div>
                      <div className="mt-2 space-y-2">
                        {responses.map((r) => (
                          <div key={r.id} className="rounded-md bg-black/40 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] text-neutral-500">
                                {new Date(r.created_at).toLocaleString()}
                              </div>
                              <div className="text-[10px] text-neutral-600 truncate">
                                {r.user_id ? `user: ${r.user_id}` : "user: unknown"}
                              </div>
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-xs text-neutral-200">
                              {r.message}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-2">
                    <div className="text-[0.7rem] text-neutral-400">
                      Reply (answer the agent / add missing info)
                    </div>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Example: This only happens on iPad Safari. Console shows 'ReferenceError: window is not defined' from RoleSidebar.tsx ..."
                      className="min-h-[90px] w-full rounded-md border border-white/10 bg-black/40 p-2 text-xs text-neutral-200 outline-none focus:border-orange-500/60"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!replyText.trim() || replySending}
                        className={cn(
                          "border-orange-500/60 text-xs font-semibold text-orange-300 hover:bg-orange-600 hover:text-black disabled:opacity-50",
                          replySending && "cursor-wait"
                        )}
                        onClick={sendReply}
                      >
                        {replySending ? "Sending…" : "Send Reply"}
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* ACTION BUTTONS */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selected || isPending}
                    className={cn(
                      "border-emerald-500/60 text-xs font-semibold text-emerald-300 hover:bg-emerald-600 hover:text-black disabled:opacity-50",
                      isPending && "cursor-wait"
                    )}
                    onClick={() => selected && updateStatus("approve", selected)}
                  >
                    {isPending ? "Working…" : "Approve"}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selected || isPending}
                    className={cn(
                      "border-red-500/70 text-xs font-semibold text-red-300 hover:bg-red-600 hover:text-black disabled:opacity-50",
                      isPending && "cursor-wait"
                    )}
                    onClick={() => selected && updateStatus("reject", selected)}
                  >
                    {isPending ? "Working…" : "Reject"}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selected || isPending}
                    className={cn(
                      "border-indigo-500/60 text-xs font-semibold text-indigo-200 hover:bg-indigo-600 hover:text-black disabled:opacity-50",
                      isPending && "cursor-wait"
                    )}
                    onClick={() => selected && notifyDiscord(selected)}
                  >
                    {isPending ? "Working…" : "Notify Discord"}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selected || isPending}
                    className={cn(
                      "border-white/40 text-xs font-semibold text-neutral-300 hover:bg-red-700 hover:text-white disabled:opacity-50",
                      isPending && "cursor-wait"
                    )}
                    onClick={() => selected && deleteRequest(selected)}
                  >
                    {isPending ? "Working…" : "Delete"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-neutral-200 hover:bg-black"
              onClick={() => setLightboxUrl(null)}
            >
              Close
            </button>

            <Image
              src={lightboxUrl}
              alt="Screenshot"
              width={1600}
              height={900}
              unoptimized
              className="max-h-[90vh] max-w-[90vw] rounded-lg border border-white/20 object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}