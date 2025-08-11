// app/portal/history/page.tsx
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";
import HistoryList from "./components/HistoryList";

export default async function HistoryPage() {
  const supabase = createServerComponentClient<Database>({ cookies });

  // Ensure user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <p className="text-white">Please log in to view your history.</p>;
  }

  // Fetch history records joined with vehicle + work order
  const { data: history, error } = await supabase
    .from("history")
    .select(`
      *,
      vehicle:vehicles(id, year, make, model, vin),
      work_order:work_orders(id, status, type)
    `)
    .eq("customer_id", user.id) // filter to only their records
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading history:", error);
    return <p className="text-red-500">Failed to load history.</p>;
  }

  return <HistoryList items={history || []} />;
}