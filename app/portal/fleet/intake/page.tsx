import { redirect } from "next/navigation";

import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";
import FleetDefectQueue from "@/features/fleet/components/FleetDefectQueue";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function FleetDispatcherIntakePage({
  searchParams,
}: Props) {
  const { fleetId } = await searchParams;
  const actor = await requireFleetPortalActor(fleetId ?? null);
  if (!actor.capabilities.canViewDispatch) redirect("/portal/fleet");

  return (
    <main className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-500 dark:text-sky-300">
          Dispatcher gate
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Driver Intake Queue
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
          Close noise, monitor conditions, ask one focused question, or approve
          the issue into a structured Fleet service request.
        </p>
      </header>
      <FleetDefectQueue fleetId={actor.primaryFleetId} mode="dispatcher" />
    </main>
  );
}
