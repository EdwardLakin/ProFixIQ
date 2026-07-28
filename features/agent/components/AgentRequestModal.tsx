"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";
import { Textarea } from "@shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
};

type AgentIntentUi =
  | "feature_request"
  | "bug_report"
  | "inspection_catalog_add"
  | "service_catalog_add"
  | "refactor"
  | "unclear";

function newRequestId(): string {
  const cryptoApi = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

const labelClass =
  "text-xs font-medium uppercase tracking-wider text-[color:var(--theme-text-secondary)]";
const selectClass =
  "h-10 w-full rounded-[var(--theme-radius-md,0.5rem)] border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm text-[color:var(--theme-input-text)] outline-none transition focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_22%,transparent)]";

export default function AgentRequestModal({ open, onOpenChange }: Props) {
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<AgentIntentUi>("unclear");
  const [location, setLocation] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [device, setDevice] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(event.target.files ? Array.from(event.target.files) : []);
  }

  async function uploadScreenshots(): Promise<string[]> {
    if (!files.length) return [];

    const supabase = createBrowserSupabase();
    const uploadedPaths: string[] = [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? "anonymous";

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("agent_uploads")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) {
        console.error("agent_uploads upload error:", error);
        toast.error(`Failed to upload ${file.name}`);
        continue;
      }
      uploadedPaths.push(path);
    }

    return uploadedPaths;
  }

  function resetForm() {
    setDescription("");
    setIntent("unclear");
    setLocation("");
    setSteps("");
    setExpected("");
    setActual("");
    setDevice("");
    setFiles([]);
  }

  async function submit() {
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createBrowserSupabase();
      const requestId = newRequestId();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const attachmentIds = await uploadScreenshots();

      const context: Record<string, unknown> = { requestId };
      if (location.trim()) context.location = location.trim();
      if (steps.trim()) context.steps = steps.trim();
      if (expected.trim()) context.expected = expected.trim();
      if (actual.trim()) context.actual = actual.trim();
      if (device.trim()) context.device = device.trim();
      if (attachmentIds.length) context.attachmentIds = attachmentIds;

      const response = await fetch("/api/agent/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          context,
          description: description.trim(),
          intent,
          reporterId: user?.id ?? undefined,
          location: location.trim() || undefined,
          steps: steps.trim() || undefined,
          expected: expected.trim() || undefined,
          actual: actual.trim() || undefined,
          device: device.trim() || undefined,
          attachmentIds: attachmentIds.length ? attachmentIds : undefined,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.error("Agent request POST failed", response.status, text);
        toast.error("Failed to submit request");
        return;
      }

      toast.success("Request submitted to ProFixIQ-Agent");
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = hydrated && Boolean(description.trim()) && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit a Request</DialogTitle>
          <DialogDescription>
            Use this for QA or feature ideas. Be specific so the agent and developers
            know exactly where to look.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-request-type" className={labelClass}>
              Type
            </label>
            <select
              id="agent-request-type"
              value={intent}
              onChange={(event) => setIntent(event.target.value as AgentIntentUi)}
              className={selectClass}
            >
              <option value="feature_request">Feature Request</option>
              <option value="bug_report">Bug Report</option>
              <option value="inspection_catalog_add">Add to Inspection Catalog</option>
              <option value="service_catalog_add">Add to Service Catalog</option>
              <option value="refactor">Refactor / Cleanup</option>
              <option value="unclear">Not sure / General feedback</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-request-description" className={labelClass}>
              Description
            </label>
            <Textarea
              id="agent-request-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Example: In inspections > work order #24, the corner grid tabbing jumps out of the grid and moves focus to the footer."
              className="h-32 resize-y"
            />
            <p className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
              Include which screen, what you were doing, and what went wrong. Mention
              specific grids, buttons, or rows when possible.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-request-location" className={labelClass}>
                Where in the app?
              </label>
              <Input
                id="agent-request-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Ex: Inspections → Corner grid, top-right card"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-request-device" className={labelClass}>
                Device / Browser
              </label>
              <Input
                id="agent-request-device"
                value={device}
                onChange={(event) => setDevice(event.target.value)}
                placeholder="Ex: iPad 11” (Safari), MacBook (Chrome)"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-request-steps" className={labelClass}>
              Steps to Reproduce
            </label>
            <Textarea
              id="agent-request-steps"
              value={steps}
              onChange={(event) => setSteps(event.target.value)}
              placeholder={
                "1. Open work order #...\n2. Go to Inspections tab\n3. Click into corner grids section\n4. Press Tab key from first field..."
              }
              className="h-28 resize-y"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-request-expected" className={labelClass}>
                Expected
              </label>
              <Textarea
                id="agent-request-expected"
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                placeholder="What you expected to happen."
                className="h-24 resize-y"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="agent-request-actual" className={labelClass}>
                Actual
              </label>
              <Textarea
                id="agent-request-actual"
                value={actual}
                onChange={(event) => setActual(event.target.value)}
                placeholder="What actually happened, including any errors."
                className="h-24 resize-y"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-request-screenshots" className={labelClass}>
              Screenshots
            </label>
            <input
              id="agent-request-screenshots"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="text-xs text-[color:var(--theme-text-secondary)] file:mr-3 file:rounded-[var(--theme-radius-md,0.5rem)] file:border file:border-[color:var(--theme-input-border)] file:bg-[color:var(--theme-surface-subtle)] file:px-3 file:py-2 file:text-[color:var(--theme-text-primary)]"
            />
            {files.length > 0 ? (
              <p className="text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                {files.length} file{files.length > 1 ? "s" : ""} selected
              </p>
            ) : null}
            <p className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
              Attach clear screenshots of the issue. They are stored securely and
              linked to this request.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            isLoading={loading}
            className="border border-[color:var(--brand-primary)] bg-[color:var(--theme-button-primary-bg)] text-[color:var(--theme-button-primary-text)] hover:brightness-105"
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
