// eslint-disable-next-line @typescript-eslint/no-explicit-any
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import IconMenu, { type IconItem } from "@/features/launcher/components/IconMenu";
import AvatarCircle from "@/features/launcher/components/AvatarCircle";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type Tile = {
  chatId: string;
  title: string;
  preview: string;
  unread: number;
};

export default function ChatListPage(): JSX.Element {
  // ✅ Hooks declared unconditionally at the top
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [me, setMe] = useState<string | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // who am I?
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
    })();
  }, [supabase]);

  // stable loader (referenced by effects + realtime)
  const load = useCallback(async () => {
    setLoading(true);

    const { data: msgs, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(400);

    if (error || !msgs) {
      setTiles([]);
      setLoading(false);
      return;
    }

    // latest message per chat
    const latestPer = new Map<string, MessageRow>();
    for (const m of msgs as MessageRow[]) {
      const chatId = m.chat_id as string | null;
      if (!chatId) continue;
      if (!latestPer.has(chatId)) latestPer.set(chatId, m);
    }
    const chatIds = Array.from(latestPer.keys());

    // resolve participants
    const userIds = new Set<string>();
    for (const m of latestPer.values()) {
      if (m.sender_id) userIds.add(m.sender_id);
      const recips = Array.isArray(m.recipients) ? m.recipients.map(String) : [];
      for (const r of recips) userIds.add(r);
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", Array.from(userIds));

    const profMap = new Map<string, Pick<ProfileRow, "id" | "full_name" | "role">>();
    for (const p of (profs ?? [])) profMap.set(p.id, { id: p.id, full_name: p.full_name, role: p.role });

    // my last_read_at per chat
    let readsMap = new Map<string, string>();
    if (me) {
      const { data: reads } = await supabase
        .from("message_reads")
        .select("conversation_id, last_read_at")
        .eq("user_id", me)
        .in("conversation_id", chatIds);
      readsMap = new Map((reads ?? []).map((r) => [String(r.conversation_id), r.last_read_at as string]));
    }

    // group msgs by chat for unread calc
    const msgsByChat = new Map<string, MessageRow[]>();
    for (const m of msgs as MessageRow[]) {
      const chatId = m.chat_id as string | null;
      if (!chatId) continue;
      if (!msgsByChat.has(chatId)) msgsByChat.set(chatId, []);
      msgsByChat.get(chatId)!.push(m);
    }

    const next: Tile[] = chatIds.map((chatId) => {
      const last = latestPer.get(chatId)!;

      const participants = new Set<string>([
        ...(Array.isArray(last.recipients) ? last.recipients.map(String) : []),
        ...(last.sender_id ? [last.sender_id] : []),
      ]);

      const others = me ? Array.from(participants).filter((x) => x !== me) : Array.from(participants);
      const title =
        others.length > 0
          ? others
              .map((id) => profMap.get(id)?.full_name || "User")
              .slice(0, 3)
              .join(", ") + (others.length > 3 ? ` +${others.length - 3}` : "")
          : "Group / Untitled";

      const preview = (last.content ?? "").slice(0, 60);
      const lastRead = readsMap.get(chatId) ?? "1970-01-01T00:00:00Z";
      const unread = (msgsByChat.get(chatId) ?? []).filter((m) => (m.created_at as string) > lastRead).length;

      return { chatId, title, preview, unread };
    });

    setTiles(next);
    setLoading(false);
  }, [supabase, me]);

  // initial + when 'me' changes
  useEffect(() => { void load(); }, [load]);

  // realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("chat-list-tiles")
      .on("postgres_changes", { schema: "public", table: "messages", event: "INSERT" }, () => {
        void load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, load]);

  // render as IconMenu items
  const items: IconItem[] = tiles.map((t) => ({
    href: `/chat/${t.chatId}`,
    title: t.title,
    subtitle: t.preview || "…",
    icon: <AvatarCircle label={t.title} />,
    badge: t.unread > 0 ? t.unread : 0,
  }));

  return (
    <div className="mx-auto max-w-[420px] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Conversations</h1>
        <Link
          href="#"
          onClick={(e) => { e.preventDefault(); /* open picker here */ }}
          className="rounded bg-orange-500 px-3 py-2 text-sm font-semibold text-black"
        >
          New
        </Link>
      </div>

      {loading ? (
        <div className="text-neutral-400">Loading…</div>
      ) : tiles.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-neutral-300">
          No conversations yet. Start one!
        </div>
      ) : (
        <IconMenu items={items} colsClass="grid-cols-2 md:grid-cols-4" />
      )}
    </div>
  );
}
