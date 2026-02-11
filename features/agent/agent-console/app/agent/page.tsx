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

type AgentContext = {
  location?: string | null;
  steps?: string | null;
  expected?: string | null;
  actual?: string | null;
  device?: string | null;
  attachmentIds?: string[];
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

type SignedUrlResult = {
  path: string | null;
  signedUrl: string | null;
  error: string | null;
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

function fileNameFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export default function AgentConsolePage() {
  const [requests, setRequests] = useState<AgentRequest[]>([]);
  const [selected, setSelected] = useState<AgentRequest | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // signed URLs for the currently selected request's attachments
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>(
    {}
  );
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  // lightbox: which screenshot is open (signed URL)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const selectedContext: AgentContext | null = selected?.normalized_json ?? null;

  const selectedAttachmentPaths = useMemo(() => {
    return (
      (selectedContext?.attachmentIds ?? []).filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0
      ) || []
    );
  }, [selectedContext]);

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

      // keep selection fresh if it still exists
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

  // When selected request changes, fetch signed URLs for its attachments
  useEffect(() => {
    const paths = selectedAttachmentPaths;

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
        const { data, error: storageError } = await supabase.storage
          .from("agent_uploads")
          .createSignedUrls(paths, 60 * 60); // 1 hour

        if (storageError) {
          console.error("createSignedUrls error for agent_uploads:", storageError);
          if (!cancelled) setAttachmentUrls({});
          return;
        }

        const map: Record<string, string> = {};
        const items = (data ?? []) as SignedUrlResult[];

        // Prefer path matching if present
        for (const item of items) {
          const p = item?.path ?? null;
          const u = item?.signedUrl ?? null;
          if (p && u) map[p] = u;
        }

        // Fallback: sometimes SDK returns rows aligned to input order.
        if (Object.keys(map).length === 0 && items.length === paths.length) {
          for (let i = 0; i < paths.length; i++) {
            const u = items[i]?.signedUrl ?? null;
            if (u) map[paths[i]] = u;
          }
        }

        // Ensure we only keep urls for current selection's paths
        const filtered: Record<string, string> = {};
        for (const p of paths) {
          const u = map[p];
          if (u) filtered[p] = u;
        }

        if (!cancelled) setAttachmentUrls(filtered);
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
  }, [selected?.id, selectedAttachmentPaths]);

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

        // Optional: auto-notify discord after decision
        // (server will include requestId/actionId if available)
        await notifyDiscordImpl(json.request);
      } catch (err) {
        console.error("Error updating agent request", err);
        window.alert("Error updating request (check logs).");
      }
    });
  }

  async function notifyDiscordImpl(request: AgentRequest): Promise<void> {
    /**
     * IMPORTANT (buttons):
     * Do NOT send a custom message from the client.
     * Let the server route:
     * - load the request
     * - look up latest agent_actions by request_id
     * - enqueue notify_discord with { requestId, actionId } so the worker can render LINK buttons
     */
    const res = await fetch(`/api/agent/requests/${request.id}/notify-discord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // empty body is fine
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("Notify Discord failed", txt);
      throw new Error("Notify Discord failed");
    }

    const json = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          requestId?: string | null;
          actionId?: string | null;
          actionStatus?: string | null;
          actionKind?: string | null;
        }
      | null;

    // If there's no action row, buttons cannot render (expected for some old/legacy requests)
    if (json && json.ok && !json.actionId) {
      console.warn(
        "[agent-console] notify-discord: no actionId found; buttons will not render",
        {
          requestId: json.requestId,
          actionStatus: json.actionStatus,
          actionKind: json.actionKind,
        }
      );
    }
  }

  async function notifyDiscord(request: AgentRequest) {
    startTransition(async () => {
      try {
        await notifyDiscordImpl(request);
        await loadRequests();
      } catch (err) {
        console.error("Notify Discord error", err);
        window.alert("Notify Discord failed (check logs).");
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
        console.error("Error deleting agent request", err);
        window.alert("Error deleting (check logs).");
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 text-white">
      {/* Header */}
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

      {/* Main layout */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        {/* Left: list */}
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
                      {prettyIntent(req.intent)} • {new Date(req.created_at).toLocaleString()}
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

        {/* Right: detail */}
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
                {/* Description */}
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

                {/* Meta grid */}
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
                      {selected.llm_confidence != null ? selected.llm_confidence.toFixed(3) : "n/a"}
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

                {/* Context */}
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
                                {selectedAttachmentPaths.map((path, idx) => {
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
                                          ({fileNameFromPath(path)})
                                        </span>
                                      </div>

                                      {url && (
                                        <div className="mt-1">
                                          <button
                                            type="button"
                                            onClick={() => setLightboxUrl(url)}
                                            className="block rounded-md border border-white/10 bg-black/40 p-1"
                                            aria-label={`Open Screenshot ${idx + 1}`}
                                          >
                                            <div className="relative h-40 w-[320px] max-w-full overflow-hidden rounded-md">
                                              <Image
                                                src={url}
                                                alt={`Screenshot ${idx + 1}`}
                                                fill
                                                sizes="(max-width: 768px) 90vw, 320px"
                                                className="object-contain"
                                                unoptimized
                                              />
                                            </div>
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

                {/* GitHub */}
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

                {/* LLM notes */}
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

                <Separator className="bg-white/10" />

                {/* Actions */}
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
                    title="Sends via server-built payload so Discord buttons can be included when actionId exists."
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

      {/* Lightbox overlay */}
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
              className="absolute right-2 top-2 z-10 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-neutral-200 hover:bg-black"
              onClick={() => setLightboxUrl(null)}
            >
              Close
            </button>

            <div className="relative h-[80vh] w-[90vw] max-w-[1200px] overflow-hidden rounded-lg border border-white/20 bg-black/40">
              <Image
                src={lightboxUrl}
                alt="Screenshot"
                fill
                sizes="90vw"
                className="object-contain"
                unoptimized
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}