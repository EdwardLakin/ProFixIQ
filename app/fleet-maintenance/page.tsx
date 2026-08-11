import type { Metadata } from "next";
import {
  CalendarClock,
  ClipboardCheck,
  Gauge,
  ShieldCheck,
} from "lucide-react";

import ProductMarketingPage from "@shared/components/ProductMarketingPage";

export const metadata: Metadata = {
  title: "Fleet Maintenance | ProFixIQ",
  description:
    "A fleet-owned maintenance workspace for assets, PM programs, inspections, defects, approvals, and repair history.",
};

export default function FleetMaintenanceMarketingPage() {
  return (
    <ProductMarketingPage
      config={{
        eyebrow: "Fleet Maintenance",
        title: "Own the maintenance record behind every asset.",
        lead: "Bring inspections, defects, preventive maintenance, approvals, and outside repair history into one fleet-controlled workspace—even when multiple shops do the work.",
        price: "$149",
        priceDetail:
          "Includes 10 fleet-owned assets. Add assets for $2.50 each per month. Drivers, managers, and portal identities are included.",
        accent: "fleet",
        signInHref: "https://fleet.profixiq.com/sign-in",
        signInLabel: "Fleet sign-in",
        outcomes: [
          "10 assets included",
          "$2.50 per added asset",
          "Unlimited portal identities",
        ],
        features: [
          {
            title: "Maintenance command",
            body: "See PM due work, active defects, service requests, approvals, and asset availability in one operating view.",
            icon: Gauge,
          },
          {
            title: "Compliance evidence",
            body: "Keep pre-trip findings, photos, signatures, clarifications, and corrective action tied to the asset.",
            icon: ClipboardCheck,
          },
          {
            title: "Programs and calendar",
            body: "Define recurring maintenance programs, assign assets, and turn due work into an actionable calendar.",
            icon: CalendarClock,
          },
          {
            title: "Fleet-controlled access",
            body: "Managers, dispatchers, drivers, and service partners see only the fleet workflows appropriate to their role.",
            icon: ShieldCheck,
          },
        ],
        accessSteps: [
          {
            number: "01",
            title: "Create or accept a fleet relationship",
            body: "A shop can record any customer unit normally. Fleet Maintenance begins only when the fleet accepts an invitation and uses the owned workspace.",
          },
          {
            number: "02",
            title: "Keep billing with the participant",
            body: "A servicing shop can maintain any number of fleet relationships without absorbing the fleet's subscription. The fleet pays when it actively uses Fleet Maintenance.",
          },
          {
            number: "03",
            title: "Count assets across the subscribed fleet",
            body: "The first 10 fleet-owned assets are included. Additional active assets—not customer records or shop-maintained units—create the capacity charge.",
          },
        ],
        preview: {
          label: "Fleet control tower",
          title: "Prairie North Logistics",
          status: "Healthy",
          stats: [
            { label: "Assets ready", value: "38" },
            { label: "PM due", value: "6" },
            { label: "Open defects", value: "3" },
          ],
          rows: [
            {
              title: "Tractor 402 · annual inspection",
              detail: "Due in 4 days · documents ready",
              state: "Planned",
            },
            {
              title: "Trailer 118 · brake defect",
              detail: "Driver evidence received",
              state: "Review",
            },
            {
              title: "Service van 09 · oil service",
              detail: "Approved · partner shop assigned",
              state: "Booked",
            },
          ],
        },
      }}
    />
  );
}
