"use client";

import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { supabase } from "@shared/lib/supabase/client"; // ✅ correct import
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionContextProvider supabaseClient={supabase}>
      {children}
    </SessionContextProvider>
  );
}