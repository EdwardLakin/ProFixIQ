//features/agent/components/AgentRequestModal.tsx
"use client";

import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@shared/components/ui/dialog";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export default function AgentRequestModal({ open, onOpenChange }: Props) {
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<"feature" | "bug" | "unclear">("unclear");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/agent/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          intent,
        }),
      });

      if (!res.ok) {
        toast.error("Failed to submit request");
      } else {
        toast.success("Request submitted!");
        setDescription("");
        setIntent("unclear");
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
        </DialogHeader>

        {/* INTENT SELECTOR */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400 uppercase tracking-wider">Type</label>
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as any)}
            className="rounded-md bg-neutral-900 text-neutral-200 border border-white/10 px-2 py-1 text-sm"
          >
            <option value="feature">Feature Request</option>
            <option value="bug">Bug Report</option>
            <option value="unclear">General Feedback</option>
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
            placeholder="Describe the issue or feature request..."
            className="bg-neutral-900 text-neutral-200 border-white/10 h-32"
          />
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
