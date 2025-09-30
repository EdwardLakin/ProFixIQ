// app/work-orders/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export default async function WorkOrderBasic({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerComponentClient<DB>({ cookies });

  // Session check
  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();
  if (sessErr) console.error("[wo/[id]] getSession error:", sessErr);
  if (!session?.user) {
    return <div className="p-6 text-sm text-red-400">Not signed in.</div>;
  }

  const id = params.id;

  // Lookup by UUID
  const { data: byId, error: idErr } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (idErr) console.error("[wo/[id]] select by id error:", idErr);

  let wo = byId ?? null;

  // Fallback: lookup by custom_id if shorter
  if (!wo && id.length < 36) {
    const { data: byCustom, error: customErr } = await supabase
      .from("work_orders")
      .select("*")
      .eq("custom_id", id)
      .maybeSingle();
    if (customErr) console.error("[wo/[id]] select by custom_id error:", customErr);
    wo = byCustom ?? null;
  }

  if (!wo) notFound();

  return (
    <div className="mx-auto max-w-3xl p-6 text-white">
      <Link
        href="/work-orders"
        className="text-sm text-orange-400 hover:underline"
      >
        ← Back to Work Orders
      </Link>

      <h1 className="mt-3 text-2xl font-semibold">
        Work Order {wo.custom_id || `#${wo.id.slice(0, 8)}`}
      </h1>

      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="grid gap-2 text-sm text-neutral-300 sm:grid-cols-2">
          <div>
            <div className="text-neutral-400">Internal ID</div>
            <div className="truncate">{wo.id}</div>
          </div>
          <div>
            <div className="text-neutral-400">Status</div>
            <div>{(wo.status ?? "—").toString().replaceAll("_", " ")}</div>
          </div>
          <div>
            <div className="text-neutral-400">Vehicle</div>
            <div>{wo.vehicle_id || "—"}</div>
          </div>
          <div>
            <div className="text-neutral-400">Customer</div>
            <div>{wo.customer_id || "—"}</div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-sm text-neutral-400">
        Minimal view loaded. If this renders, we’ll reintroduce features
        step-by-step.
      </p>
    </div>
  );
}