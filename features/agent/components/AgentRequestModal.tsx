"use client";

import { useState } from "react";
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

export default function AgentRequestModal({ open, onOpenChange }: Props) {
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<AgentIntentUi>("unclear");

  // v2 structured QA context
  const [location, setLocation] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [device, setDevice] = useState("");
  // Placeholder for future screenshot integration (agent_attachments ids)
  const [attachmentIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }

    setLoading(true);

    try {
      const context: Record<string, unknown> = {};

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
          description: description.trim(),
          intent,
          context: Object.keys(context).length ? context : undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Agent request POST failed", res.status, text);
        toast.error("Failed to submit request");
      } else {
        toast.success("Request submitted to ProFixIQ-Agent");
        setDescription("");
        setIntent("unclear");
        setLocation("");
        setSteps("");
        setExpected("");
        setActual("");
        setDevice("");
        // attachmentIds will be set once screenshot upload is wired
        onOpenChange(false);
      }
    } catch (err) {
      toast.error("Something went wrong.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

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
              <option value="inspection_catalog_add">
                Add to Inspection Catalog
              </option>
              <option value="service_catalog_add">
                Add to Service Catalog
              </option>
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

          {/* Screenshots – wired later via agent_attachments */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 uppercase tracking-wider">
              Screenshots (coming next)
            </label>
            <p className="text-[0.7rem] text-neutral-500">
              You’ll be able to attach screenshots directly here. For now, paste
              links or mention “screenshot uploaded to agent folder” in the
              description.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/20 text-neutral-300"
          >
            Cancel
          </Button>

          <Button
            onClick={submit}
            disabled={loading}
            className="bg-orange-600 hover:bg-orange-500 text-black font-semibold"
          >
            {loading ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}