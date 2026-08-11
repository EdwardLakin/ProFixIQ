import type { Metadata } from "next";
import { Boxes, MapPinned, RadioTower, Truck } from "lucide-react";

import ProductMarketingPage from "@shared/components/ProductMarketingPage";

export const metadata: Metadata = {
  title: "Field Service | ProFixIQ",
  description:
    "Service-truck dispatch, off-site repair execution, inventory, evidence, and operator controls in one focused workspace.",
};

export default function FieldServiceMarketingPage() {
  return (
    <ProductMarketingPage
      config={{
        eyebrow: "Field Service",
        title: "Run the service truck like a complete operation.",
        lead: "Dispatch the right operator, arrive with the right inventory, capture evidence once, and carry every off-site repair into a durable service record.",
        price: "$199",
        priceDetail:
          "Includes one active service truck. Add active trucks for $49 each per month. Operators and portal users are never billed as seats.",
        accent: "field",
        signInHref: "/mobile/sign-in?redirect=%2Fmobile%2Fservice",
        signInLabel: "Field Service sign-in",
        outcomes: [
          "1 truck included",
          "No per-user charge",
          "14-day free trial",
        ],
        features: [
          {
            title: "Dispatch control",
            body: "Schedule service visits, assign eligible field operators, and see the work moving across the day.",
            icon: RadioTower,
          },
          {
            title: "Truck execution",
            body: "Give each assigned operator a focused mobile workspace for intake, evidence, labor, parts, and completion.",
            icon: Truck,
          },
          {
            title: "Inventory continuity",
            body: "Keep truck stock and parts activity connected to the same repair and shop inventory record.",
            icon: Boxes,
          },
          {
            title: "Location intelligence",
            body: "Carry service addresses, travel context, arrival state, and customer communication with the visit.",
            icon: MapPinned,
          },
        ],
        accessSteps: [
          {
            number: "01",
            title: "Subscribe to Field Service",
            body: "Field Service or Complete Operations creates the paid product entitlement. A shop role alone cannot open this workspace.",
          },
          {
            number: "02",
            title: "Enable the operation",
            body: "An owner or admin completes Field Service setup and chooses whether the location runs shop, mobile, or both service models.",
          },
          {
            number: "03",
            title: "Assign each operator",
            body: "Only explicitly enabled field operators can enter service-truck workflows. Ordinary shop mechanics keep Shop Mobile without inheriting Field Service.",
          },
        ],
        preview: {
          label: "Field command",
          title: "Tuesday service route",
          status: "Live",
          stats: [
            { label: "Visits", value: "7" },
            { label: "On route", value: "3" },
            { label: "Ready", value: "92%" },
          ],
          rows: [
            {
              title: "Unit 218 · no-start",
              detail: "North yard · Truck 02 · Maya",
              state: "En route",
            },
            {
              title: "Trailer 47 · air leak",
              detail: "Distribution centre · Truck 01",
              state: "On site",
            },
            {
              title: "Loader 12 · PM service",
              detail: "Quarry east · 2:30 PM",
              state: "Ready",
            },
          ],
        },
      }}
    />
  );
}
