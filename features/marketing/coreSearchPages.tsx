import SearchLandingPage, {
  type SearchLandingConfig,
} from "@/features/marketing/components/SearchLandingPage";

import type { SearchLandingSeo } from "./searchLanding";

export type CoreSearchPageDefinition = {
  seo: SearchLandingSeo;
  config: SearchLandingConfig;
};

const commonFinalCta = {
  eyebrow: "See the workflow",
  heading: "Run the repair from one connected record.",
  body: "Explore ProFixIQ with a free trial or request access to the seeded demo shop to walk through the workflow before you commit.",
};

const brandMedia = {
  src: "/opengraph-image",
  alt: "ProFixIQ heavy-duty and automotive repair shop software",
  width: 1200,
  height: 630,
  caption: "ProFixIQ connects technician findings, repair work, approvals, parts, field service, and fleet maintenance in one operating system.",
};

export const coreSearchPages = {
  heavyDutyShopManagement: {
    seo: {
      title: "Heavy-Duty Shop Management Software | ProFixIQ",
      description:
        "Heavy-duty shop management software for work orders, technician inspections, parts workflows, customer approvals, field service, and fleet visibility.",
      path: "/heavy-duty-shop-management-software",
      keywords: [
        "heavy duty shop management software",
        "heavy duty repair shop software",
        "truck repair shop management software",
        "diesel shop management software",
      ],
      faqs: [
        {
          question: "Is ProFixIQ built for heavy-duty repair shops?",
          answer:
            "Yes. ProFixIQ supports heavy-duty repair workflows including work orders, inspections, technician-authored repair recommendations, parts activity, approvals, field service, and fleet-facing maintenance visibility.",
        },
        {
          question: "Can technicians add repair recommendations, parts, and labor?",
          answer:
            "Yes. Technician findings can carry notes, parts, and labor forward for advisor review instead of being recreated from a separate inspection record.",
        },
        {
          question: "Does ProFixIQ support automotive work too?",
          answer:
            "Yes. ProFixIQ supports automotive and heavy-duty operations while keeping the workflow centered on the repair rather than a vehicle class.",
        },
      ],
    },
    config: {
      eyebrow: "Heavy-duty shop management software",
      title:
        "Keep the repair moving without rebuilding the same information at every desk.",
      lead:
        "ProFixIQ connects work orders, technician inspections, parts, approvals, field work, and fleet visibility so the repair record moves forward with the job.",
      secondaryCta: {
        label: "See heavy-duty work orders",
        href: "/heavy-duty-work-order-software",
      },
      proofPoints: [
        "Heavy-Duty • Automotive • Fleet",
        "Technician-built repairs",
        "Shop, Field Service, and Fleet surfaces",
      ],
      painPoints: {
        heading:
          "Heavy-duty shops lose time when every department has to recreate the repair.",
        body:
          "The expensive part is not one extra click. It is the repeated handoff between technician, parts, advisor, customer, and fleet.",
        items: [
          {
            title: "Inspection findings get retyped",
            body: "A technician identifies the problem, then someone else has to reconstruct the complaint, recommendation, parts, or labor later.",
          },
          {
            title: "Parts requests leave the repair context",
            body: "Verbal requests and separate notes make it harder to know which repair line needs the part and what is blocking the job.",
          },
          {
            title: "Approvals become another disconnected step",
            body: "When estimates and customer decisions live outside the repair flow, the shop spends time reconciling status instead of moving work.",
          },
        ],
      },
      workflow: {
        heading: "One repair record from intake to completion.",
        steps: [
          {
            title: "Create",
            body: "Open the work order, capture the concern, and assign the technician.",
          },
          {
            title: "Inspect",
            body: "Record findings and build recommendations from the technician workflow.",
          },
          {
            title: "Quote & approve",
            body: "Carry parts and labor into advisor review and customer approval.",
          },
          {
            title: "Complete",
            body: "Keep repair status, fulfillment, completion, and history connected.",
          },
        ],
      },
      productProof: {
        heading: "Built around the people actually moving the job.",
        body:
          "ProFixIQ keeps role boundaries clear while preserving the same repair context across the operation.",
        media: brandMedia,
        items: [
          {
            title: "Technician is the source of truth",
            body: "Technician-authored findings, parts, and labor stay attached to the repair for review.",
          },
          {
            title: "Parts stay tied to the work",
            body: "Parts requests and fulfillment remain connected to the repair instead of becoming a side conversation.",
          },
          {
            title: "Customers and fleets get visibility",
            body: "Approval and maintenance-facing workflows can expose the information needed without opening the shop workspace.",
          },
        ],
      },
      faqs: [],
      finalCta: commonFinalCta,
    },
  },

  dieselRepairShop: {
    seo: {
      title: "Diesel Repair Shop Software | ProFixIQ",
      description:
        "Diesel repair shop software for technician-led inspections, work orders, repair recommendations, parts, approvals, and heavy-duty service workflows.",
      path: "/diesel-repair-shop-software",
      keywords: [
        "diesel repair shop software",
        "diesel shop software",
        "truck repair software",
      ],
      faqs: [
        {
          question: "What does ProFixIQ handle for a diesel repair shop?",
          answer:
            "ProFixIQ connects work orders, technician inspections, repair recommendations, parts activity, advisor review, customer approvals, field service, and repair history.",
        },
        {
          question: "Can a diesel technician build the repair from the inspection?",
          answer:
            "Yes. Findings can carry technician-entered notes, parts, and labor into the repair workflow for advisor review.",
        },
        {
          question: "Is ProFixIQ a heavy-truck labor time guide?",
          answer:
            "No. ProFixIQ focuses on shop operations and repair workflow rather than positioning itself as a heavy-truck book-time labor guide.",
        },
      ],
    },
    config: {
      eyebrow: "Diesel repair shop software",
      title:
        "Give diesel technicians a faster path from finding the problem to building the repair.",
      lead:
        "Capture the finding once, keep technician-authored repair detail attached, and move parts, advisor review, approval, and completion through the same workflow.",
      secondaryCta: {
        label: "See heavy-duty inspections",
        href: "/heavy-duty-inspection-software",
      },
      proofPoints: [
        "Heavy-duty-first workflow",
        "Voice inspection support",
        "Technician-authored parts and labor",
      ],
      painPoints: {
        heading:
          "The repair slows down when technician knowledge has to be translated repeatedly.",
        items: [
          {
            title: "The tech explains it twice",
            body: "A finding is documented, then repeated verbally or rewritten so another department can act on it.",
          },
          {
            title: "Repair detail gets diluted",
            body: "Cause, recommendation, parts, and labor can lose context as they move between technician, advisor, and parts.",
          },
          {
            title: "The bay waits on invisible blockers",
            body: "Parts, quote, approval, and status need to be visible without chasing another person for an update.",
          },
        ],
      },
      workflow: {
        heading: "Let the technician build the repair, then let the shop review it.",
        steps: [
          {
            title: "Inspect",
            body: "Capture the concern and finding in the technician workflow.",
          },
          {
            title: "Build",
            body: "Add the recommendation, required parts, and labor while the repair context is fresh.",
          },
          {
            title: "Review",
            body: "Parts and advisor roles quote and review without replacing technician-authored detail.",
          },
          {
            title: "Approve & repair",
            body: "Customer decisions and repair execution stay tied to the same line of work.",
          },
        ],
      },
      productProof: {
        heading: "Designed for the way repair information is actually created.",
        media: brandMedia,
        items: [
          {
            title: "Free-form inspection capture",
            body: "Technicians can capture findings without forcing every diagnosis into a guided script.",
          },
          {
            title: "Repair detail survives the handoff",
            body: "The shop reviews technician-authored information instead of recreating it.",
          },
          {
            title: "Field work has its own surface",
            body: "Service-truck operations can use Field Service without exposing the full shop workspace.",
          },
        ],
      },
      faqs: [],
      finalCta: commonFinalCta,
    },
  },

  heavyDutyWorkOrder: {
    seo: {
      title: "Heavy-Duty Work Order Software | ProFixIQ",
      description:
        "Heavy-duty work order software that connects technician findings, repair lines, parts requests, estimates, approvals, communication, and completion.",
      path: "/heavy-duty-work-order-software",
      keywords: [
        "heavy duty work order software",
        "truck repair work order software",
        "diesel work order software",
      ],
      faqs: [
        {
          question: "What stays connected to a ProFixIQ work order?",
          answer:
            "The work order workspace can keep repair lines, inspection context, parts, estimate and approval activity, communication, and timeline information together.",
        },
        {
          question: "Can inspection recommendations become work order repairs?",
          answer:
            "Yes. Failed or recommended findings can carry technician-authored repair detail into the work order workflow for parts and advisor review.",
        },
        {
          question: "Can different shop roles work from the same work order?",
          answer:
            "Yes. ProFixIQ uses one work order workspace with role and capability boundaries rather than separate copies of the job for each department.",
        },
      ],
    },
    config: {
      eyebrow: "Heavy-duty work order software",
      title:
        "Make the work order the place the repair gets done—not just where it gets recorded.",
      lead:
        "Keep repair lines, inspection findings, technician detail, parts, approvals, communication, and job history in one operational workspace.",
      secondaryCta: {
        label: "See diesel repair workflow",
        href: "/diesel-repair-shop-software",
      },
      proofPoints: [
        "One work order workspace",
        "Role-aware access",
        "Inspection-to-repair continuity",
      ],
      painPoints: {
        heading:
          "A work order becomes slow when it is only a container for information from other systems.",
        items: [
          {
            title: "Too many separate screens",
            body: "Technicians, advisors, and parts staff lose time finding the current version of the job.",
          },
          {
            title: "Status is inferred instead of visible",
            body: "A shop should not need a conversation just to learn whether a repair is waiting on parts, quote, approval, or execution.",
          },
          {
            title: "History loses the why",
            body: "Completed work is more useful when findings, decisions, parts, and repair context remain attached.",
          },
        ],
      },
      workflow: {
        heading: "Queues find the work. The work order workspace does the work.",
        steps: [
          {
            title: "Open & assign",
            body: "Create the work order, define the concern, and assign the technician.",
          },
          {
            title: "Build repair lines",
            body: "Carry inspection findings and technician recommendations into the workspace.",
          },
          {
            title: "Move blockers",
            body: "Parts, quote, approval, and communication stay visible around the repair.",
          },
          {
            title: "Complete & retain",
            body: "Finish the job with the repair context preserved for history.",
          },
        ],
      },
      productProof: {
        heading: "One workspace, different capabilities.",
        media: brandMedia,
        items: [
          {
            title: "Technician context stays intact",
            body: "The person doing the diagnosis can author the repair detail that later roles review.",
          },
          {
            title: "Advisor review stays deliberate",
            body: "Technician input does not automatically become a customer-facing promise without shop review.",
          },
          {
            title: "Operational timeline remains visible",
            body: "The workspace keeps the job's movement and decisions in context rather than spreading them across disconnected records.",
          },
        ],
      },
      faqs: [],
      finalCta: commonFinalCta,
    },
  },

  heavyDutyInspection: {
    seo: {
      title: "Heavy-Duty Inspection Software | ProFixIQ",
      description:
        "Heavy-duty inspection software for technician findings, voice capture, failed and recommended items, repair recommendations, parts, labor, and work order follow-through.",
      path: "/heavy-duty-inspection-software",
      keywords: [
        "heavy duty inspection software",
        "diesel inspection software",
        "truck repair inspection software",
      ],
      faqs: [
        {
          question: "Does ProFixIQ support voice inspections?",
          answer:
            "Yes. ProFixIQ supports voice-based technician inspection capture as part of its inspection workflow.",
        },
        {
          question: "What happens when an inspection item fails or is recommended?",
          answer:
            "The finding can carry notes and technician-authored repair detail such as parts and labor forward for shop review and work order follow-through.",
        },
        {
          question: "Can shops build inspection templates?",
          answer:
            "Yes. ProFixIQ includes inspection-template workflows and a master inspection list used across applicable shop, fleet, and field inspection scenarios.",
        },
      ],
    },
    config: {
      eyebrow: "Heavy-duty inspection software",
      title:
        "Turn the inspection finding into usable repair work without typing it all over again.",
      lead:
        "Capture technician findings, fail or recommend items, add repair detail, and carry the result forward into the work order instead of leaving the inspection as a dead-end report.",
      secondaryCta: {
        label: "See shop management workflow",
        href: "/heavy-duty-shop-management-software",
      },
      proofPoints: [
        "Voice inspection capture",
        "Fail & recommend workflow",
        "Parts and labor can follow the finding",
      ],
      painPoints: {
        heading:
          "An inspection has little operational value if the shop has to rebuild every failed item afterward.",
        items: [
          {
            title: "Findings stop at the report",
            body: "The inspection looks complete, but the advisor still has to reconstruct what should actually be sold or repaired.",
          },
          {
            title: "Technician context disappears",
            body: "Notes, cause, recommendation, parts, and labor are most accurate while the technician is still in the inspection.",
          },
          {
            title: "Recommended work gets lost",
            body: "Deferred or recommended items need durable context so the shop and customer can act on them later.",
          },
        ],
      },
      workflow: {
        heading: "Capture once, then carry the finding forward.",
        steps: [
          {
            title: "Inspect",
            body: "Work through the inspection and capture findings, including voice where appropriate.",
          },
          {
            title: "Fail or recommend",
            body: "Mark the item and document the condition and recommendation.",
          },
          {
            title: "Build repair detail",
            body: "Add technician-authored parts and labor when the repair requires them.",
          },
          {
            title: "Submit to workflow",
            body: "Carry the finding into work order, parts, advisor review, and approval flow.",
          },
        ],
      },
      productProof: {
        heading: "The inspection is connected to the repair engine.",
        media: brandMedia,
        items: [
          {
            title: "Technician-authored findings persist",
            body: "Failed and recommended items retain the information entered by the technician.",
          },
          {
            title: "No-parts-needed stays explicit",
            body: "A finding that does not require parts should not create an unnecessary parts request.",
          },
          {
            title: "Templates can match the equipment",
            body: "Inspection templates can be built from the master list for different vehicle and equipment use cases.",
          },
        ],
      },
      faqs: [],
      finalCta: commonFinalCta,
    },
  },
} satisfies Record<string, CoreSearchPageDefinition>;

export function CoreSearchLandingPage({
  definition,
}: {
  definition: CoreSearchPageDefinition;
}) {
  const config = {
    ...definition.config,
    faqs: definition.seo.faqs ?? [],
  };

  return <SearchLandingPage config={config} />;
}
