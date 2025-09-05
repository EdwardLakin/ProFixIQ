// app/providers.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

export default function Providers({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [initialSession, setInitialSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setInitialSession(data.session ?? null);
    });
  }, [supabase]);

  return (
    <SessionContextProvider supabaseClient={supabase} initialSession={initialSession}>
      {children}
    </SessionContextProvider>
  );
}