import type { SearchLandingConfig } from "@/features/marketing/components/SearchLandingPage";
import type { SearchLandingSeo } from "./searchLanding";

export type EquipmentMaintenancePageDefinition = {
  seo: SearchLandingSeo;
  config: SearchLandingConfig;
};

export const equipmentMaintenancePage = {
  seo: {
    title: "Equipment Maintenance Software | ProFixIQ",
    description:
      "Equipment maintenance software for off-road and industrial assets with preventive maintenance by hours, distance, cycles or calendar, Asset Health, inspections, components, wear tracking, active work, and service history.",
    path: "/equipment-maintenance-software",
    keywords: [
      "equipment maintenance software",
      "heavy equipment maintenance software",
      "equipment management software",
      "construction equipment maintenance software",
      "off road equipment maintenance software",
      "industrial equipment maintenance software",
      "mining equipment maintenance software",
      "equipment preventive maintenance software",
      "equipment inspection software",
    ],
    faqs: [
      {
        question: "What types of equipment can ProFixIQ Equipment manage?",
        answer:
          "ProFixIQ Equipment is built for mixed off-road and industrial asset populations, including excavators, loaders, dozers, haul trucks, forklifts, telehandlers, aerial lifts, compactors, road-building equipment, crushers and screeners, drilling and underground mining equipment, forestry and agricultural machines, oilfield equipment, generators, compressors, pumps, and attachments.",
      },
      {
        question: "How does preventive maintenance work for equipment?",
        answer:
          "Equipment PM plans can be scheduled by engine hours, distance, cycles, calendar days, or multiple intervals on the same plan. ProFixIQ evaluates each interval independently and uses whichever becomes due first, with completion history retained against the asset.",
      },
      {
        question: "Is ProFixIQ Equipment a standalone subscription?",
        answer:
          "No. Equipment is a $149 USD per month, per location premium add-on to Complete Operations. Complete Operations keeps Shop, Field Service, and Fleet Maintenance connected while Equipment adds equipment-specific asset health, preventive maintenance, inspection, component, measurement, and wear workflows.",
      },
      {
        question: "Can equipment repairs be handled in the shop and in the field?",
        answer:
          "Yes. Complete Operations connects Shop and Field Service so equipment work can follow the appropriate repair workflow while the Equipment layer keeps the machine's asset record, PM status, condition evidence, components, measurements, and history together.",
      },
      {
        question: "Does ProFixIQ Equipment include OEM telematics or machine-control integrations?",
        answer:
          "ProFixIQ does not claim OEM telematics or machine-control integrations. Equipment focuses on the maintenance and repair record created by your operation: asset identity, meters, PM plans and completions, inspections, defects, work, components, measurements, wear evidence, and service history.",
      },
    ],
  },
  config: {
    eyebrow: "Equipment maintenance software",
    title: "Know what is due, what is wearing, what is open, and what has happened to every machine.",
    lead:
      "ProFixIQ Equipment adds an equipment-specific maintenance layer to Complete Operations for off-road, construction, industrial, mining, material-handling, aerial, forestry, agricultural, energy, municipal, stationary, and attachment assets.",
    primaryCta: {
      label: "See Equipment pricing",
      href: "/compare-plans#equipment",
    },
    secondaryCta: {
      label: "See heavy equipment repair",
      href: "/heavy-equipment-repair-software",
    },
    proofPoints: [
      "PM by hours, distance, cycles, or calendar",
      "Asset Health + component history",
      "Shop + Field + Fleet through Complete Operations",
    ],
    painPoints: {
      eyebrow: "Why equipment needs its own maintenance layer",
      heading:
        "A machine is more than a vehicle record, and mixed equipment operations need more than a truck-only template.",
      body:
        "Equipment maintenance depends on machine identity, operating meters, preventive-maintenance intervals, components, wear, inspections, open work, site context, and durable service evidence. Losing those relationships makes every maintenance decision harder to understand later.",
      items: [
        {
          title: "PM cannot rely on one odometer",
          body:
            "A machine may need service by engine hours, kilometres or miles, cycles, calendar time, or whichever interval becomes due first.",
        },
        {
          title: "Equipment classes behave differently",
          body:
            "Excavators, haul trucks, forklifts, aerial lifts, crushers, drills, generators, and attachments need equipment-aware inspection content and identity rather than one generic road-vehicle form.",
        },
        {
          title: "Condition and components outlive one repair",
          body:
            "Tracked undercarriage, major components, mounted assets, measurements, wear evidence, PM completions, and service history need to stay tied to the machine over time.",
        },
      ],
    },
    workflow: {
      eyebrow: "Equipment workflow",
      heading: "Keep preventive maintenance, condition, repair work, and history around the same machine.",
      body:
        "Equipment sits on top of Complete Operations so the asset-specific maintenance record stays connected to the Shop, Field Service, and Fleet workflows that execute and administer the work.",
      steps: [
        {
          title: "Identify",
          body:
            "Record equipment class, serial or PIN, make and model, site, operating status, engine identity, and the meter that matters—hours, odometer, or cycles.",
        },
        {
          title: "Plan PM",
          body:
            "Create preventive-maintenance plans by engine hours, distance, cycles, calendar days, or multiple dimensions where the first interval due should drive service.",
        },
        {
          title: "Inspect and evaluate",
          body:
            "Use off-road inspection content and Asset Health to see PM state, defects, active work, components, undercarriage wear, measurements, and service evidence together.",
        },
        {
          title: "Complete and retain",
          body:
            "Execute work through Shop or Field Service, record PM completions against the current machine meters, and retain the resulting repair and service history for the next decision.",
        },
      ],
    },
    productProof: {
      eyebrow: "Built for mixed equipment operations",
      heading: "From forklifts to mining machines, preserve the details that actually change maintenance decisions.",
      body:
        "The Equipment catalog spans excavation, loading, grading, hauling, material handling, aerial access, compaction, road construction, crushing and screening, drilling, trenching, surface and underground mining, forestry, agriculture, energy, municipal, utility, stationary/towable assets, and attachments.",
      media: {
        src: "/opengraph-image",
        alt: "ProFixIQ Equipment maintenance software for off-road and industrial assets",
        width: 1200,
        height: 630,
        caption:
          "Equipment is a premium add-on to Complete Operations, connecting equipment-specific PM, asset health, and maintenance evidence to Shop, Field Service, and Fleet workflows.",
      },
      items: [
        {
          title: "Multi-interval preventive maintenance",
          body:
            "Schedule PM by hours, distance, cycles, calendar days, or combinations of those dimensions. ProFixIQ calculates due and overdue state from the latest completion or starting point without pretending to predict failures.",
        },
        {
          title: "Asset Health",
          body:
            "Bring current meters, operating status, PM state, inspection defects, active work, service evidence, site information, and recent history into a machine-centered view.",
        },
        {
          title: "Components, undercarriage, and measurements",
          body:
            "Track equipment components, mounted relationships, undercarriage condition, measurements, and configured wear limits without flattening every machine into the same record.",
        },
      ],
    },
    faqs: [],
    finalCta: {
      eyebrow: "ProFixIQ Equipment",
      heading: "Add the equipment maintenance layer to Complete Operations.",
      body:
        "Equipment is $149 USD per month per location and requires Complete Operations. New Complete + Equipment subscriptions are $648 USD per month per location before taxes or added capacity.",
      primary: {
        label: "See Complete + Equipment pricing",
        href: "/compare-plans#equipment",
      },
      secondary: {
        label: "Request Equipment demo",
        href: "/request-demo",
      },
    },
  },
} satisfies EquipmentMaintenancePageDefinition;
