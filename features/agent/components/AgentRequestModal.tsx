// features/agent/components/AgentRequestModal.tsx (FULL FILE REPLACEMENT)

"use client";

import { useState, useEffect, ChangeEvent } from "react";
import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@shared/components/ui/dialog";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

// UI intent values → backend enum-ish strings
type AgentIntentUi =
  | "feature_request"
  | "bug_report"
  | "inspection_catalog_add"
  | "service_catalog_add"
  | "refactor"
  | "unclear";

function newRequestId(): string {
  // Works in modern browsers; safe fallback included.
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // fallback: not perfect, but better than missing ids
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function AgentRequestModal({ open, onOpenChange }: Props) {
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<AgentIntentUi>("unclear");

  // v2 structured QA context
  const [location, setLocation] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [device, setDevice] = useState("");

  // Local files → uploaded to Supabase on submit
  const [files, setFiles] = useState<File[]>([]);

  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Avoid “click before hydration” doing nothing
  useEffect(() => {
    setHydrated(true);
  }, []);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) {
      setFiles([]);
      return;
    }
    setFiles(Array.from(list));
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
      const timestamp = Date.now();
      const path = `${userId}/${timestamp}-${safeName}`;

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

  async function submit() {
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createBrowserSupabase();

      // Generate a stable requestId here so EVERYTHING can correlate.
      const requestId = newRequestId();

      // Get reporterId (user id) if available.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const reporterId = user?.id ?? null;

      // 1) Upload screenshots first (if any)
      const attachmentIds = await uploadScreenshots();

      // 2) Build context
      const context: Record<string, unknown> = { requestId };
      if (location.trim()) context.location = location.trim();
      if (steps.trim()) context.steps = steps.trim();
      if (expected.trim()) context.expected = expected.trim();
      if (actual.trim()) context.actual = actual.trim();
      if (device.trim()) context.device = device.trim();
      if (attachmentIds.length) context.attachmentIds = attachmentIds;

      const res = await fetch("/api/agent/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // ✅ critical correlation fields
          requestId,
          context,

          // request info
          description: description.trim(),
          intent,

          // useful metadata (optional but helpful)
          reporterId: reporterId ?? undefined,

          // these top-level fields match your CreateAgentRequestBody (if you support them)
          location: location.trim() || undefined,
          steps: steps.trim() || undefined,
          expected: expected.trim() || undefined,
          actual: actual.trim() || undefined,
          device: device.trim() || undefined,
          attachmentIds: attachmentIds.length ? attachmentIds : undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Agent request POST failed", res.status, text);
        toast.error("Failed to submit request");
        return;
      }

      toast.success("Request submitted to ProFixIQ-Agent");

      // reset
      setDescription("");
      setIntent("unclear");
      setLocation("");
      setSteps("");
      setExpected("");
      setActual("");
      setDevice("");
      setFiles([]);
      onOpenChange(false);
    } catch (err) {
      toast.error("Something went wrong.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = hydrated && !!description.trim() && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/80 border border-white/10 text-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-blackops tracking-[0.15em] text-neutral-200 uppercase">
            Submit a Request
          </DialogTitle>
          <p className="mt-1 text-xs text-neutral-500">
            Use this for QA or feature ideas. Be specific so the agent and
            developers know exactly where to look.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* INTENT SELECTOR */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400 uppercase tracking-wider">
              Type
            </label>
            <select
              value={intent}
              onChange={(e) => setIntent(e.target.value as AgentIntentUi)}
              className="rounded-md bg-neutral-900 text-neutral-200 border border-white/10 px-2 py-1 text-sm"
            >
              <option value="feature_request">Feature Request</option>
              <option value="bug_report">Bug Report</option>
              <option value="inspection_catalog_add">Add to Inspection Catalog</option>
              <option value="service_catalog_add">Add to Service Catalog</option>
              <option value="refactor">Refactor / Cleanup</option>
              <option value="unclear">Not sure / General feedback</option>
            </select>
          </div>

          {/* DESCRIPTION */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400 uppercase tracking-wider">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Example: In inspections > work order #24, the corner grid tabbing jumps out of the grid and moves focus to the footer."
              className="bg-neutral-900 text-neutral-200 border-white/10 h-32"
            />
            <p className="text-[0.7rem] text-neutral-500">
              Include which screen, what you were doing, and what went wrong.
              Mention specific grids, buttons, or rows when possible.
            </p>
          </div>

          {/* CONTEXT: LOCATION + DEVICE */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400 uppercase tracking-wider">
                Where in the app?
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Inspections → Corner grid step, top-right card"
                className="rounded-md bg-neutral-900 text-neutral-200 border border-white/10 px-2 py-1 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400 uppercase tracking-wider">
                Device / Browser
              </label>
              <input
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="Ex: iPad 11” (Safari), MacBook (Chrome)"
                className="rounded-md bg-neutral-900 text-neutral-200 border border-white/10 px-2 py-1 text-sm"
              />
            </div>
          </div>

          {/* STEPS */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400 uppercase tracking-wider">
              Steps to Reproduce
            </label>
            <Textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={`1. Open work order #...\n2. Go to Inspections tab\n3. Click into corner grids section\n4. Press Tab key from first field...`}
              className="bg-neutral-900 text-neutral-200 border-white/10 h-28"
            />
          </div>

          {/* EXPECTED vs ACTUAL */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400 uppercase tracking-wider">
                Expected
              </label>
              <Textarea
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="What you expected to happen."
                className="bg-neutral-900 text-neutral-200 border-white/10 h-20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400 uppercase tracking-wider">
                Actual
              </label>
              <Textarea
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="What actually happened, including any errors."
                className="bg-neutral-900 text-neutral-200 border-white/10 h-20"
              />
            </div>
          </div>

          {/* Screenshots */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-400 uppercase tracking-wider">
              Screenshots
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="text-xs text-neutral-300"
            />
            {files.length > 0 && (
              <p className="text-[0.7rem] text-neutral-500">
                {files.length} file{files.length > 1 ? "s" : ""} selected
              </p>
            )}
            <p className="text-[0.7rem] text-neutral-500">
              Attach clear screenshots of the issue. These will be stored in the
              secure <code>agent_uploads</code> bucket and linked to this request.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            className="border-white/20 text-neutral-300"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="bg-orange-600 hover:bg-orange-500 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}