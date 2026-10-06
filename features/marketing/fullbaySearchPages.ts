import type { SearchLandingConfig } from "./components/SearchLandingPage";
import type { SearchLandingSeo } from "./searchLanding";

export type CompetitorSearchPageDefinition = {
  seo: SearchLandingSeo;
  config: SearchLandingConfig;
};

const currentMarketNote =
  "Fullbay details on this page reflect its public product and pricing information reviewed in October 2026. Product packaging and features can change, so buyers should verify current Fullbay terms directly before purchasing.";

const brandedMedia = {
  src: "/pwa-icons/icon-512",
  alt: "ProFixIQ repair shop software",
  width: 512,
  height: 512,
  caption: "ProFixIQ connects technician-built repair detail with shop, field service, customer, and fleet workflows.",
};

export const fullbayAlternativePage: CompetitorSearchPageDefinition = {
  seo: {
    title: "Fullbay Alternative for Heavy-Duty Repair Shops | ProFixIQ",
    description:
      "Compare ProFixIQ as a Fullbay alternative for heavy-duty repair shops, with technician-built repairs, voice inspections, parts workflows, approvals, field service, and fleet maintenance.",
    path: "/compare/fullbay-alternative",
    keywords: [
      "Fullbay alternative",
      "Fullbay alternatives",
      "Fullbay competitor",
      "heavy duty repair shop software",
      "diesel shop software",
    ],
    faqs: [
      {
        question: "Is ProFixIQ a Fullbay alternative?",
        answer:
          "Yes. ProFixIQ and Fullbay both serve heavy-duty repair operations, but they organize the workflow differently. ProFixIQ emphasizes technician-authored repair construction, voice inspections, connected approvals and parts flow, and separate Shop, Field Service, and Fleet surfaces.",
      },
      {
        question: "What does Fullbay offer that buyers should consider?",
        answer:
          "Fullbay publicly offers mature heavy-duty shop management features including service orders, estimates and invoicing, inventory, reporting, customer portals, preventive maintenance, integrations, labor and service guide options, payments, and an expanding AI toolset.",
      },
      {
        question: "Does ProFixIQ claim to replace every Fullbay integration?",
        answer:
          "No. ProFixIQ should be evaluated for its repair workflow and product structure, not as a claim-for-claim replacement for Fullbay's integration catalog or labor and service guide ecosystem.",
      },
    ],
  },
  config: {
    eyebrow: "Fullbay alternative",
    title: "Looking beyond Fullbay? Compare the workflow before you compare the checklist.",
    lead:
      "Fullbay is a mature heavy-duty platform with broad shop-management capabilities. ProFixIQ takes a different approach: start with the technician, keep repair detail connected, and separate Shop, Field Service, and Fleet into focused operating surfaces.",
    proofPoints: [
      "Technician-built repairs",
      "Voice inspection workflow",
      "Separate Shop • Field Service • Fleet surfaces",
    ],
    painPoints: {
      eyebrow: "A fair comparison",
      heading: "Fullbay already covers a lot. The question is which operating model fits your shop.",
      body:
        "A credible alternative page should acknowledge where Fullbay is strong instead of pretending the incumbent has no capabilities.",
      items: [
        {
          title: "Fullbay has a mature heavy-duty feature set",
          body: "Its public offering includes service orders, estimating and invoicing, inventory, reporting, preventive maintenance, customer portals, payments, and technician tools.",
        },
        {
          title: "Fullbay has a broad integration ecosystem",
          body: "Its current public plans advertise integrations and guide products including QuickBooks, MOTOR, Mitchell, telematics, GPS, and related heavy-duty resources.",
        },
        {
          title: "Fullbay is adding AI quickly",
          body: "Fullbay Next is positioned as AI-native with voice-to-text, image analysis, Kanban repair flow, and an AI receptionist add-on.",
        },
      ],
    },
    workflow: {
      eyebrow: "How ProFixIQ differs",
      heading: "ProFixIQ is designed around repair continuity from the technician outward.",
      body:
        "The core distinction is not whether both products can create a work order. It is how repair knowledge moves between technician, parts, advisor, customer, field operation, and fleet.",
      steps: [
        {
          title: "Technician captures the finding",
          body: "Inspection findings, notes, recommendations, parts, and labor can originate in the technician workflow instead of being reconstructed later.",
        },
        {
          title: "The repair detail stays attached",
          body: "Parts and advisor roles review the existing repair context rather than replacing the technician's source information.",
        },
        {
          title: "Approval stays in the repair lifecycle",
          body: "Customer approval and deferral remain connected to the repair line and its history.",
        },
        {
          title: "Each operating surface stays focused",
          body: "Shop, Field Service, Fleet, customer, and driver experiences have separate boundaries instead of exposing one broad workspace to every role.",
        },
      ],
    },
    productProof: {
      eyebrow: "Where ProFixIQ is intentionally different",
      heading: "Choose ProFixIQ when the technician-built workflow is the priority.",
      body:
        "ProFixIQ is not trying to win by claiming Fullbay lacks inventory, portals, reporting, AI, or integrations. Its differentiation is how the repair is authored and how each product surface is bounded.",
      media: brandedMedia,
      items: [
        {
          title: "Technician-authored repair construction",
          body: "Findings can carry technician-entered recommendation, parts, and labor into shop review instead of forcing another role to rebuild the repair from notes.",
        },
        {
          title: "Voice is built into inspection capture",
          body: "Voice inspection workflows are designed to reduce typing while keeping the technician as the source of repair truth.",
        },
        {
          title: "Fleet is a separate administrative product",
          body: "Fleet users manage assets, PM, defects, inspections, requests, approvals, and history without inheriting shop work-order creation privileges.",
        },
        {
          title: "Field Service is a separate service-truck surface",
          body: "Field operators get the workflows needed for off-site repair without automatically receiving the full shop application.",
        },
      ],
    },
    faqs: [],
    finalCta: {
      eyebrow: "Evaluate it with real work",
      heading: "Put the same repair through both systems.",
      body:
        `Compare work-order creation, technician inspection, parts handoff, approval, completion, and history using the workflow your shop actually runs. ${currentMarketNote}`,
    },
  },
};

