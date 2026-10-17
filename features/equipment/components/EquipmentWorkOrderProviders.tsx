"use client";
import type { ReactNode } from "react";
import { TabsProvider } from "@/features/shared/components/tabs/TabsProvider";
import { useSession } from "@/features/shared/lib/supabase/session-context";

/** The canonical workspace uses tabs commands, even without the Shop tab bar. */
export default function EquipmentWorkOrderProviders({
  children,
}: {
  children: ReactNode;
}) {
  const session = useSession();
  return <TabsProvider userId={session?.user?.id}>{children}</TabsProvider>;
}
