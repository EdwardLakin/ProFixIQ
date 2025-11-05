"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ModalShell from "@/features/shared/components/ModalShell";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderLineId: string;
  onAssigned?: (techId: string) => void | Promise<void>;
}

type Profile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

export default function AssignTechModal(props: any) {
  const { isOpen, onClose, workOrderLineId, onAssigned } = props as Props;
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [users, setUsers] = useState<Profile[]>([]);
  const [techId, setTechId] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        // 👇 include mechanic here
        .in("role", ["tech", "mechanic", "foreman", "lead_hand"])
        .order("full_name", { ascending: true });
      setUsers((data as Profile[]) ?? []);
    })();
  }, [isOpen, supabase]);

  const submit = async () => {
    if (!techId) return onClose();
    await supabase
      .from("work_order_lines")
      .update({ assigned_to: techId })
      .eq("id", workOrderLineId);
    await onAssigned?.(techId);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Assign Technician"
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