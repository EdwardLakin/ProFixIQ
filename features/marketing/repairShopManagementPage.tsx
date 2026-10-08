import type { CoreSearchPageDefinition } from "./coreSearchPages";

export const repairShopManagementPage = {
  seo: {
    title: "Repair Shop Management Software | ProFixIQ",
    description:
      "Auto repair shop management software for inspections, work orders, parts requests, approvals, invoicing, and fleet or field workflows.",
    path: "/repair-shop-management-software",
    keywords: [
      "repair shop management software",
      "auto repair shop management software",
      "automotive shop management software",
      "mechanic shop management software",
      "shop management software",
      "repair order software",
    ],
    faqs: [
      {
        question: "What does repair shop management software help a shop manage?",
        answer:
          "It connects the day-to-day work of a repair shop, including work orders, technician inspections, repair details, parts activity, customer decisions, completion, and service history.",
      },
      {
        question: "Does ProFixIQ support automotive and heavy-duty repair shops?",
        answer:
          "Yes. ProFixIQ supports automotive and heavy-duty shop workflows, with technician inspections, work orders, parts requests, advisor review, approvals, invoicing, and optional Field Service and Fleet workspaces.",
      },
      {
        question: "Can a technician's inspection findings move into a repair order?",
        answer:
          "Technician findings and recommendations can carry repair details such as notes, parts, and labor into the work order workflow for shop review and customer approval.",
      },
      {
        question: "How should I compare mechanic shop management software?",
        answer:
          "Walk through a real job from intake to invoice. Check how the system handles technician findings, parts requests, quote review, customer approvals, mobile use, and the handoffs between roles.",
      },
    ],
  },
  config: {
    eyebrow: "Repair shop management software",
    title: "Run the repair from the first inspection to the final invoice.",
    lead:
      "ProFixIQ is automotive shop management software for teams that need the work order, technician findings, parts, approvals, and completion to stay connected. It supports both auto repair and heavy-duty shop workflows.",
    secondaryCta: {
      label: "See heavy-duty shop workflows",
      href: "/heavy-duty-shop-management-software",
    },
    proofPoints: [
      "Automotive and heavy-duty workflows",
      "Technician-authored repair detail",
      "Parts, approvals, and invoicing stay connected",
    ],
    painPoints: {
      heading:
        "A shop management system should keep the job moving between the people doing the work.",
      body:
        "When inspection notes, parts questions, customer decisions, and repair status live in separate places, the shop has to reconstruct the job at every handoff.",
      items: [
        {
          title: "Inspection findings become repair work",
          body:
            "Keep technician notes and recommendations attached as the shop reviews what should be quoted and repaired.",
        },
        {
          title: "Parts stay tied to the job",
          body:
            "Connect parts requests and quote activity to the repair that needs them so the team can see what is waiting.",
        },
        {
          title: "Customer decisions stay visible",
          body:
            "Present estimates and approval decisions in the customer workflow, then continue the job with the decision recorded.",
        },
      ],
    },
    workflow: {
      heading: "One connected path through the repair order.",
      steps: [
        {
          title: "Open the job",
          body:
            "Create a work order with the customer concern, vehicle, and assigned technician.",
        },
        {
          title: "Inspect and recommend",
          body:
            "Record findings and build technician-authored repair detail while the condition is being inspected.",
        },
        {
          title: "Review and approve",
          body:
            "Move parts and labor through shop review and present the estimate for a customer decision.",
        },
        {
          title: "Complete and invoice",
          body:
            "Finish approved work, process the invoice, and retain the repair context in service history.",
        },
      ],
    },
    productProof: {
      heading: "Evaluate the actual shop workflow, role by role.",
      body:
        "ProFixIQ brings the technician, parts, advisor, and customer steps together around the same repair record. See how those handoffs work in a product walkthrough.",
      media: {
        src: "/opengraph-image",
        alt: "ProFixIQ repair shop management software overview",
        width: 1200,
        height: 630,
        caption:
          "ProFixIQ connects shop operations with optional Field Service and Fleet workspaces. Request a walkthrough to see the live product.",
      },
      items: [
        {
          title: "Technicians create the repair detail",
          body:
            "Inspection findings and recommendations remain grounded in what the technician observed and entered.",
        },
        {
          title: "Shop roles share one work order",
          body:
            "Advisors and parts staff can act on the repair without asking the technician to recreate its context.",
        },
        {
          title: "Customers have a clear decision step",
          body:
            "Approval activity stays connected to the estimate and repair workflow.",
        },
      ],
    },
    faqs: [],
    finalCta: {
      eyebrow: "See the workflow in ProFixIQ",
      heading: "Choose shop software by walking through a real repair.",
      body:
        "Review how ProFixIQ handles inspections, work orders, parts, approvals, and invoicing for your operation.",
      primary: {
        label: "Compare plans",
        href: "/compare-plans",
      },
      secondary: {
        label: "Request demo access",
        href: "/request-demo",
      },
    },
  },
} satisfies CoreSearchPageDefinition;
