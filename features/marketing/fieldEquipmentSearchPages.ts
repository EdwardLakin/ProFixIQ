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
      description: "Heavy equipment repair software for inspections, technician findings, repair recommendations, field service, maintenance history, and connected fleet visibility.",
      path: "/heavy-equipment-repair-software",
      keywords: ["heavy equipment repair software", "equipment maintenance software", "construction equipment repair software"],
      faqs: [
        { question: "What equipment can ProFixIQ inspection workflows support?", answer: "ProFixIQ's master inspection foundation is being expanded for off-road equipment such as forklifts, man lifts, excavators, and larger industrial or mining equipment." },
        { question: "Can heavy equipment be serviced in the field?", answer: "Yes. Field Service is intended for service-truck workflows where the technician works at the equipment rather than inside the shop." },
        { question: "Does ProFixIQ claim OEM telematics integration for heavy equipment?", answer: "No. ProFixIQ does not position this workflow as an OEM telematics or machine-control integration." },
      ],
    },
    config: {
      eyebrow: "Heavy equipment repair software",
      title: "Carry the same repair discipline from highway vehicles into heavy equipment.",
      lead: "Use inspection, technician-authored repair detail, field service, maintenance history, and fleet administration without forcing equipment into an on-highway-only workflow.",
      secondaryCta: { label: "See off-highway workflows", href: "/off-highway-equipment-repair-software" },
      proofPoints: ["Equipment-oriented inspections", "Field Service support", "Fleet maintenance visibility"],
      painPoints: { heading: "Equipment maintenance becomes fragmented when inspections, field repairs, and history live separately.", items: [
        { title: "Generic vehicle forms do not fit", body: "Off-road assets need inspection content that reflects equipment systems rather than only highway vehicles." },
        { title: "Repairs happen away from the shop", body: "The service truck needs a usable field workflow at the machine." },
        { title: "Maintenance history is hard to reconstruct", body: "Inspection findings and completed repairs should remain attached to the equipment record." },
      ]},
      workflow: { heading: "Inspect, repair, and retain equipment history in connected workflows.", steps: [
        { title: "Define", body: "Use equipment-appropriate inspection content from the master inspection foundation." },
        { title: "Inspect", body: "Capture findings at the asset in the relevant Shop or Field workflow." },
        { title: "Repair", body: "Preserve technician-authored repair context as the work moves forward." },
        { title: "Track", body: "Keep maintenance and repair history visible for later decisions." },
      ]},
      productProof: { heading: "Built to expand beyond on-highway assets without pretending every machine is the same.", media: brandMedia, items: [
        { title: "Broader master inspection list", body: "The inspection foundation covers off-road categories such as forklifts, man lifts, excavators, and large equipment." },
        { title: "Shop and Field use cases", body: "Equipment can be serviced in the shop or through the separate Field Service surface." },
        { title: "Fleet stays administrative", body: "Fleet controls assets, maintenance, inspections, defects, requests, and history without becoming a shop work-order system." },
      ]},
      faqs: [], finalCta,
    },
  },
  offHighwayEquipmentRepair: {
    seo: {
      title: "Off-Highway Equipment Repair Software | ProFixIQ",
      description: "Off-highway equipment repair software for inspections, field maintenance, technician repair detail, equipment history, and fleet administration.",
      path: "/off-highway-equipment-repair-software",
      keywords: ["off highway equipment repair software", "off road equipment maintenance software", "mining equipment maintenance software"],
      faqs: [
        { question: "Does ProFixIQ support off-highway inspection templates?", answer: "ProFixIQ's master inspection list is designed to support off-road categories alongside on-highway vehicles, with Fleet and Field workflows able to use appropriate inspection content." },
        { question: "Is Fleet used to create shop work orders for off-highway equipment?", answer: "No. Fleet remains the control and administration surface. Shop work-order creation belongs to the Shop product." },
        { question: "Can the same platform cover trucks and equipment?", answer: "Yes. ProFixIQ is designed around connected Shop, Field Service, and Fleet products so operations can manage mixed vehicle and equipment environments while preserving product boundaries." },
      ],
    },
    config: {
      eyebrow: "Off-highway equipment repair software",
      title: "Manage mixed fleets and equipment without forcing every asset into a truck-only template.",
      lead: "ProFixIQ extends its inspection and maintenance foundation into off-highway equipment while keeping field repair execution and fleet administration in the right product surfaces.",
      secondaryCta: { label: "See heavy equipment repair", href: "/heavy-equipment-repair-software" },
      proofPoints: ["Off-road inspection categories", "Field + Fleet availability", "No Fleet-side work-order creation"],
      painPoints: { heading: "Mixed equipment operations need shared structure without generic one-size-fits-all forms.", items: [
        { title: "Asset types vary widely", body: "A forklift, excavator, man lift, and mining unit do not need identical inspection content." },
        { title: "Work happens in different places", body: "Some repairs happen in a shop while others belong to a service-truck workflow." },
        { title: "Administration and repair get mixed", body: "Fleet managers need control and visibility without being dropped into shop execution screens." },
      ]},
      workflow: { heading: "Use the right surface for the asset and the work being done.", steps: [
        { title: "Configure", body: "Build equipment-appropriate inspections from the shared master list." },
        { title: "Inspect", body: "Run the inspection through the applicable Field, Fleet, or Shop scenario." },
        { title: "Execute", body: "Perform repair work in Shop or Field Service, not inside Fleet administration." },
        { title: "Administer", body: "Use Fleet for maintenance planning, defects, requests, history, and asset oversight." },
      ]},
      productProof: { heading: "One platform, explicit product boundaries.", media: brandMedia, items: [
        { title: "Mixed-asset inspection foundation", body: "Master inspection content can expand across on-highway and off-highway categories." },
        { title: "Field execution where the machine sits", body: "Service-truck technicians use Field Service rather than the full shop surface." },
        { title: "Fleet for control", body: "Fleet remains focused on administration, maintenance planning, defects, inspections, and history." },
      ]},
      faqs: [], finalCta,
    },
  },
} satisfies Record<string, FieldEquipmentSearchPageDefinition>;
