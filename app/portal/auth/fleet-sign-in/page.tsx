import { Suspense } from "react";
import { headers } from "next/headers";
import PortalSignInForm from "../sign-in/PortalSignInForm";
import AuthShell from "@/features/auth/components/AuthShell";
import { isFleetProductHostname } from "@/features/fleet/lib/fleetProductRouting";

const FLEET_BLUE = "#38BDF8";

function FleetLoadingCard() {
  return (
    <AuthShell
      productLabel="ProFixIQ Fleet"
      heroTitle="Keep every unit moving."
      heroDescription="Asset readiness, preventive maintenance, service decisions, and repair history in one dedicated Fleet workspace."
      highlights={["Fleet control tower", "Maintenance planning", "Connected repair history"]}
      cardClassName="rounded-2xl border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 backdrop-blur-md sm:p-6"
    >
      <div>
        <div
          className="inline-flex items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-[11px] uppercase tracking-[0.2em]"
          style={{ color: FLEET_BLUE }}
        >
          ProFixIQ Fleet
        </div>
        <div className="mt-4 text-sm text-[color:var(--theme-text-secondary)]">
          Loading fleet sign in…
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]">
          <div
            className="h-full w-1/2 animate-pulse rounded-full"
            style={{ backgroundColor: FLEET_BLUE }}
          />
        </div>
      </div>
    </AuthShell>
  );
}

export default async function FleetPortalSignInPage() {
  const requestHeaders = await headers();
  const productHost =
    requestHeaders.get("x-profixiq-product-host") === "fleet" ||
    isFleetProductHostname(
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    );

  return (
    <Suspense fallback={<FleetLoadingCard />}>
      <PortalSignInForm portalType="fleet" productHost={productHost} />
    </Suspense>
  );
}
