// features/parts/lib/requests/setPartRequestItemStatus.ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function setPartRequestItemStatus(input: {
  partRequestItemId: string;
  status:
    | "requested"
    | "quoted"
    | "approved"
    | "reserved"
    | "ordered"
    | "picking"
    | "picked"
    | "partially_received"
    | "fulfilled"
    | "rejected"
    | "cancelled"
    | "consumed";
  // optional: revalidate targets (work order pages, parts pages)
  revalidate?: { paths?: string[] };
}) {
  const supabase = createServerActionClient<DB>({ cookies });

  const { error } = await supabase
    .from("part_request_items")
    .update({ status: input.status })
    .eq("id", input.partRequestItemId);

  if (error) throw error;

  const paths = input.revalidate?.paths ?? [];
  for (const p of paths) revalidatePath(p);
}