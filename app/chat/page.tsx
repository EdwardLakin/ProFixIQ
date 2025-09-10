// app/chat/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import RecipientPickerModal from "@/features/shared/chat/components/RecipientPickerModal";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type ListItem = {
  chatId: string; // always a string here (we coerce)
  lastMessage: MessageRow;
  otherUserIds: string[];
  otherUsers: Array<Pick<Profile, "id" | "full_name" | "role">>;
};

// Defensive helper: turn an unknown JSON value into string[]
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [];
}

export default function ChatListPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [me, setMe] = useState<string | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  // who am I?
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
    })();
  }, [supabase]);

  // Load latest messages and dedupe by chat_id (newest first)
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

      // Deduplicate by chat_id (keep the newest row for each chat)
      const seen = new Set<string>();
      const latestPer: MessageRow[] = [];
      for (const m of data as MessageRow[]) {
        const safeChatId = m.chat_id ?? ""; // null-safe
        if (!safeChatId) continue;
        if (!seen.has(safeChatId)) {
          seen.add(safeChatId);
          latestPer.push(m);
        }
      }

      // Collect all user ids we need to label the conversations
      const ids = new Set<string>();
      for (const m of latestPer) {
        if (m.sender_id) ids.add(m.sender_id);
        for (const r of toStringArray(m.recipients)) ids.add(r);
      }

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", Array.from(ids));

      const profMap = new Map(
        (profs ?? []).map((p) => [p.id, { id: p.id, full_name: p.full_name, role: p.role }]),
      );

      const list: ListItem[] = latestPer.map((last) => {
        const safeChatId = last.chat_id ?? ""; // enforce string
        const rawOther = new Set<string>([
          ...(last.sender_id ? [last.sender_id] : []),
          ...toStringArray(last.recipients),
        ]);

        const otherUserIds = me
          ? Array.from(rawOther).filter((x) => x !== me)
          : Array.from(rawOther);

        const otherUsers = otherUserIds
          .map((id) => profMap.get(id))
          .filter(Boolean) as Array<Pick<Profile, "id" | "full_name" | "role">>;

        return {
          chatId: safeChatId,
          lastMessage: last,
          otherUserIds,
          otherUsers,
        };
      });

      if (mounted) {
        setItems(list);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, me]);

  // Realtime: refresh list on new messages
  useEffect(() => {
    const channel = supabase
      .channel("messages-list")
      .on(
        "postgres_changes",
        { schema: "public", table: "messages", event: "INSERT" },
        () => {
          // Keep it simple: reload the page list
          location.reload();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function handleStartChat(userIds: string[], groupName?: string): Promise<void> {
    if (!me || userIds.length === 0) return;
    const chatId = crypto.randomUUID();
    await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: me,
      recipients: userIds,
      content: groupName ? `Started group chat: ${groupName}` : "Started conversation",
    });
    window.location.href = `/chat/${chatId}`;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Conversations</h1>
        <button
          className="rounded bg-orange-600 px-3 py-2 font-semibold text-black hover:bg-orange-700"
          onClick={() => setPickerOpen(true)}
          type="button"
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
            const safeChatId = chatId ?? ""; // extra safety
            const title =
              otherUsers.length > 0
                ? otherUsers.map((u) => u.full_name ?? "User").join(", ")
                : "Group / Untitled";
            const preview = (lastMessage.content ?? "").slice(0, 160);

            return (
              <li key={safeChatId} className="p-3 hover:bg-neutral-800/60">
                <Link href={`/chat/${safeChatId}`} className="block">
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