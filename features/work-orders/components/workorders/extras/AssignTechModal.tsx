"use client";

import { useEffect, useRef, useState } from "react";
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
  expectedUpdatedAt?: string | null;
  initialMechanics?: Assignable[];
  mechanics?: Assignable[];
  onAssigned?: (techId: string | null) => void | Promise<void>;
}

export default function AssignTechModal({
  isOpen,
  onClose,
  workOrderLineId,
  expectedUpdatedAt,
  initialMechanics,
  mechanics,
  onAssigned,
}: Props) {
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

    void (async () => {
      try {
        const res = await fetch("/api/assignables");
        const json = (await res.json().catch(() => null)) as { data?: Assignable[] } | null;
        if (res.ok && Array.isArray(json?.data)) {
          setUsers(json.data);
          return;
        }
        setUsers([]);
        toast.error("Assignable technicians could not be loaded.");
      } catch {
        setUsers([]);
        toast.error("Assignable technicians could not be loaded.");
      }
    })();
  }, [isOpen, mechanics, initialMechanics]);

  const submit = async () => {
    if (submitting) return;

    if (!techId) {
      onClose();
      return;
    }

    setSubmitting(true);
    const technicianId = techId === "__clear__" ? null : techId;
    const existingOperation = assignmentOperationRef.current;
    const operationKey =
      existingOperation?.technicianId === techId
        ? existingOperation.operationKey
        : createAssignTechnicianOperationKey(workOrderLineId, technicianId);
    assignmentOperationRef.current = { technicianId: techId, operationKey };

    try {
      await assignWorkOrderLineTechnician({
        lineId: workOrderLineId,
        technicianId,
        action: technicianId ? "set_primary" : "clear",
        expectedUpdatedAt,
        operationKey,
      });
      await onAssigned?.(technicianId);
      if (assignmentOperationRef.current?.operationKey === operationKey) {
        assignmentOperationRef.current = null;
      }
      toast.success(
        technicianId
          ? "Primary tech updated."
          : "Technician assignment cleared.",
      );
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
          <option value="__clear__">Unassigned (clear all)</option>
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
