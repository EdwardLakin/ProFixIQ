"use client";

import { Dialog } from "@headlessui/react";
import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type UserRow = { id: string; full_name: string | null; role: string | null };

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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

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
      setUsers((data ?? []) as UserRow[]);
      setQ("");
      setSelectedIds([]);
      setSelectedRoles([]);
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

    // add role group members
    for (const u of users) {
      if (u.role && selectedRoles.includes(u.role)) participants.add(u.id);
    }

    // Require at least the creator + one more participant
    if (participants.size < 1) {
      toast.error("Select at least one participant");
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
    onCreated?.(conversationId);
    onClose();
  };

  const ROLES = ["tech", "advisor", "parts", "foreman", "lead_hand"];

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users;
    return users.filter((u) => {
      const n = (u.full_name || "").toLowerCase();
      const r = (u.role || "").toLowerCase();
      return n.includes(t) || r.includes(t);
    });
  }, [users, q]);

  const selectedCount =
    new Set([
      ...selectedIds,
      ...users.filter((u) => u.role && selectedRoles.includes(u.role!)).map((u) => u.id),
    ]).size;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[320] flex items-center justify-center"
    >
      {/* Backdrop above FocusedJobModal */}
      <div className="fixed inset-0 z-[320] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div className="relative z-[330] mx-4 my-6 w-full max-w-xl">
        <Dialog.Panel className="w-full rounded-lg border border-orange-400 bg-neutral-950 p-6 text-white shadow-xl">
          <Dialog.Title className="text-lg font-header font-semibold tracking-wide">
            Start New Chat
          </Dialog.Title>

          {/* Small summary */}
          <div className="mt-2 text-xs text-neutral-400">
            Select users and/or whole roles. <span className="text-neutral-300">Selected: {selectedCount}</span>
          </div>

          {/* Search */}
          <div className="mt-3">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users by name or role…"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm placeholder-neutral-500"
            />
          </div>

          {/* Role chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            {ROLES.map((role) => {
              const active = selectedRoles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors
                    ${active ? "bg-orange-600 text-black" : "border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"}`}
                  title={active ? `Remove ${role}` : `Add ${role}`}
                >
                  {active ? "✓ " : ""}{role}
                </button>
              );
            })}
          </div>

          {/* Users list */}
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/60">
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-xs text-neutral-400">
              <span>Users</span>
              <span>{filtered.length} total</span>
            </div>
            <div className="max-h-56 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-neutral-500">No matches.</div>
              ) : (
                <ul className="space-y-1">
                  {filtered.map((u) => {
                    const checked = selectedIds.includes(u.id);
                    return (
                      <li key={u.id}>
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-800"
                          title={u.role || ""}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-orange-500"
                            checked={checked}
                            onChange={() => toggleUser(u.id)}
                          />
                          <span className="truncate">
                            {u.full_name ?? "(no name)"}{" "}
                            <span className="text-xs text-neutral-400">{u.role ? `• ${u.role}` : ""}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between gap-2">
            <div className="text-xs text-neutral-400">
              {selectedRoles.length > 0 && (
                <span>
                  Roles:{" "}
                  {selectedRoles.map((r) => (
                    <span key={r} className="mr-1 rounded bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-200">
                      {r}
                    </span>
                  ))}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="font-header rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="font-header rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-500 disabled:opacity-60"
                disabled={loading}
              >
                {loading ? "Creating…" : "Create Chat"}
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}