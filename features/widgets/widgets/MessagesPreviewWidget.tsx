"use client";
import Link from "next/link";

type Row = { chatId: string; title: string; preview: string; unread: number };

export function MessagesPreviewWidget({
  data,
  size,
  route,
}: {
  data: { rows: Row[] };
  size: "1x1" | "2x1" | "2x2";
  route: string;
}) {
  const take = size === "2x2" ? 6 : size === "2x1" ? 4 : 3;
  const rows = (data.rows ?? []).slice(0, take);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">Messages</div>
        <Link href={route} className="text-[11px] underline">Open</Link>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-white/60">No conversations yet.</div>
      ) : (
        <ul className="space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.chatId} className="flex items-center justify-between">
              <Link href={`/chat/${r.chatId}`} className="truncate hover:underline">
                {r.title} <span className="text-white/60">• {r.preview}</span>
              </Link>
              {r.unread > 0 && (
                <span className="ml-2 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold text-white">
                  {r.unread > 99 ? "99+" : r.unread}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
