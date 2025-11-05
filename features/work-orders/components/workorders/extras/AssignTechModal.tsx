"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ModalShell from "@/features/shared/components/ModalShell";

type Mechanic = {
  id: string;
  full_name: string | null;
  role: string | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderLineId: string;
  onAssigned?: (techId: string) => void | Promise<void>;
  // 👇 we'll accept a pre-fetched list from the page
  mechanics?: Mechanic[];
}

export default function AssignTechModal(props: Props) {
  const { isOpen, onClose, workOrderLineId, onAssigned, mechanics } = props;
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [users, setUsers] = useState<Mechanic[]>([]);
  const [techId, setTechId] = useState<string>("");

  // load mechanics when opened
  useEffect(() => {
    if (!isOpen) return;

    // if the page already fetched them, just use that
    if (mechanics && mechanics.length) {
      setUsers(mechanics);
      return;
    }

    // otherwise, fall back to the server route (not RLS-blocked)
    (async () => {
      try {
        const res = await fetch("/api/assignables");
        const json = await res.json();
        if (res.ok && Array.isArray(json.data)) {
          setUsers(json.data);
        } else {
          // last resort: try direct supabase
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .in("role", ["mechanic", "tech", "foreman", "lead_hand"])
            .order("full_name", { ascending: true });
          setUsers((data as Mechanic[]) ?? []);
        }
      } catch {
        // final fallback: empty
        setUsers([]);
      }
    })();
  }, [isOpen, mechanics, supabase]);

  const submit = async () => {
    if (!techId) {
      onClose();
      return;
    }

    // call API to do the assignment so RLS on work_order_lines doesn't bite us
    const res = await fetch("/api/work-orders/assign-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        work_order_line_id: workOrderLineId,
        tech_id: techId,
      }),
    });

    const j = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      alert(j.error || "Failed to assign mechanic");
      return;
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