"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { FeedbackKind } from "@/features/feedback/lib/feedback";

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
};

const MAX_DESCRIPTION_LENGTH = 12_000;
const MAX_CONTEXT_LENGTH = 4_000;
const MAX_LOCATION_LENGTH = 500;
const MAX_ATTACHMENTS = 20;

const KIND_OPTIONS: Array<{ value: FeedbackKind; label: string }> = [
  { value: "bug", label: "Something is not working" },
  { value: "feature_request", label: "Feature request" },
  { value: "workflow_improvement", label: "Workflow improvement" },
  { value: "usability", label: "Usability / easier to use" },
  { value: "catalog_request", label: "Catalog / content request" },
  { value: "other", label: "General feedback" },
];

export default function FeedbackModal({ open, onOpenChange }: Props) {
  const pathname = usePathname();
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<FeedbackKind>("other");
  const [location, setLocation] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState("");
  const submittingRef = useRef(false);
  const submissionKeyRef = useRef<string | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const storageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStorageKey(null);
    void createBrowserSupabase()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (cancelled || !user) return;
        const key = `profixiq:feedback-draft:v1:${user.id}`;
        storageKeyRef.current = key;
        try {
          const saved = JSON.parse(localStorage.getItem(key) ?? "null");
          if (
            saved?.version === 1 &&
            typeof saved.description === "string" &&
            typeof saved.submissionKey === "string"
          ) {
            setDescription(saved.description.slice(0, MAX_DESCRIPTION_LENGTH));
            setKind(
              KIND_OPTIONS.some((option) => option.value === saved.kind)
                ? saved.kind
                : "other",
            );
            setLocation(
              typeof saved.location === "string"
                ? saved.location.slice(0, MAX_LOCATION_LENGTH)
                : (pathname ?? ""),
            );
            setSteps(
              typeof saved.steps === "string"
                ? saved.steps.slice(0, MAX_CONTEXT_LENGTH)
                : "",
            );
            setExpected(
              typeof saved.expected === "string"
                ? saved.expected.slice(0, MAX_CONTEXT_LENGTH)
                : "",
            );
            setActual(
              typeof saved.actual === "string"
                ? saved.actual.slice(0, MAX_CONTEXT_LENGTH)
                : "",
            );
            submissionKeyRef.current = saved.submissionKey;
            setPendingBody(
              typeof saved.pendingBody === "string" ? saved.pendingBody : null,
            );
          } else {
            setDescription("");
            setKind("other");
            setSteps("");
            setExpected("");
            setActual("");
            setLocation((pathname ?? "").slice(0, MAX_LOCATION_LENGTH));
            submissionKeyRef.current = crypto.randomUUID();
            setPendingBody(null);
          }
          setStorageKey(key);
        } catch {
          toast.error(
            "Local storage is unavailable. Enable it to keep a safe feedback receipt.",
          );
        }
        setDevice(navigator.userAgent.slice(0, 1_000));
      })
      .catch(() => toast.error("Could not load your feedback draft."));
    return () => {
      cancelled = true;
    };
  }, [open, pathname]);

  useEffect(() => {
    if (!storageKey || !submissionKeyRef.current) return;
    try {
      if (!description && !pendingBody) localStorage.removeItem(storageKey);
      else
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            version: 1,
            description,
            kind,
            location,
            steps,
            expected,
            actual,
            submissionKey: submissionKeyRef.current,
            pendingBody,
          }),
        );
    } catch {
      toast.error(
        "Could not save your feedback draft. Check available browser storage.",
      );
    }
  }, [
    storageKey,
    description,
    kind,
    location,
    steps,
    expected,
    actual,
    pendingBody,
  ]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length > MAX_ATTACHMENTS) {
      toast.error(`Attach up to ${MAX_ATTACHMENTS} screenshots at a time.`);
    }
    setFiles(selected.slice(0, MAX_ATTACHMENTS));
  }

  async function uploadScreenshots(): Promise<string[]> {
    if (files.length === 0) return [];
    const supabase = createBrowserSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      throw new Error("Please sign in again before attaching screenshots.");
    const owner = user.id;
    const paths: string[] = [];

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${owner}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("agent_uploads")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        console.error("feedback screenshot upload failed", error);
        toast.error(`Could not attach ${file.name}`);
        continue;
      }
      paths.push(path);
    }
    return paths;
  }

  function reset() {
    setDescription("");
    setKind("other");
    setSteps("");
    setExpected("");
    setActual("");
    setFiles([]);
    if (storageKeyRef.current) localStorage.removeItem(storageKeyRef.current);
    submissionKeyRef.current = null;
    setPendingBody(null);
  }

  async function submit() {
    if (submittingRef.current) return;
    const message = description.trim();
    if (!message) {
      toast.error("Tell us what happened or what you would like improved.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await createBrowserSupabase().auth.getUser();
      if (!user || storageKey !== `profixiq:feedback-draft:v1:${user.id}`)
        throw new Error(
          "Your session changed. Reopen feedback to load your draft.",
        );
      if (!storageKey) throw new Error("Your feedback draft is still loading.");
      submissionKeyRef.current ??= crypto.randomUUID();
      // Once a send starts, retries use exactly the same persisted payload.
      const requestBody =
        pendingBody ??
        JSON.stringify({
          description: message,
          kind,
          pathname: pathname?.slice(0, MAX_LOCATION_LENGTH),
          location: (location.trim() || pathname)?.slice(
            0,
            MAX_LOCATION_LENGTH,
          ),
          steps: steps.trim() || undefined,
          expected: expected.trim() || undefined,
          actual: actual.trim() || undefined,
          device,
          attachmentIds: await uploadScreenshots(),
          submissionKey: submissionKeyRef.current,
        });
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          description,
          kind,
          location,
          steps,
          expected,
          actual,
          submissionKey: submissionKeyRef.current,
          pendingBody: requestBody,
        }),
      );
      setPendingBody(requestBody);
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      const result = (await response.json().catch(() => null)) as {
        matchedExisting?: boolean;
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(result?.error ?? "Could not submit feedback");

      toast.success(
        result?.matchedExisting
          ? "Thanks — we linked this to an existing request so its priority reflects your feedback."
          : "Thanks — your feedback has been sent to the ProFixIQ product queue.",
      );
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error("feedback submission failed", error);
      toast.error(
        error instanceof Error ? error.message : "Could not submit feedback",
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const showBugFields = kind === "bug";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] text-[color:var(--theme-text-primary)] backdrop-blur-xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-blackops tracking-[0.12em] uppercase">
            Feedback & Requests
          </DialogTitle>
          <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
            Tell us what is getting in your way or what would make ProFixIQ
            better. Similar requests are grouped automatically so repeated
            feedback carries more weight.
          </p>
        </DialogHeader>

        {pendingBody ? (
          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            Your previous send is awaiting confirmation. Retry to check its
            receipt.
          </p>
        ) : null}
        <fieldset
          disabled={loading || Boolean(pendingBody) || !storageKey}
          className="space-y-4"
        >
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">
              What kind of feedback is this?
            </span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as FeedbackKind)}
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm"
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">
              Tell us about it
            </span>
            <Textarea
              value={description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What were you trying to do, what felt slow or confusing, or what would you like ProFixIQ to do differently?"
              className="min-h-32 bg-[color:var(--theme-surface-panel)]"
            />
            <span className="text-[11px] text-[color:var(--theme-text-muted)]">
              {description.length.toLocaleString()} /{" "}
              {MAX_DESCRIPTION_LENGTH.toLocaleString()}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">
              Where in ProFixIQ?
            </span>
            <input
              value={location}
              maxLength={MAX_LOCATION_LENGTH}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Current page is captured automatically"
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm"
            />
          </label>

          {showBugFields ? (
            <div className="space-y-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">
                Bug details{" "}
                <span className="normal-case font-normal text-[color:var(--theme-text-muted)]">
                  (optional, but useful)
                </span>
              </p>
              <Textarea
                value={steps}
                maxLength={MAX_CONTEXT_LENGTH}
                onChange={(event) => setSteps(event.target.value)}
                placeholder="Steps to reproduce"
                className="min-h-20 bg-[color:var(--theme-surface-panel)]"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Textarea
                  value={expected}
                  maxLength={MAX_CONTEXT_LENGTH}
                  onChange={(event) => setExpected(event.target.value)}
                  placeholder="What you expected"
                  className="min-h-20 bg-[color:var(--theme-surface-panel)]"
                />
                <Textarea
                  value={actual}
                  maxLength={MAX_CONTEXT_LENGTH}
                  onChange={(event) => setActual(event.target.value)}
                  placeholder="What actually happened"
                  className="min-h-20 bg-[color:var(--theme-surface-panel)]"
                />
              </div>
            </div>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">
              Screenshots{" "}
              <span className="normal-case font-normal text-[color:var(--theme-text-muted)]">
                (optional)
              </span>
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="block w-full text-sm text-[color:var(--theme-text-secondary)]"
            />
            {files.length > 0 ? (
              <span className="text-xs text-[color:var(--theme-text-muted)]">
                {files.length} attachment{files.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </label>

          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            AI is used only to organize, summarize, detect similar requests, and
            suggest priority. Submitting feedback does not automatically create
            code, branches, or releases.
          </div>
        </fieldset>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={loading || !storageKey || !description.trim()}
            className="bg-orange-600 text-white hover:bg-orange-500"
          >
            {loading
              ? "Submitting…"
              : pendingBody
                ? "Retry Feedback"
                : "Send Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
