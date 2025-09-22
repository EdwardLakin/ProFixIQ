"use client";

import { Dialog } from "@headlessui/react";
import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export default function NewChatModal(props: any) {
  const {
    isOpen,
    onClose,
    onCreated,
    created_by,
    context_type = null,
    context_id = null,
  } = props;

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .order("full_name", { ascending: true });
      if (error) {
        console.error(error);
        toast.error("Failed to load users");
        return;
      }
      setUsers(data ?? []);
    })();
  }, [isOpen, supabase]);

  const toggleUser = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const toggleRole = (role: string) =>
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const handleCreate = async () => {
    if (loading) return;

    const conversationId = uuidv4();
    const participants = new Set<string>(selectedIds);
    for (const u of users) {
      if (u.role && selectedRoles.includes(u.role)) participants.add(u.id);
    }
    if (participants.size < 2) {
      toast.error("Select at least one other participant");
      return;
    }

    setLoading(true);

    const conversation = {
      id: conversationId,
      created_by,
      context_type,
      context_id,
    };

    const { error: convError } = await supabase.from("conversations").insert(conversation);
    if (convError) {
      console.error(convError);
      toast.error("Failed to create conversation");
      setLoading(false);
      return;
    }

    const inserts = Array.from(participants).map((user_id) => ({
      id: uuidv4(),
      conversation_id: conversationId,
      user_id,
    }));
    const { error: partErr } = await supabase.from("conversation_participants").insert(inserts);
    if (partErr) {
      console.error(partErr);
      toast.error("Failed to add participants");
      setLoading(false);
      return;
    }

    toast.success("Chat created");
    setLoading(false);
    onCreated(conversationId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-lg rounded bg-white p-6 text-black dark:bg-neutral-900 dark:text-white">
          <Dialog.Title className="text-lg font-semibold">Start New Chat</Dialog.Title>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium">Select Users</label>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {users.map((u) => (
                <label key={u.id} className="block text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />{" "}
                  {u.full_name ?? "(no name)"} {u.role ? `(${u.role})` : ""}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium">Add Role Groups</label>
            <div className="flex flex-wrap gap-2">
              {["tech", "advisor", "parts", "foreman", "lead_hand"].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`rounded px-2 py-1 text-sm ${
                    selectedRoles.includes(role)
                      ? "bg-orange-600 text-white"
                      : "bg-neutral-800 text-neutral-200"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Creating…" : "Create Chat"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}