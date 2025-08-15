// app/providers.tsx
"use client";

import { useMemo } from "react";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Props = { children: React.ReactNode };

export default function Providers({ children }: Props) {
  // create a single Supabase client for this client tree
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  return (
    <SessionContextProvider supabaseClient={supabase}>
      {children}
    </SessionContextProvider>
  );
}