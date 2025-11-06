"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ModalShell from "@/features/shared/components/ModalShell";

interface Assignable {
  id: string;
  full_name: string | null;
  role: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderLineId: string;
  // name we originally used
  initialMechanics?: Assignable[];
  // name your page is currently passing
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
  const [users, setUsers] = useState<Assignable[]>(() => {
    // prefer the prop the page is actually sending
    return mechanics ?? initialMechanics ?? [];
  });
  const [techId, setTechId] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;

    // highest priority: whatever the parent gave us
    const pref = mechanics ?? initialMechanics;
    if (pref && pref.length) {
      setUsers(pref);
      return;
    }

    // otherwise go through the server route
    (async () => {
      try {
        const res = await fetch("/api/assignables");
        const json = await res.json();
        if (res.ok && Array.isArray(json.data)) {
          setUsers(json.data);
        } else {
          // fallback to supabase direct
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .in("role", ["mechanic", "tech", "foreman", "lead_hand"])
            .order("full_name", { ascending: true });
          setUsers((data as Assignable[]) ?? []);
        }
      } catch {
        // ignore
      }
    })();
  }, [isOpen, mechanics, initialMechanics, supabase]);

  const submit = async () => {
    if (!techId) {
      onClose();
      return;
    }

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
        // fallback to simple column update if the api route is not ready
        await supabase
          .from("work_order_lines")
          .update({ assigned_to: techId })
          .eq("id", workOrderLineId);
      }
    } catch {
      // ignore, we tried
    }

    await onAssigned?.(techId);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Assign mechanic"
      submitText="Assign"
      size="sm"
    >
      <select
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-white"
        value={techId}
        onChange={(e) => setTechId(e.target.value)}
      >
        <option value="">Choose a mechanic…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name ?? "(no name)"} {u.role ? `(${u.role})` : ""}
          </option>
        ))}
      </select>
    </ModalShell>
  );
}