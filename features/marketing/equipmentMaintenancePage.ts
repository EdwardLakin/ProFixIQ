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
      "Equipment maintenance software for off-road and industrial assets, with Asset Health, equipment inspections, components, measurements, wear tracking, active work, and service history.",
    path: "/equipment-maintenance-software",
    keywords: [
      "equipment maintenance software",
      "heavy equipment maintenance software",
      "equipment management software",
      "construction equipment maintenance software",
      "off road equipment maintenance software",
      "industrial equipment maintenance software",
      "mining equipment maintenance software",
      "equipment inspection software",
    ],
    faqs: [
      {
        question: "What types of equipment can ProFixIQ Equipment manage?",
        answer:
          "ProFixIQ Equipment is built for mixed off-road and industrial asset populations, including excavators, loaders, dozers, haul trucks, forklifts, telehandlers, aerial lifts, compactors, road-building equipment, crushers and screeners, drilling and underground mining equipment, forestry and agricultural machines, oilfield equipment, generators, compressors, pumps, and attachments.",
      },
      {
        question: "Is ProFixIQ Equipment a standalone subscription?",
        answer:
          "No. Equipment is a $149 USD per month, per location premium add-on to Complete Operations. Complete Operations keeps Shop, Field Service, and Fleet Maintenance connected while Equipment adds the equipment-specific asset, inspection, health, component, measurement, and wear workflows.",
      },
      {
        question: "Can equipment repairs be handled in the shop and in the field?",
        answer:
          "Yes. Complete Operations connects Shop and Field Service so equipment work can follow the appropriate repair workflow while the Equipment layer keeps the machine's asset record, condition evidence, components, measurements, and history together.",
      },
      {
        question: "Does ProFixIQ Equipment include OEM telematics or machine-control integrations?",
        answer:
          "ProFixIQ does not claim OEM telematics or machine-control integrations. Equipment focuses on the maintenance and repair record created by your operation: asset identity, inspections, defects, work, components, measurements, wear evidence, and service history.",
      },
    ],
  },
  config: {
    eyebrow: "Equipment maintenance software",
    title: "Know the condition, work, wear, and history of every machine you maintain.",
    lead:
      "ProFixIQ Equipment adds an equipment-specific asset layer to Complete Operations for off-road, construction, industrial, mining, material-handling, aerial, forestry, agricultural, energy, municipal, stationary, and attachment assets.",
    primaryCta: {
      label: "See Equipment pricing",
      href: "/compare-plans#equipment",
    },
    secondaryCta: {
      label: "See heavy equipment repair",
      href: "/heavy-equipment-repair-software",
    },
    proofPoints: [
      "Broad off-road equipment catalog",
      "Asset Health + component history",
      "Shop + Field + Fleet through Complete Operations",
    ],
    painPoints: {
      eyebrow: "Why equipment needs its own maintenance layer",
      heading:
        "A machine is more than a vehicle record, and mixed equipment operations need more than a truck-only template.",
      body:
        "Equipment maintenance depends on machine identity, operating meters, components, wear, inspections, open work, site context, and durable service evidence. Losing those relationships makes every repair harder to understand later.",
      items: [
        {
          title: "Machine condition is scattered",
          body:
            "Defects, active work, inspection findings, measurements, and wear observations should be visible around the same asset instead of reconstructed from separate records.",
        },
        {
          title: "Equipment classes behave differently",
          body:
            "Excavators, haul trucks, forklifts, aerial lifts, crushers, drills, generators, and attachments need equipment-aware inspection content and identity rather than one generic road-vehicle form.",
        },
        {
          title: "Components outlive one repair",
          body:
            "Tracked undercarriage, major components, mounted assets, measurements, and service evidence need history that stays tied to the machine over time.",
        },
      ],
    },
    workflow: {
      eyebrow: "Equipment workflow",
      heading: "Keep the machine record connected from inspection through repair and history.",
      body:
        "Equipment sits on top of Complete Operations so the asset-specific record stays connected to the Shop, Field Service, and Fleet workflows that execute and administer the work.",
      steps: [
        {
          title: "Identify",
          body:
            "Record equipment class, serial or PIN, make and model, site, operating status, engine identity, and the meter that matters—hours, odometer, or cycles.",
        },
        {
          title: "Inspect",
          body:
            "Use off-road inspection content matched to the machine family and keep failed or recommended findings attached to the asset evidence.",
        },
        {
          title: "Evaluate",
          body:
            "See Asset Health, open defects, active work, components, undercarriage wear, measurements, and recorded service evidence in one machine view.",
        },
        {
          title: "Repair and retain",
          body:
            "Execute work through Shop or Field Service and keep the resulting repair and service history connected to the asset for the next decision.",
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
          "Equipment is a premium add-on to Complete Operations, connecting equipment-specific asset health and maintenance evidence to Shop, Field Service, and Fleet workflows.",
      },
      items: [
        {
          title: "Asset Health",
          body:
            "Bring current meters, operating status, inspection defects, active work, service evidence, site information, and recent history into a machine-centered view.",
        },
        {
          title: "Components, undercarriage, and measurements",
          body:
            "Track equipment components, mounted relationships, undercarriage condition, measurements, and configured wear limits without flattening every machine into the same record.",
        },
        {
          title: "One operating system around the asset",
          body:
            "Complete Operations provides the connected Shop, Field Service, and Fleet surfaces; Equipment adds the specialized machine record and off-road maintenance layer.",
        },
      ],
    },
    faqs: [],
    finalCta: {
      eyebrow: "ProFixIQ Equipment",
      heading: "Add the equipment layer to Complete Operations.",
      body:
        "Equipment is $149 USD per month per location and requires Complete Operations. See the combined subscription or request a walkthrough using your real equipment mix.",
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
