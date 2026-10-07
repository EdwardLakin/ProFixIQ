import type { SearchLandingConfig } from "./components/SearchLandingPage";
import type { SearchLandingSeo } from "./searchLanding";

export type FleetSearchPageDefinition = {
  seo: SearchLandingSeo;
  config: SearchLandingConfig;
};

const fleetMedia = {
  src: "/opengraph-image",
  alt: "ProFixIQ fleet maintenance software",
  width: 1200,
  height: 630,
  caption:
    "ProFixIQ Fleet focuses on assets, PM, inspections, defects, requests, approvals, history, and fleet administration.",
};

const fleetBoundaryNote =
  "ProFixIQ Fleet is a fleet control and administration product. Shop work-order creation and repair execution remain on the Shop side when a fleet also uses ProFixIQ Shop.";

export const fleetSearchPages = {
  fleetRepairManagement: {
    seo: {
      title: "Fleet Repair Management Software | ProFixIQ",
      description:
        "Fleet repair management software for assets, preventive maintenance, inspections, defects, service requests, approvals, repair history, and fleet administration.",
      path: "/fleet-repair-management-software",
      keywords: [
        "fleet repair management software",
        "fleet maintenance management software",
        "fleet repair software",
        "fleet maintenance software",
      ],
      faqs: [
        {
          question: "What does ProFixIQ Fleet manage?",
          answer:
            "ProFixIQ Fleet manages assets, drivers and dispatchers, preventive maintenance schedules, inspections, defects, service requests, approvals, repair history, costs, invoice linkage, users, and reporting.",
        },
        {
          question: "Can fleet users create shop work orders?",
          answer:
            "No. Fleet is intentionally limited to fleet control and administration. A business that needs shop work-order creation and repair execution uses the ProFixIQ Shop product for those workflows.",
        },
        {
          question: "Can fleets see maintenance and repair history?",
          answer:
            "Yes. Fleet workflows retain asset maintenance history, defects, service activity, approvals, and linked cost information for administrative visibility.",
        },
      ],
    },
    config: {
      eyebrow: "Fleet repair management software",
      title:
        "Give fleet managers one place to control maintenance without turning Fleet into a repair-shop workspace.",
      lead:
        "Track assets, PM, inspections, defects, service requests, approvals, repair history, costs, and fleet users from a dedicated Fleet surface built for administration and control.",
      secondaryCta: {
        label: "See Fleet Maintenance",
        href: "/fleet-maintenance",
      },
      proofPoints: [
        "Asset and maintenance control",
        "Defects and service requests",
        "Separate Fleet product boundary",
      ],
      painPoints: {
        heading: "Fleet maintenance gets harder when status is spread across spreadsheets, messages, and shop systems.",
        items: [
          {
            title: "PM dates are easy to miss",
            body: "Service intervals need to stay visible before overdue maintenance turns into downtime.",
          },
          {
            title: "Defects lose ownership",
            body: "A driver or inspection can identify a problem, but the fleet still needs a clear review and follow-through path.",
          },
          {
            title: "Repair history is fragmented",
            body: "Fleet decisions are stronger when service requests, approvals, invoices, defects, and asset history remain connected.",
          },
        ],
      },
      workflow: {
        heading: "Control the maintenance lifecycle from the fleet side.",
        steps: [
          {
            title: "Monitor assets",
            body: "Keep units, drivers, status, PM schedules, and upcoming inspection needs visible.",
          },
          {
            title: "Review defects",
            body: "Surface pre-trip and inspection defects that require fleet attention and triage.",
          },
          {
            title: "Request & approve service",
            body: "Create service requests and manage fleet-side approvals without exposing shop work-order creation.",
          },
          {
            title: "Retain history",
            body: "Keep completed maintenance, linked invoices, costs, and asset history available for future decisions.",
          },
        ],
      },
      productProof: {
        heading: "Fleet control stays separate from shop execution.",
        body: fleetBoundaryNote,
        media: fleetMedia,
        items: [
          {
            title: "Control Tower visibility",
            body: "Surface out-of-service units, limited-use units, inspection windows, safety pre-trip issues, and other fleet attention items.",
          },
          {
            title: "Asset-centered maintenance history",
            body: "Organize PM, defects, requests, approvals, costs, and history around the unit instead of a generic task list.",
          },
          {
            title: "Fleet-specific users and roles",
            body: "Manage fleet managers, dispatchers, and drivers without granting them shop-side operational access.",
          },
        ],
      },
      faqs: [],
      finalCta: {
        eyebrow: "See the fleet workflow",
        heading: "Manage the fleet without blurring the shop boundary.",
        body: `Use the demo to walk through assets, PM, defects, requests, approvals, and history. ${fleetBoundaryNote}`,
      },
    },
  },

  dvirDefectTracking: {
    seo: {
      title: "DVIR Defect Tracking Software | ProFixIQ",
      description:
        "DVIR defect tracking software for driver pre-trip findings, safety defect review, severity triage, maintenance follow-through, and fleet history.",
      path: "/dvir-defect-tracking-software",
      keywords: [
        "DVIR defect tracking software",
        "driver vehicle inspection defect tracking",
        "fleet defect tracking software",
        "pre trip defect tracking",
      ],
      faqs: [
        {
          question: "Does ProFixIQ track driver pre-trip defects?",
          answer:
            "Yes. Driver pre-trip findings can flow into fleet-side defect review so fleet staff can assess severity, status, and follow-through.",
        },
        {
          question: "Does ProFixIQ claim DOT compliance?",
          answer:
            "No compliance claim is made on this page. ProFixIQ provides inspection and defect-management workflows, while fleets remain responsible for their own regulatory policies and requirements.",
        },
        {
          question: "Can a defect automatically create a shop work order?",
          answer:
            "Fleet does not expose shop work-order creation. Defects can drive fleet-side review and service requests; shop execution remains in the Shop product when used.",
        },
      ],
    },
    config: {
      eyebrow: "DVIR defect tracking software",
      title:
        "Move driver-reported defects from pre-trip finding to accountable fleet follow-through.",
      lead:
        "Give drivers a focused pre-trip experience, then route defects into fleet review, severity triage, service decisions, and durable asset history.",
      secondaryCta: {
        label: "See preventive maintenance",
        href: "/fleet-preventive-maintenance-software",
      },
      proofPoints: [
        "Driver pre-trip workflow",
        "Fleet defect review",
        "Severity and status follow-through",
      ],
      painPoints: {
        heading: "A defect report is only useful if someone can see it, assess it, and act on it.",
        items: [
          {
            title: "Driver findings disappear into messages",
            body: "Safety and maintenance issues should not depend on a text thread or paper form reaching the right person.",
          },
          {
            title: "Severity is unclear",
            body: "Fleet staff need a consistent way to distinguish urgent defects from items that can be monitored or scheduled.",
          },
          {
            title: "Resolution history is hard to prove",
            body: "The fleet should be able to see what was reported, how it was handled, and what happened next on the unit.",
          },
        ],
      },
      workflow: {
        heading: "Keep the defect visible from driver report through fleet disposition.",
        steps: [
          {
            title: "Driver inspects",
            body: "The driver completes the pre-trip flow and records the defect against the correct unit.",
          },
          {
            title: "Fleet reviews",
            body: "The defect appears for administrative review instead of remaining only in the driver experience.",
          },
          {
            title: "Triage & request service",
            body: "Fleet staff assess severity, status, and whether the issue should generate a service request.",
          },
          {
            title: "Retain the record",
            body: "Keep the defect and maintenance follow-through attached to the asset history.",
          },
        ],
      },
      productProof: {
        heading: "Separate driver reporting from fleet decision-making.",
        body:
          "Drivers get a minimal pre-trip surface; fleet staff get the control and review layer needed to manage what comes next.",
        media: fleetMedia,
        items: [
          {
            title: "Dedicated driver portal",
            body: "Drivers can complete pre-trip and defect workflows without receiving access to the full Fleet administration surface.",
          },
          {
            title: "Defect review queue",
            body: "Fleet staff can review issues that need attention instead of hunting through completed forms.",
          },
          {
            title: "Maintenance context stays with the unit",
            body: "Defects can remain part of the asset's ongoing service and maintenance history.",
          },
        ],
      },
      faqs: [],
      finalCta: {
        eyebrow: "See defect follow-through",
        heading: "Test the path from driver finding to fleet action.",
        body: `Use the demo to run a pre-trip defect through review and maintenance follow-through. ${fleetBoundaryNote}`,
      },
    },
  },

  fleetPreventiveMaintenance: {
    seo: {
      title: "Fleet Preventive Maintenance Software | ProFixIQ",
      description:
        "Fleet preventive maintenance software for PM schedules, upcoming inspections, maintenance calendars, service requests, approvals, asset history, and costs.",
      path: "/fleet-preventive-maintenance-software",
      keywords: [
        "fleet preventive maintenance software",
        "fleet PM software",
        "preventive maintenance scheduling software fleet",
        "fleet maintenance calendar software",
      ],
      faqs: [
        {
          question: "Can ProFixIQ schedule preventive maintenance by asset?",
          answer:
            "Yes. Fleet supports PM schedules and maintenance planning around fleet assets, with upcoming maintenance and inspection needs surfaced for administrative follow-through.",
        },
        {
          question: "Does preventive maintenance use the shop inspection engine?",
          answer:
            "Fleet PM inspections are aligned to the shop inspection engine while remaining configured and administered from the Fleet side.",
        },
        {
          question: "Does Fleet perform the repair work itself?",
          answer:
            "No. Fleet manages maintenance administration, requests, approvals, and history. Repair execution and shop work orders remain in ProFixIQ Shop when that product is used.",
        },
      ],
    },
    config: {
      eyebrow: "Fleet preventive maintenance software",
      title:
        "Make upcoming maintenance visible before the unit becomes an emergency.",
      lead:
        "Plan PM by asset, surface inspection windows, manage maintenance requests and approvals, and retain completed service history without turning Fleet into a shop work-order system.",
      secondaryCta: {
        label: "See fleet repair management",
        href: "/fleet-repair-management-software",
      },
      proofPoints: [
        "Asset-based PM schedules",
        "Maintenance calendar and alerts",
        "Inspection and history continuity",
      ],
      painPoints: {
        heading: "Preventive maintenance fails when the schedule is invisible until someone remembers it.",
        items: [
          {
            title: "Intervals live in separate spreadsheets",
            body: "Upcoming PM should be visible with the asset, not dependent on someone checking a disconnected tracker.",
          },
          {
            title: "Inspection windows arrive without context",
            body: "Fleet staff need to see which units are approaching maintenance or inspection requirements and what history led there.",
          },
          {
            title: "Completed service does not update the picture",
            body: "A PM program is more useful when completed maintenance and costs remain tied to the asset record.",
          },
        ],
      },
      workflow: {
        heading: "Plan, request, approve, and retain the maintenance record.",
        steps: [
          {
            title: "Schedule",
            body: "Define preventive maintenance needs around the unit and upcoming service windows.",
          },
          {
            title: "Surface",
            body: "Bring upcoming PM and inspection attention into the Fleet control view and calendar.",
          },
          {
            title: "Coordinate",
            body: "Create service requests and manage fleet-side approvals for the required maintenance.",
          },
          {
            title: "Record",
            body: "Retain the completed service, linked costs, and maintenance history against the asset.",
          },
        ],
      },
      productProof: {
        heading: "PM planning stays connected to the asset and its inspection history.",
        body: fleetBoundaryNote,
        media: fleetMedia,
        items: [
          {
            title: "Fleet maintenance calendar",
            body: "Use scheduled maintenance and inspection windows to see what is coming before it becomes overdue.",
          },
          {
            title: "Inspection-builder alignment",
            body: "Fleet PM inspections use the shared inspection foundation without changing the shop inspection workflow.",
          },
          {
            title: "History and cost visibility",
            body: "Keep maintenance outcomes and linked costs available for asset-level administration and reporting.",
          },
        ],
      },
      faqs: [],
      finalCta: {
        eyebrow: "See PM control",
        heading: "Build the maintenance plan around the unit, not the spreadsheet.",
        body: `Use the demo to walk through schedules, inspection windows, requests, approvals, and history. ${fleetBoundaryNote}`,
      },
    },
  },
} satisfies Record<string, FleetSearchPageDefinition>;
