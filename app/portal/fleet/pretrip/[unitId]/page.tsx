import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PretripForm from "@/features/fleet/components/PretripForm";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type DB = Database;
type Props = {
  params: Promise<{ unitId: string }>;
};

export default async function PortalFleetPretripPage({ params }: Props) {
  const { unitId } = await params;
  const supabase = createServerComponentClient<DB>({ cookies });
  const uiContext = await resolveFleetUiContext(supabase);

  return (
    <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/60 p-4 shadow-card">
      <div className="mb-4 border-b border-white/10 pb-3">
        <h1 className="text-xl text-sky-300" style={{ fontFamily: "var(--font-blackops)" }}>
          Portal Pre-trip • Unit {unitId}
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          {uiContext.experience === "external_driver"
            ? "Submit your pre-trip and flag defects for service review."
            : "Submit or assist with a unit pre-trip and route defects into requests."}
        </p>
      </div>
      <PretripForm unitId={unitId} driverHint={null} />
    </div>
  );
}
