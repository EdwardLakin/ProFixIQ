"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ModalShell from "@/features/shared/components/ModalShell";
import { toast } from "sonner";
import {
  assignWorkOrderLineTechnician,
  createAssignTechnicianOperationKey,
} from "@/features/work-orders/lib/assignTechnicianClient";

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
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [users, setUsers] = useState<Assignable[]>(() => mechanics ?? initialMechanics ?? []);
  const [techId, setTechId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const assignmentOperationRef = useRef<{
    technicianId: string;
    operationKey: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const pref = mechanics ?? initialMechanics;
    if (pref && pref.length) {
      setUsers(pref);
      return;
    }

    (async () => {
      // try API first
      try {
        const res = await fetch("/api/assignables");
        const json = (await res.json().catch(() => null)) as { data?: Assignable[] } | null;
        if (res.ok && Array.isArray(json?.data)) {
          setUsers(json.data);
          return;
        }
      } catch {
        // fall through
      }

      // fallback to profiles query
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["mechanic", "tech", "foreman", "lead_hand"])
        .order("full_name", { ascending: true });

      setUsers((data as Assignable[]) ?? []);
    })();
  }, [isOpen, mechanics, initialMechanics, supabase]);

  const submit = async () => {
    if (submitting) return;

    if (!techId) {
      onClose();
      return;
    }

    setSubmitting(true);
    const existingOperation = assignmentOperationRef.current;
    const operationKey =
      existingOperation?.technicianId === techId
        ? existingOperation.operationKey
        : createAssignTechnicianOperationKey(workOrderLineId, techId);
    assignmentOperationRef.current = { technicianId: techId, operationKey };

    try {
      await assignWorkOrderLineTechnician({
        lineId: workOrderLineId,
        technicianId: techId,
        operationKey,
      });
      await onAssigned?.(techId);
      if (assignmentOperationRef.current?.operationKey === operationKey) {
        assignmentOperationRef.current = null;
      }
      toast.success("Primary tech updated.");
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
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Choose primary tech
        </span>
        <select
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground dark:border-[color:var(--theme-border-soft)] dark:bg-[color:var(--theme-surface-panel)] dark:text-[color:var(--theme-text-primary)]"
          value={techId}
          onChange={(e) => setTechId(e.target.value)}
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
