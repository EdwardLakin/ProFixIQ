"use client";

import Link from "next/link";
import type { AssistantResponse } from "../types/assistant";

type Props = {
  data: AssistantResponse | { error: string } | null;
};

export default function AssistantResponseCard({ data }: Props) {
  if (!data) return null;

  if ("error" in data) {
    return (
      <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-200">
        {data.error}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-5">
      <div className="mb-2 text-xs uppercase text-neutral-400">
        Summary
      </div>
      <div className="whitespace-pre-line text-sm text-white">
        {data.summary}
      </div>

      {data.bullets.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-xs text-neutral-400">Action Items</div>
          <ul className="space-y-1">
            {data.bullets.map((bullet, i) => (
              <li key={`${bullet}-${i}`} className="text-sm text-neutral-200">
                • {bullet}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.actions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.actions.map((action, i) => (
            <Link
              key={`${action.href}-${i}`}
              href={action.href}
              className="rounded-full border border-orange-400/40 px-3 py-1 text-xs text-orange-300"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}

      {data.notifications.length > 0 ? (
        <div className="mt-4 space-y-2">
          {data.notifications.slice(0, 3).map((notification, i) => (
            <div
              key={`${notification.code}-${notification.entityId ?? i}`}
              className="rounded-xl border border-white/10 bg-black/40 p-3"
            >
              <div className="text-sm font-semibold text-white">
                {notification.title}
              </div>
              <div className="text-xs text-neutral-300">
                {notification.message}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
