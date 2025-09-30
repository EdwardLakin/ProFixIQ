export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import WorkOrderClient from "@/features/work-orders/components/WorkOrderClient";

type DB = Database;

type PageProps = { params: { id: string } };

export default async function WorkOrderPage({ params }: PageProps) {
  const supabase = createServerComponentClient<DB>({ cookies });

  // Require a session (prevents auth races)
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-white">
        Not signed in.
      </div>
    );
  }

  const raw = params.id;

  // Look up by id; if not found and param looks short, try custom_id
  const { data: byId } = await supabase
    .from("work_orders")
    .select("id")
    .eq("id", raw)
    .maybeSingle();

  let woId: string | null = byId?.id ?? null;

  if (!woId && raw.length < 36) {
    const { data: byCustom } = await supabase
      .from("work_orders")
      .select("id")
      .eq("custom_id", raw)
      .maybeSingle();
    woId = byCustom?.id ?? null;
  }

  if (!woId) return notFound();

  return <WorkOrderClient woId={woId} />;
}