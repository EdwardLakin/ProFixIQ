import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import WorkOrderBoard from "@shared/components/workboard/WorkOrderBoard";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";

type DB = Database;

export default async function PortalStatusPage() {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    await requirePortalCustomerActor(supabase);
  } catch {
    return (
      <main className="min-h-screen px-4 py-6 text-white md:px-6">
        <div className="mx-auto max-w-[1500px]">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">Portal invite required</h1>
          <p className="mt-2 text-sm text-neutral-300">Open the invite link sent by the shop, or ask the shop to resend your portal invite.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 text-white md:px-6">
      <div className="mx-auto max-w-[1500px]">
        <WorkOrderBoard
          variant="portal"
          title="Live repair status"
          subtitle="Track progress, approvals, and readiness in real time."
        />
      </div>
    </main>
  );
}
