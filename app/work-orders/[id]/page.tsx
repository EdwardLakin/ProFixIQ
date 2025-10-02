// app/work-orders/[id]/page.tsx
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Client from "./Client"; // <-- default export from Client.tsx

type PageProps = {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function WorkOrderIdPage({ params }: PageProps) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pass exactly what the client expects
  return <Client routeId={params.id} userId={user?.id ?? null} />;
}