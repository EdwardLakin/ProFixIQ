"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export default function Page() {
  const sb = createClientComponentClient<Database>();
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    const run = async () => {
      const s1 = await sb.auth.getSession();
      const u1 = await sb.auth.getUser();
      setState({
        hasSession: !!s1.data.session,
        userId: u1.data.user?.id ?? null,
        exp: s1.data.session?.expires_at ?? null,
      });
    };
    run();

    const sub = sb.auth.onAuthStateChange((_e, session) => {
      setState((p: any) => ({ ...p, hasSession: !!session, userId: session?.user?.id ?? null, exp: session?.expires_at ?? null }));
    });
    return () => sub.data.subscription.unsubscribe();
  }, [sb]);

  return <pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(state, null, 2)}</pre>;
}