import type { SearchLandingConfig } from "@/features/marketing/components/SearchLandingPage";
import type { SearchLandingSeo } from "./searchLanding";

export type FieldEquipmentSearchPageDefinition = {
  seo: SearchLandingSeo;
  config: SearchLandingConfig;
};

const brandMedia = {
  src: "/opengraph-image",
  alt: "ProFixIQ field service and equipment repair software",
  width: 1200,
  height: 630,
  caption:
    "ProFixIQ connects field service, inspections, repair detail, parts, approvals, and equipment maintenance workflows without exposing the full shop workspace to every field user.",
};

const finalCta = {
  eyebrow: "See the workflow",
  heading: "Run field and equipment repair work from a purpose-built operating surface.",
  body: "Explore ProFixIQ with a free trial or request demo access to walk through the workflow before you commit.",
};

export const fieldEquipmentSearchPages = {
  mobileTruckRepair: {
    seo: {
      title: "Mobile Truck Repair Software | ProFixIQ",
      description: "Mobile truck repair software for service-truck technicians, field inspections, repair work, parts activity, approvals, and connected shop visibility.",
      path: "/mobile-truck-repair-software",
      keywords: ["mobile truck repair software", "mobile diesel repair software", "roadside truck repair software", "field service truck software"],
      faqs: [
        { question: "Is ProFixIQ Field Service separate from the shop technician app?", answer: "Yes. Field Service is a dedicated service-truck surface. Shop technicians only see it when the shop enables Field Service access." },
        { question: "Can field technicians document inspections and repair work?", answer: "Yes. Field workflows can capture inspection findings and repair detail while keeping the work connected to the broader ProFixIQ operation." },
        { question: "Does every technician automatically get Field Service access?", answer: "No. Field Service access is controlled separately so in-shop technicians are not automatically exposed to the field-service surface." },
      ],
    },
    config: {
      eyebrow: "Mobile truck repair software",
      title: "Give the service truck its own repair workflow without turning it into a second shop system.",
      lead: "ProFixIQ Field Service gives mobile technicians a dedicated surface for field repair work while keeping the repair connected to the rest of the operation.",
      secondaryCta: { label: "See Field Service", href: "/field-service" },
      proofPoints: ["Dedicated Field Service surface", "Heavy-duty and mobile repair workflows", "Controlled technician access"],
      painPoints: { heading: "Mobile repair breaks down when the truck relies on calls, texts, and disconnected notes.", items: [
        { title: "Field context stays in the truck", body: "Inspection findings and repair detail should not need to be reconstructed back at the shop." },
        { title: "Shop and field permissions blur", body: "A mobile technician needs the field workflow without automatically receiving every shop surface." },
        { title: "Parts and approvals become phone calls", body: "Field repairs need visible operational context when parts or customer decisions are blocking progress." },
      ]},
      workflow: { heading: "Keep the service call connected from arrival to completion.", steps: [
        { title: "Open", body: "Start the field job from the dedicated Field Service surface." },
        { title: "Inspect", body: "Capture findings and the repair context at the asset." },
        { title: "Build", body: "Add repair detail and keep parts or approval needs tied to the work." },
        { title: "Complete", body: "Finish the field work with the service history retained in ProFixIQ." },
      ]},
      productProof: { heading: "Built for service-truck work, not a desktop page squeezed onto a phone.", media: brandMedia, items: [
        { title: "Separate field boundary", body: "Field Service remains distinct from Shop Mobile and the full desktop shop." },
        { title: "Technician-authored repair detail", body: "The person at the equipment can capture the information other roles need without retyping it later." },
        { title: "Connected operation", body: "Field work can remain visible to the broader operation without collapsing product boundaries." },
      ]},
      faqs: [], finalCta,
    },
  },
  serviceTruckWorkOrder: {
    seo: {
      title: "Service Truck Work Order Software | ProFixIQ",
      description: "Service truck work order software for mobile repair jobs, technician findings, parts, repair detail, approvals, and field-service history.",
      path: "/service-truck-work-order-software",
      keywords: ["service truck work order software", "mobile mechanic work order software", "field service work order software"],
      faqs: [
        { question: "Is this the same as ProFixIQ Shop work orders?", answer: "No. Field Service is a separate operating surface for service-truck work. Shop and Field remain distinct products and access boundaries." },
        { question: "Can a field technician add parts and repair detail?", answer: "ProFixIQ field workflows are designed to preserve technician-authored repair context, including the parts and labor detail needed to move the repair forward." },
        { question: "Can a shop use both Shop and Field Service?", answer: "Yes. A business can use Shop and Field Service while keeping technician access and navigation appropriate to each surface." },
      ],
    },
    config: {
      eyebrow: "Service truck work order software",
      title: "Keep the service-truck job operational from dispatch to repair history.",
      lead: "Field repair work needs more than a ticket number. Keep findings, technician detail, parts needs, decisions, and completion around the same job context.",
      secondaryCta: { label: "See mobile truck repair", href: "/mobile-truck-repair-software" },
      proofPoints: ["Field-first job workflow", "Technician repair context", "Separate Shop and Field surfaces"],
      painPoints: { heading: "A service call gets expensive when the record is rebuilt after the truck leaves.", items: [
        { title: "The field tech reports by phone", body: "The shop loses precision when the repair exists as a conversation instead of a durable job record." },
        { title: "Parts lose job context", body: "A part request is more useful when it remains attached to the exact field repair that needs it." },
        { title: "History is incomplete", body: "Future service decisions are weaker when mobile work never makes it into the equipment record." },
      ]},
      workflow: { heading: "One field job record through the service call.", steps: [
        { title: "Start", body: "Open the mobile repair job in Field Service." },
        { title: "Diagnose", body: "Capture findings and technician-authored repair detail." },
        { title: "Move blockers", body: "Keep parts and approval needs visible around the repair." },
        { title: "Close", body: "Complete the job with service history preserved." },
      ]},
      productProof: { heading: "Field execution without giving up operational control.", media: brandMedia, items: [
        { title: "Purpose-built access", body: "Only enabled users see the Field Service surface." },
        { title: "Repair context survives handoff", body: "Technician-authored information remains attached for later review." },
        { title: "Field work stays in history", body: "The completed service call remains part of the asset's maintenance record." },
      ]},
      faqs: [], finalCta,
    },
  },
  heavyEquipmentRepair: {
    seo: {
      title: "Heavy Equipment Repair Software | ProFixIQ",
      description: "Heavy equipment repair software with equipment asset records, Asset Health, off-road inspections, components, measurements, wear evidence, active work, and service history.",
      path: "/heavy-equipment-repair-software",
      keywords: ["heavy equipment repair software", "heavy equipment maintenance software", "construction equipment repair software"],
      faqs: [
        { question: "What equipment can ProFixIQ Equipment support?", answer: "The Equipment catalog spans excavators, loaders, dozers, graders, haul trucks, forklifts and telehandlers, aerial equipment, compactors, road-building machines, crushing and screening equipment, drilling and mining equipment, forestry and agricultural machines, stationary equipment, and attachments." },
        { question: "Can heavy equipment be serviced in the field?", answer: "Yes. With Complete Operations, equipment work can use the Shop or Field Service workflow while the Equipment layer keeps the machine-specific asset, inspection, component, measurement, wear, and service history together." },
        { question: "Is Equipment included in Complete Operations?", answer: "Equipment Operations is a standalone $399 USD per month, per location subscription and does not require Complete Operations. It is coming soon." },
        { question: "Does ProFixIQ claim OEM telematics integration for heavy equipment?", answer: "No. ProFixIQ does not position Equipment as an OEM telematics or machine-control integration." },
      ],
    },
    config: {
      eyebrow: "Heavy equipment repair software",
      title: "Keep heavy-equipment repair tied to the machine condition that created the work.",
      lead: "ProFixIQ Equipment adds machine-specific asset records, Asset Health, off-road inspections, components, measurements, wear evidence, active work, and service history to Complete Operations.",
      primaryCta: { label: "See Equipment pricing", href: "/compare-plans#equipment" },
      secondaryCta: { label: "Explore all Equipment", href: "/equipment-maintenance-software" },
      proofPoints: ["Equipment Asset Health", "Shop + Field execution", "Components, wear, and history"],
      painPoints: { heading: "Heavy-equipment repair gets expensive when machine condition and repair history are separated.", items: [
        { title: "Generic vehicle records fall short", body: "Heavy equipment needs machine identity, operating meters, site context, components, measurements, and equipment-specific inspection content." },
        { title: "Repairs happen in more than one place", body: "The same machine may need shop work, field work, parts activity, and later service review without losing its equipment record." },
        { title: "Wear evidence disappears", body: "Undercarriage condition, measurements, component history, defects, and prior work should remain available around the machine." },
      ]},
      workflow: { heading: "Inspect the machine, execute the repair, and retain the equipment history.", steps: [
        { title: "Identify", body: "Record equipment class, serial or PIN, make and model, site, status, engine identity, and the applicable hours, odometer, or cycle meter." },
        { title: "Inspect", body: "Use equipment-family inspection content and keep defects or recommendations connected to the asset." },
        { title: "Repair", body: "Execute work through Shop or Field Service with the machine context available to the people doing the repair." },
        { title: "Retain", body: "Keep components, measurements, wear observations, active work, and completed service history around the asset." },
      ]},
      productProof: { heading: "A real equipment layer—not a truck record with a different label.", media: brandMedia, items: [
        { title: "Asset Health", body: "See machine identity, meters, operating status, open defects, active work, site context, and recent service evidence together." },
        { title: "Component and wear detail", body: "Track component hierarchy, mounted relationships, undercarriage wear, measurements, and configured wear limits." },
        { title: "Complete Operations underneath", body: "Equipment adds the specialized machine record while Complete Operations connects Shop, Field Service, and Fleet workflows." },
      ]},
      faqs: [],
      finalCta: {
        eyebrow: "ProFixIQ Equipment",
        heading: "Add heavy-equipment maintenance to Complete Operations.",
        body: "Equipment Operations is coming soon at $399 USD per month per location as a standalone subscription. Request a walkthrough with your actual equipment mix.",
        primary: { label: "See Complete + Equipment pricing", href: "/compare-plans#equipment" },
        secondary: { label: "Request demo access", href: "/request-demo" },
      },
    },
  },
  offHighwayEquipmentRepair: {
    seo: {
      title: "Off-Highway Equipment Repair Software | ProFixIQ",
      description: "Off-highway equipment repair software for mixed off-road assets, equipment inspections, Asset Health, components, measurements, wear tracking, work, and service history.",
      path: "/off-highway-equipment-repair-software",
      keywords: ["off highway equipment repair software", "off road equipment maintenance software", "mining equipment maintenance software"],
      faqs: [
        { question: "What off-highway equipment families are covered?", answer: "The Equipment catalog includes excavation, loading, dozing and grading, hauling, material handling, aerial access, compaction, road construction, crushing and screening, drilling, trenching, surface and underground mining, forestry, agriculture, oilfield and energy, snow and municipal, utility/site vehicles, stationary or towable equipment, and attachments." },
        { question: "Can the same platform cover trucks and equipment?", answer: "Yes. Complete Operations connects Shop, Field Service, and Fleet Maintenance, while Equipment Operations adds equipment-specific records, inspections, Asset Health, components, measurements, wear evidence, and history." },
        { question: "Is Equipment a standalone plan?", answer: "Yes. Equipment Operations is a standalone $399 USD per month, per location subscription that is coming soon. It does not require Complete Operations." },
      ],
    },
    config: {
      eyebrow: "Off-highway equipment repair software",
      title: "Manage a mixed equipment population without forcing every asset into a truck-only template.",
      lead: "ProFixIQ Equipment supports broad off-road and industrial machine families with equipment-aware identity, inspections, Asset Health, components, measurements, wear evidence, active work, and service history.",
      primaryCta: { label: "Explore Equipment", href: "/equipment-maintenance-software" },
      secondaryCta: { label: "See Equipment pricing", href: "/compare-plans#equipment" },
      proofPoints: ["20 equipment-family groups", "Hours, odometer, or cycle meters", "Shop + Field + Fleet through Complete"],
      painPoints: { heading: "Mixed equipment operations need shared structure without pretending every machine is the same.", items: [
        { title: "Asset types vary widely", body: "A forklift, excavator, boom lift, crusher, haul truck, drill, generator, and attachment need different maintenance context." },
        { title: "Condition has more dimensions", body: "Equipment decisions can depend on meters, operating status, components, undercarriage, measurements, defects, and the work already underway." },
        { title: "Execution and administration still need to connect", body: "Shop, field, and fleet teams need the same equipment truth without collapsing their operational roles into one screen." },
      ]},
      workflow: { heading: "Keep the equipment-specific record connected to the operation doing the work.", steps: [
        { title: "Classify", body: "Give the asset the correct equipment family, identity, meter type, site, status, and machine profile." },
        { title: "Inspect", body: "Use family-aware off-road inspection content and retain defects and recommendations as durable evidence." },
        { title: "Execute", body: "Move repair work through the appropriate Shop or Field Service workflow while maintaining the equipment context." },
        { title: "Review", body: "Use Asset Health, components, measurements, wear evidence, and history for the next maintenance decision." },
      ]},
      productProof: { heading: "From material handling to mining, keep one equipment model without flattening the machines.", media: brandMedia, items: [
        { title: "Broad machine-family catalog", body: "Equipment content spans construction, industrial, mining, forestry, agriculture, energy, municipal, utility, stationary, and attachment categories." },
        { title: "Machine-centered Asset Health", body: "Current meters, status, defects, work, service evidence, components, and measurements stay organized around the asset." },
        { title: "Connected commercial model", body: "Equipment Operations is a standalone product with its own workspace, and it connects to Shop, Field Service, and Fleet for shops that run them." },
      ]},
      faqs: [],
      finalCta: {
        eyebrow: "ProFixIQ Equipment",
        heading: "Bring mixed off-highway equipment into Complete Operations.",
        body: "Equipment Operations is coming soon at $399 USD per month per location. Request a walkthrough of the machine families you maintain.",
        primary: { label: "See Complete + Equipment pricing", href: "/compare-plans#equipment" },
        secondary: { label: "Request demo access", href: "/request-demo" },
      },
    },
  },
} satisfies Record<string, FieldEquipmentSearchPageDefinition>;
