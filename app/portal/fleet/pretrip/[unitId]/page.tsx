import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import PretripForm from "@/features/fleet/components/PretripForm";
import { resolveFleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";

type Props = {
  params: Promise<{ unitId: string }>;
};

export default async function PortalFleetPretripPage({ params }: Props) {
  const { unitId } = await params;
  const supabase = createServerSupabaseRSC();
  const uiContext = await resolveFleetUiContext(supabase);

  return (
    <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4 shadow-card">
      <div className="mb-4 border-b border-[color:var(--theme-border-soft)] pb-3">
        <h1 className="text-xl text-sky-300" style={{ fontFamily: "var(--font-blackops)" }}>
          Portal Pre-trip • Unit {unitId}
        </h1>
        <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
          {uiContext.experience === "external_driver"
            ? "Submit your pre-trip and flag defects for service review."
            : "Submit or assist with a unit pre-trip and route defects into requests."}
        </p>
      </div>
      <PretripForm unitId={unitId} driverHint={null} />
    </div>
  );
}
