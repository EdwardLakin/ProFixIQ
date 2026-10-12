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
  const submissionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocation((pathname ?? "").slice(0, MAX_LOCATION_LENGTH));
    setDevice(
      (typeof navigator === "undefined" ? "" : navigator.userAgent).slice(0, 1_000),
    );
  }, [open, pathname]);

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
    const owner = user?.id ?? "anonymous";
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
    submissionKeyRef.current = null;
  }

  async function submit() {
    const message = description.trim();
    if (!message) {
      toast.error("Tell us what happened or what you would like improved.");
      return;
    }

    setLoading(true);
    try {
      submissionKeyRef.current ??= crypto.randomUUID();
      const attachmentIds = await uploadScreenshots();
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: message,
          kind,
          pathname: pathname?.slice(0, MAX_LOCATION_LENGTH),
          location: (location.trim() || pathname)?.slice(0, MAX_LOCATION_LENGTH),
          steps: steps.trim() || undefined,
          expected: expected.trim() || undefined,
          actual: actual.trim() || undefined,
          device,
          attachmentIds,
          submissionKey: submissionKeyRef.current,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { matchedExisting?: boolean; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "Could not submit feedback");

      toast.success(
        result?.matchedExisting
          ? "Thanks — we linked this to an existing request so its priority reflects your feedback."
          : "Thanks — your feedback has been sent to the ProFixIQ product queue.",
      );
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error("feedback submission failed", error);
      toast.error(error instanceof Error ? error.message : "Could not submit feedback");
    } finally {
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
            Tell us what is getting in your way or what would make ProFixIQ better. Similar requests are grouped automatically so repeated feedback carries more weight.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">What kind of feedback is this?</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as FeedbackKind)}
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm"
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">Tell us about it</span>
            <Textarea
              value={description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What were you trying to do, what felt slow or confusing, or what would you like ProFixIQ to do differently?"
              className="min-h-32 bg-[color:var(--theme-surface-panel)]"
            />
            <span className="text-[11px] text-[color:var(--theme-text-muted)]">{description.length.toLocaleString()} / {MAX_DESCRIPTION_LENGTH.toLocaleString()}</span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">Where in ProFixIQ?</span>
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
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">Bug details <span className="normal-case font-normal text-[color:var(--theme-text-muted)]">(optional, but useful)</span></p>
              <Textarea value={steps} maxLength={MAX_CONTEXT_LENGTH} onChange={(event) => setSteps(event.target.value)} placeholder="Steps to reproduce" className="min-h-20 bg-[color:var(--theme-surface-panel)]" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Textarea value={expected} maxLength={MAX_CONTEXT_LENGTH} onChange={(event) => setExpected(event.target.value)} placeholder="What you expected" className="min-h-20 bg-[color:var(--theme-surface-panel)]" />
                <Textarea value={actual} maxLength={MAX_CONTEXT_LENGTH} onChange={(event) => setActual(event.target.value)} placeholder="What actually happened" className="min-h-20 bg-[color:var(--theme-surface-panel)]" />
              </div>
            </div>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--theme-text-secondary)]">Screenshots <span className="normal-case font-normal text-[color:var(--theme-text-muted)]">(optional)</span></span>
            <input type="file" accept="image/*" multiple onChange={handleFileChange} className="block w-full text-sm text-[color:var(--theme-text-secondary)]" />
            {files.length > 0 ? <span className="text-xs text-[color:var(--theme-text-muted)]">{files.length} attachment{files.length === 1 ? "" : "s"}</span> : null}
          </label>

          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            AI is used only to organize, summarize, detect similar requests, and suggest priority. Submitting feedback does not automatically create code, branches, or releases.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={loading || !description.trim()} className="bg-orange-600 text-white hover:bg-orange-500">
            {loading ? "Submitting…" : "Send Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
