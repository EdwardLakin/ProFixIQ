"use client";

import { useEffect, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";
import { toast } from "sonner";

interface Assignable {
  id: string;
  full_name: string | null;
  role: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderLineId: string;
  initialMechanics?: Assignable[];
  mechanics?: Assignable[];
  onAssigned?: (techId: string) => void | Promise<void>;
}

export default function AssignTechModal({
  isOpen,
  onClose,
  workOrderLineId,
  initialMechanics,
  mechanics,
  onAssigned,
}: Props) {
  const [users, setUsers] = useState<Assignable[]>(() => mechanics ?? initialMechanics ?? []);
  const [techId, setTechId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const pref = mechanics ?? initialMechanics;
    if (pref && pref.length) {
      setUsers(pref);
      setLoadError(null);
      return;
    }

    (async () => {
      setLoadError(null);
      try {
        const params = new URLSearchParams({ work_order_line_id: workOrderLineId });
        const res = await fetch(`/api/assignables?${params.toString()}`);
        const json = (await res.json().catch(() => null)) as { data?: Assignable[]; error?: string; message?: string } | null;
        if (!res.ok || !Array.isArray(json?.data)) {
          throw new Error(json?.message || json?.error || "Unable to load assignable technicians.");
        }
        setUsers(json.data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unable to load assignable technicians.";
        setUsers([]);
        setLoadError(msg);
      }
    })();
  }, [isOpen, mechanics, initialMechanics, workOrderLineId]);

  const submit = async () => {
    if (submitting) return;

    if (!techId) {
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/work-orders/assign-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_order_line_id: workOrderLineId,
          tech_id: techId,
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Failed to update primary tech.");
      }

      toast.success("Primary tech updated.");
      await onAssigned?.(techId);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update primary tech.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Set primary tech"
      submitText={submitting ? "Assigning…" : "Assign"}
      size="sm"
    >
      <p className="mb-2 text-xs text-muted-foreground">
        Primary tech is the operational owner. Additional techs are supporting collaborators.
      </p>
      {loadError && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {loadError}
        </div>
      )}
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Choose primary tech
        </span>
        <select
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          value={techId}
          onChange={(e) => setTechId(e.target.value)}
          disabled={Boolean(loadError) || users.length === 0}
        >
          <option value="">Select…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name ?? "(no name)"} {u.role ? `(${u.role})` : ""}
            </option>
          ))}
        </select>
      </label>
    </ModalShell>
  );
}
