"use client";

import { useEffect, useMemo, useState } from "react";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export default function Providers({
  children,
  initialSession: initialSessionProp = null,   // ✅ optional, default null
}: {
  children: React.ReactNode;
  initialSession?: Session | null;              // ✅ optional
}) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  // seed from prop if a route passes it, otherwise null and we’ll fetch
  const [initialSession, setInitialSession] = useState<Session | null>(initialSessionProp);

  useEffect(() => {
    // Only fetch if a parent didn’t provide one
    if (initialSessionProp == null) {
      supabase.auth.getSession().then(({ data }) => {
        setInitialSession(data.session ?? null);
      });
    }
  }, [supabase, initialSessionProp]);

  return (
    <SessionContextProvider supabaseClient={supabase} initialSession={initialSession}>
      {children}
    </SessionContextProvider>
  );
}