export const profixiqVsFullbayPage: CompetitorSearchPageDefinition = {
  seo: {
    title: "ProFixIQ vs Fullbay | Heavy-Duty Shop Software Comparison",
    description:
      "Compare ProFixIQ vs Fullbay for heavy-duty repair workflows, technician tools, inspections, work orders, parts, approvals, field service, fleet maintenance, integrations, and AI.",
    path: "/compare/profixiq-vs-fullbay",
    keywords: [
      "ProFixIQ vs Fullbay",
      "Fullbay vs ProFixIQ",
      "Fullbay comparison",
      "heavy duty shop software comparison",
      "diesel repair software comparison",
    ],
    faqs: [
      {
        question: "Which is better, ProFixIQ or Fullbay?",
        answer:
          "It depends on what the shop values. Fullbay has a mature heavy-duty platform and broad integration ecosystem. ProFixIQ is designed around technician-built repair detail, connected inspection-to-repair flow, voice capture, and separate Shop, Field Service, and Fleet operating surfaces.",
      },
      {
        question: "Does Fullbay have AI and voice tools?",
        answer:
          "Yes. Fullbay currently advertises AI technician note tools, voice-to-text, image analysis in Fullbay Next, and an AI receptionist add-on. ProFixIQ should not be evaluated on the assumption that Fullbay lacks AI.",
      },
      {
        question: "Does Fullbay support fleets and customer portals?",
        answer:
          "Yes. Fullbay publicly offers customer portal and fleet-maintenance capabilities. ProFixIQ differentiates by keeping its Fleet product administratively separate from shop work-order creation and by maintaining a distinct driver-facing experience.",
      },
    ],
  },
  config: {
    eyebrow: "ProFixIQ vs Fullbay",
    title: "Two heavy-duty platforms. Different assumptions about how the repair should move.",
    lead:
      "Fullbay brings a mature heavy-duty feature and integration set. ProFixIQ is being built around technician-originated repair truth, fewer handoff rebuilds, and clear boundaries between shop, field, fleet, customer, and driver workflows.",
    proofPoints: [
      "Workflow comparison—not a hit piece",
      "Current Fullbay capabilities acknowledged",
      "No unsupported parity claims",
    ],
    painPoints: {
      eyebrow: "What Fullbay brings",
      heading: "Fullbay is the established benchmark, and buyers should credit its strengths.",
      body:
        "Its current public product pages show a broad heavy-duty management platform rather than a simple work-order tool.",
      items: [
        {
          title: "Established operations stack",
          body: "Fullbay covers service orders, estimates, invoices, payments, inventory, technician management, customer communication, preventive maintenance, and reporting.",
        },
        {
          title: "Guides and integrations",
          body: "Higher Fullbay plans advertise MOTOR and Mitchell resources plus QuickBooks, telematics, GPS, and other integrations that shops may depend on.",
        },
        {
          title: "Current AI roadmap",
          body: "Fullbay Next adds voice-to-text, image scanning, Kanban-style repair flow, and AI receptionist capabilities, with availability varying by product or add-on.",
        },
      ],
    },
    workflow: {
      eyebrow: "What ProFixIQ optimizes",
      heading: "ProFixIQ starts with the repair handoff problem.",
      body:
        "The product is structured to keep the technician's finding from turning into a series of retyped notes and disconnected departmental records.",
      steps: [
        {
          title: "Capture",
          body: "The technician records the finding, including free-form voice inspection input where appropriate.",
        },
        {
          title: "Build",
          body: "Recommendation, parts, and labor can be authored while the technician still has the repair context.",
        },
        {
          title: "Review",
          body: "Parts and advisor workflows act on the technician-authored repair without silently converting it into an approved customer promise.",
        },
        {
          title: "Expose the right surface",
          body: "Customer, fleet, field, and driver users see the workflows appropriate to them rather than inheriting full shop functionality.",
        },
      ],
    },
    productProof: {
      eyebrow: "Decision guide",
      heading: "The better fit depends on what you need to optimize first.",
      body:
        "This is the practical distinction to test during a demo rather than relying on a long checkbox table.",
      media: brandedMedia,
      items: [
        {
          title: "Evaluate Fullbay for ecosystem breadth",
          body: "If mature third-party integrations, labor/service guides, established reporting, and a long-running heavy-duty platform are central requirements, Fullbay deserves serious evaluation.",
        },
        {
          title: "Evaluate ProFixIQ for technician-to-office continuity",
          body: "If the recurring problem is rebuilding technician findings into parts, estimates, approvals, and history, test ProFixIQ's inspection-to-repair workflow directly.",
        },
        {
          title: "Evaluate ProFixIQ for product boundaries",
          body: "If shop staff, service-truck operators, fleet managers, drivers, and customers should have intentionally different surfaces, compare those access boundaries side by side.",
        },
        {
          title: "Evaluate both with your real workflow",
          body: "Use the same customer, unit, inspection, repair recommendation, parts request, approval, and completion scenario in both systems before deciding.",
        },
      ],
    },
    faqs: [],
    finalCta: {
      eyebrow: "Compare the actual repair flow",
      heading: "Do not choose from a feature spreadsheet alone.",
      body:
        `Run a real repair through each platform and count the handoffs, re-entry, and role changes your team has to make. ${currentMarketNote}`,
    },
  },
};
