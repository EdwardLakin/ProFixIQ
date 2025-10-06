"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

/**
 * Debug page to inspect Supabase auth session on the client.
 * Shows whether the user is actually signed in, and what the context sees.
 */

type AuthInfo = {
  hasSession: boolean;
  userId: string | null;
  expiresAt: number | null;
  expiresInSec: number | null;
};

export default function ClientDebug(): JSX.Element {
  const sb = createClientComponentClient<Database>();

  const [info, setInfo] = useState<AuthInfo | null>(null);
  const [repl, setRepl] = useState<any>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: s } = await sb.auth.getSession();
      const { data: u } = await sb.auth.getUser();
      const sess = s?.session;

      if (!mounted) return;

      setInfo({
        hasSession: !!sess,
        userId: u?.user?.id ?? null,
        expiresAt: sess?.expires_at ?? null,
        expiresInSec: sess?.expires_at
          ? sess.expires_at - Math.floor(Date.now() / 1000)
          : null,
      });
      setRepl({ session: s, user: u });
    })();

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setInfo((prev) => ({
        ...(prev ?? {
          hasSession: false,
          userId: null,
          expiresAt: null,
          expiresInSec: null,
        }),
        hasSession: !!session,
        userId: session?.user?.id ?? null,
        expiresAt: session?.expires_at ?? null,
        expiresInSec: session?.expires_at
          ? session.expires_at - Math.floor(Date.now() / 1000)
          : null,
      }));
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  if (!info) {
    return (
      <div className="p-4 text-sm text-neutral-400">Loading auth debug…</div>
    );
  }

  return (
    <div className="p-4 space-y-2 text-sm">
      <h1 className="text-xl font-semibold mb-2">Client Auth / Context Debug</h1>

      <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2">
        <div>
          <b>hasSession:</b> {String(info.hasSession)}
        </div>
        <div>
          <b>userId:</b> {info.userId ?? "null"}
        </div>
        <div>
          <b>expiresInSec:</b> {info.expiresInSec ?? "?"}
        </div>
      </div>

      <pre className="rounded bg-neutral-900 p-3 text-xs overflow-auto">
        {JSON.stringify(repl, null, 2)}
      </pre>
    </div>
  );
}