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

    for (const u of users) {
      if (u.role && selectedRoles.includes(u.role)) participants.add(u.id);
    }

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
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="relative z-[510] w-full max-w-xl">
        <Dialog.Panel className="w-full rounded-lg border border-border bg-background text-foreground shadow-xl dark:border-orange-400/90 dark:bg-neutral-950">
          <Dialog.Title className="border-b border-border/60 px-6 py-4 text-lg font-header font-semibold tracking-wide dark:border-neutral-800">
            Start New Chat
          </Dialog.Title>

          <div className="px-6 py-5">
            <div className="text-xs text-muted-foreground dark:text-neutral-400">
              Select users and/or whole roles.{" "}
              <span className="text-foreground dark:text-neutral-200">
                Selected: {selectedCount}
              </span>
            </div>

            <div className="mt-3">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search users by name or role…"
                className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {ROLES.map((role) => {
                const active = selectedRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-orange-500 text-black"
                        : "border border-border/60 bg-background text-foreground hover:bg-muted dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {active ? "✓ " : ""}
                    {role}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-lg border border-border/60 bg-background/40 dark:border-neutral-800 dark:bg-neutral-900/60">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs text-muted-foreground dark:border-neutral-800 dark:text-neutral-400">
                <span>Users</span>
                <span>{filtered.length} total</span>
              </div>
              <div className="max-h-56 overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground dark:text-neutral-500">
                    No matches.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filtered.map((u) => {
                      const checked = selectedIds.includes(u.id);
                      return (
                        <li key={u.id}>
                          <label
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted dark:hover:bg-neutral-800"
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
                              <span className="text-xs text-muted-foreground dark:text-neutral-400">
                                {u.role ? `• ${u.role}` : ""}
                              </span>
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

          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-6 py-4 dark:border-neutral-800">
            <div className="text-xs text-muted-foreground dark:text-neutral-400">
              {selectedRoles.length > 0 &&
                selectedRoles.map((r) => (
                  <span
                    key={r}
                    className="mr-1 rounded bg-muted px-2 py-0.5 text-[10px] text-foreground dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {r}
                  </span>
                ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="font-header rounded border border-border/70 bg-background px-4 py-2 text-sm hover:bg-muted dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="font-header rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
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