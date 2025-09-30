export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import WorkOrderClient from "@/features/work-orders/components/WorkOrderClient";

type DB = Database;

type PageProps = {
  params: Promise<{ id: string }>; // 👈 Next 15 types: params is a Promise
};

export default async function WorkOrderPage({ params }: PageProps) {
  const { id: raw } = await params; // 👈 await params

  const supabase = createServerComponentClient<DB>({ cookies });

  // Require a session (prevents auth races)
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return <div className="mx-auto max-w-3xl p-6 text-white">Not signed in.</div>;
  }

  // Try primary key first
  const byId = await supabase.from("work_orders").select("id").eq("id", raw).maybeSingle();
  let woId: string | null = byId.data?.id ?? null;

  // Fallback: if it's short, try custom_id
  if (!woId && raw.length < 36) {
    const byCustom = await supabase.from("work_orders").select("id").eq("custom_id", raw).maybeSingle();
    woId = byCustom.data?.id ?? null;
  }

  if (!woId) notFound();

  return <WorkOrderClient woId={woId} />;
}