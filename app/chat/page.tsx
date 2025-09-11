"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import RecipientPickerModal from "@/features/shared/chat/components/RecipientPickerModalWrapper";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type ListItem = {
  chatId: string;
  lastMessage: MessageRow;
  otherUsers: Array<Pick<ProfileRow, "id" | "full_name" | "role">>;
};

export default function ChatListPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [me, setMe] = useState<string | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);

  // who am I?
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
    })();
  }, [supabase]);

  // newest message per chat_id
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(400);

      if (error || !data) {
        if (mounted) {
          setItems([]);
          setLoading(false);
        }
        return;
      }

      const latestPer = new Map<string, MessageRow>();
      for (const m of data as MessageRow[]) {
        if (!m.chat_id) continue;
        if (!latestPer.has(m.chat_id)) latestPer.set(m.chat_id, m);
      }

      const ids = new Set<string>();
      for (const m of latestPer.values()) {
        if (m.sender_id) ids.add(m.sender_id);
        const recips = Array.isArray(m.recipients) ? m.recipients.map(String) : [];
        for (const r of recips) ids.add(r);
      }

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", Array.from(ids));

      const profMap = new Map<string, Pick<ProfileRow, "id" | "full_name" | "role">>();
      for (const p of (profs ?? [])) {
        profMap.set(p.id, { id: p.id, full_name: p.full_name, role: p.role });
      }

      const list: ListItem[] = Array.from(latestPer.values()).map((last) => {
        const chatId = last.chat_id as string;
        const all = new Set<string>([
          ...(Array.isArray(last.recipients) ? last.recipients.map(String) : []),
          ...(last.sender_id ? [last.sender_id] : []),
        ]);
        const otherIds = me ? Array.from(all).filter((x) => x !== me) : Array.from(all);
        const otherUsers = otherIds
          .map((id) => profMap.get(id))
          .filter((v): v is NonNullable<typeof v> => Boolean(v));

        return { chatId, lastMessage: last, otherUsers };
      });

      if (mounted) setItems(list);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, me]);

  // live refresh on new message
  useEffect(() => {
    const ch = supabase
      .channel("messages-list")
      .on("postgres_changes", { schema: "public", table: "messages", event: "INSERT" }, () => {
        window.location.reload();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  // Start a chat via RPC — omit _chat_id to allow create/reuse
  async function handleStartChat(userIds: string[], groupName?: string): Promise<void> {
    if (userIds.length === 0) return;

    const { data, error } = await supabase.rpc("chat_post_message", {
      _recipients: userIds,
      _content:
        groupName && groupName.trim().length > 0
          ? `Started group: ${groupName.trim()}`
          : "Started conversation",
      // intentionally omitted: _chat_id
    });

    if (error || !data) return;
    const chatId: string = String(data);
    window.location.href = `/chat/${chatId}`;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Conversations</h1>
        <button
          className="rounded bg-orange-600 px-3 py-2 font-semibold text-black hover:bg-orange-700"
          onClick={() => setPickerOpen(true)}
        >
          New Conversation
        </button>
      </div>

      {loading ? (
        <div className="text-neutral-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-neutral-300">
          No conversations yet. Start one!
        </div>
      ) : (
        <ul className="divide-y divide-neutral-800 rounded border border-neutral-800 bg-neutral-900">
          {items.map(({ chatId, lastMessage, otherUsers }) => {
            const title =
              otherUsers.length > 0
                ? otherUsers.map((u) => u.full_name ?? "User").join(", ")
                : "Group / Untitled";
            const preview = (lastMessage.content ?? "").slice(0, 160);

            return (
              <li key={chatId} className="p-3 hover:bg-neutral-800/60">
                <Link href={`/chat/${chatId}`} className="block">
                  <div className="font-medium">{title}</div>
                  <div className="mt-1 truncate text-sm text-neutral-400">{preview || "…"}</div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <RecipientPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onStartChat={handleStartChat}
        allowGroup
      />
    </div>
  );
}