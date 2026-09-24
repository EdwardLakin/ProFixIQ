import GeotabConnectCard from "@/features/integrations/fleetTrackers/geotab/components/GeotabConnectCard";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function FleetTrackersSettingsPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8 text-[color:var(--theme-text-primary)]">
      <div>
        <h1 className="text-2xl font-semibold">Fleet Trackers</h1>
        <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
          Connect GPS/telematics providers to pull vehicle location, odometer, and
          fault code data into this shop.
        </p>
      </div>

      <GeotabConnectCard />

      <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6">
        <h2 className="text-lg font-semibold">Launch scope</h2>
        <div className="mt-3 space-y-2 text-sm text-[color:var(--theme-text-secondary)]">
          <p>• Connect one tracker account per shop, per vendor</p>
          <p>• Pull vehicles in and match them to existing vehicle records by VIN</p>
          <p>• Samsara and Motive follow the same connect/sync pattern next</p>
          <p>• Fault codes feeding maintenance suggestions is a follow-up</p>
        </div>
      </div>
    </div>
  );
}
