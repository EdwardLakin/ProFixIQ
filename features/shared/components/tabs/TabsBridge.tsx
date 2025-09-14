"use client";

import { useSession } from "@supabase/auth-helpers-react";
import { TabsProvider } from "./TabsProvider";
import TabsBar from "./TabsBar";

export default function TabsBridge({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const userId = session?.user?.id; // undefined while loading; becomes stable post-auth

  return (
    <TabsProvider userId={userId}>
      <TabsBar />
      {children}
    </TabsProvider>
  );
}