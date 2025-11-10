"use client";

import { Dialog } from "@headlessui/react";
import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type UserRow = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (conversationId: string) => void;
  created_by: string;
  context_type?: string | null;
  context_id?: string | null;
};

export default function NewChatModal({
  isOpen,
  onClose,
  onCreated,
  created_by,
  context_type = null,
  context_id = null,
}: Props) {
  // still need supabase for creating the conversation itself
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  // 🚩 NEW: load users from our server route (bypasses RLS)
  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      try {
        const res = await fetch("/api/chat/users");
        if (!res.ok) {
          toast.error("Failed to load users");
          return;
        }
        const body = (await res.json()) as { users: UserRow[] };
        setUsers(body.users ?? []);
        setSelectedIds([]);
        setSelectedRoles([]);
        setQ("");
      } catch (err) {
        console.error(err);
        toast.error("Failed to load users");
      }
    })();
  }, [isOpen]);

  const toggleUser = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );

  const toggleRole = (role: string) =>
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  const ROLES = ["tech", "advisor", "parts", "foreman", "lead_hand"];

  const filteredUsers = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        (u.full_name ?? "").toLowerCase().includes(term) ||
        (u.role ?? "").toLowerCase().includes(term),
    );
  }, [users, q]);

  const selectedCount = new Set([
    ...selectedIds,
    ...users
      .filter((u) => u.role && selectedRoles.includes(u.role))
      .map((u) => u.id),
  ]).size;

  const handleCreate = async () => {
    if (loading) return;

    // collect participants from user checkboxes + selected roles
    const participants = new Set<string>(selectedIds);
    for (const u of users) {
      if (u.role && selectedRoles.includes(u.role)) {
        participants.add(u.id);
      }
    }

    if (participants.size < 1) {
      toast.error("Select at least one participant");
      return;
    }

    setLoading(true);
    const conversationId = uuidv4();

    try {
      // create the conversation
      const { error: convError } = await supabase.from("conversations").insert({
        id: conversationId,
        created_by,
        context_type,
        context_id,
      });
      if (convError) throw convError;

      // add participants
      const inserts = Array.from(participants).map((user_id) => ({
        id: uuidv4(),
        conversation_id: conversationId,
        user_id,
      }));

      const { error: partErr } = await supabase
        .from("conversation_participants")
        .insert(inserts);
      if (partErr) throw partErr;

      toast.success("Chat created");
      onCreated?.(conversationId);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Failed to create chat");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-[510] w-full max-w-xl">
        <Dialog.Panel className="w-full rounded-lg border border-neutral-700 bg-neutral-950 text-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <Dialog.Title className="text-base font-header font-semibold tracking-wide text-white">
              Start New Chat
            </Dialog.Title>
            <button
              onClick={onClose}
              className="rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4">
            <div className="text-xs text-neutral-400">
              Select users and/or roles.{" "}
              <span className="text-neutral-100">Selected: {selectedCount}</span>
            </div>

            {/* Search */}
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or role..."
              className="mt-3 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-400 focus:outline-none"
            />

            {/* Roles */}
            <div className="mt-3 flex flex-wrap gap-2">
              {ROLES.map((role) => {
                const active = selectedRoles.includes(role);
                return (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? "bg-orange-500 text-black"
                        : "border border-neutral-700 bg-neutral-900 text-white hover:bg-neutral-800"
                    }`}
                  >
                    {active ? "✓ " : ""}
                    {role}
                  </button>
                );
              })}
            </div>

            {/* Users List */}
            <div className="mt-4 rounded border border-neutral-800 bg-neutral-900/50">
              <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                <span>Users</span>
                <span>{filteredUsers.length} total</span>
              </div>
              <div className="max-h-56 overflow-y-auto p-2">
                {filteredUsers.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-neutral-500">
                    No matches.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filteredUsers.map((u) => {
                      const checked = selectedIds.includes(u.id);
                      return (
                        <li key={u.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-800">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-orange-500"
                              checked={checked}
                              onChange={() => toggleUser(u.id)}
                            />
                            <span className="truncate">
                              {u.full_name ?? "(no name)"}{" "}
                              {u.role && (
                                <span className="text-xs text-neutral-500">
                                  • {u.role}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-neutral-800 px-5 py-4">
            <button
              onClick={onClose}
              className="rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
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