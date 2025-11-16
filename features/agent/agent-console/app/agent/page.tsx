// features/agent-console/app/agent/page.tsx
"use client";

import { useState } from "react";
import useSWR from "swr";

import { Button } from "@shared/components/ui/Button";
import  Card  from "@shared/components/ui/Card";
import { Badge } from "@shared/components/ui/badge";
import { Separator } from "@shared/components/ui/separator";
import { cn } from "@shared/lib/utils";

type AgentRequestStatus =
  | "submitted"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "merged";

type AgentRequest = {
  id: string;
  shop_id: string | null;
  reporter_id: string | null;
  reporter_role: string | null;
  description: string;
  intent: string | null;
  normalized_json: Record<string, unknown> | null;
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

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load");
    return res.json();
  });

function statusClasses(status: AgentRequestStatus) {
  // Dark / chip-style badges to match the rest of the portal
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

export default function AgentConsolePage() {
  const { data, error, isLoading, mutate } = useSWR<{ requests: AgentRequest[] }>(
    "/api/agent/requests",
    fetcher,
    { refreshInterval: 30000 }
  );

  const [selected, setSelected] = useState<AgentRequest | null>(null);

  const requests = data?.requests ?? [];

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 text-white">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
            Agent Console
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            Review AI-generated issues, pull requests, and catalog changes for
            ProFixIQ.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-neutral-300 backdrop-blur-md">
          <div className="flex flex-col">
            <span className="text-[0.65rem] uppercase tracking-[0.13em] text-neutral-500">
              Requests
            </span>
            <span className="font-semibold">
              {requests.length} open
            </span>
          </div>
          <Separator orientation="vertical" className="h-6 bg-white/10" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-orange-500/60 bg-black/40 text-xs font-semibold text-orange-400 hover:bg-orange-600 hover:text-black"
            onClick={() => mutate()}
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
              <span className="text-[0.7rem] text-neutral-500">
                Syncing…
              </span>
            )}
          </div>

          <Separator className="mb-2 bg-white/10" />

          <div className="flex-1 space-y-2 overflow-auto">
            {error && (
              <p className="text-xs text-red-400">
                Failed to load agent requests. Check logs.
              </p>
            )}

            {!isLoading && !error && requests.length === 0 && (
              <p className="text-xs text-neutral-500">
                No agent requests yet.
              </p>
            )}

            {requests.map((req) => (
              <button
                key={req.id}
                type="button"
                onClick={() => setSelected(req)}
                className={cn(
                  "w-full rounded-xl border border-white/5 bg-black/40 px-3 py-2 text-left text-xs text-neutral-100 transition hover:border-orange-500/70 hover:bg-orange-500/5",
                  selected?.id === req.id &&
                    "border-orange-500/80 bg-orange-500/10"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="line-clamp-1 text-[0.8rem] font-medium text-neutral-50">
                      {req.description}
                    </span>
                    <span className="text-[0.7rem] text-neutral-400">
                      {req.intent ?? "unknown"} •{" "}
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
                Choose a request on the left to see description, GitHub links,
                and LLM notes.
              </p>
            )}

            {selected && (
              <>
                {/* Description */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-neutral-50">
                      Description
                    </h3>
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
                    <div className="text-neutral-100">
                      {selected.intent ?? "unknown"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-neutral-400">
                      LLM Model
                    </div>
                    <div className="text-neutral-100">
                      {selected.llm_model ?? "n/a"}
                    </div>
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
                    <div className="text-neutral-100">
                      {selected.reporter_role ?? "unknown"}
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/10" />

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
                    {selected.github_branch && (
                      <div>Branch: {selected.github_branch}</div>
                    )}
                    {selected.github_commit_sha && (
                      <div className="truncate">
                        Commit: {selected.github_commit_sha}
                      </div>
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
                      <p className="whitespace-pre-line text-neutral-300">
                        {selected.llm_notes}
                      </p>
                    </div>
                  </>
                )}

                <Separator className="bg-white/10" />

                {/* Actions – wired later */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled
                    className="border-emerald-500/60 text-xs font-semibold text-emerald-300 hover:bg-emerald-600 hover:text-black disabled:opacity-50"
                  >
                    Approve (wire later)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled
                    className="border-red-500/70 text-xs font-semibold text-red-300 hover:bg-red-600 hover:text-black disabled:opacity-50"
                  >
                    Reject (wire later)
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}