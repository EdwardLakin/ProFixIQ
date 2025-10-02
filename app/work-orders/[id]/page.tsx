// app/work-orders/[id]/page.tsx
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Client from "./Client";

type DB = Database;

export default async function WorkOrderIdServerPage({
  params,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createServerComponentClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pass the user id (if any) to the client page to avoid Safari bad_jwt churn.
  const userId = user?.id ?? null;

  return <Client routeId={params.id} userId={userId} />;
}