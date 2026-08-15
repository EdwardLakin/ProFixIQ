"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "@/features/shared/lib/supabase/session-context";
import type { Session } from "@supabase/supabase-js";

export default function Providers({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession: Session | null;
}) {
  return (
    <SessionProvider initialSession={initialSession}>
      {children}
    </SessionProvider>
  );
}
