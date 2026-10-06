import Link from "next/link";

import {
  SearchComparison,
  SearchFaq,
  SearchFinalCta,
  SearchHero,
  SearchPainPoints,
  SearchProductProof,
  SearchWorkflow,
  type SearchLandingConfig,
} from "@/features/marketing/components/SearchLandingPage";
import { ProFixIQMark, ProFixIQWordmark } from "@shared/components/brand/ProFixIQBrand";
import Footer from "@shared/components/ui/Footer";

import type { SearchLandingSeo } from "./searchLanding";

export type CoreSearchPageDefinition = {
  seo: SearchLandingSeo;
  config: SearchLandingConfig;
  related: Array<{ label: string; href: string; description: string }>;
};

const commonFinalCta = {
  eyebrow: "See the workflow",
  heading: "Run the repair from one connected record.",
  body: "Explore ProFixIQ with a free trial or request access to the seeded demo shop to walk through the workflow before you commit.",
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
      title: "Keep the repair moving without rebuilding the same information at every desk.",
      lead:
        "ProFixIQ connects work orders, technician inspections, parts, approvals, field work, and fleet visibility so the repair record moves forward with the job.",
      proofPoints: [
        "Heavy-Duty • Automotive • Fleet",
        "Technician-built repairs",
        "Shop, Field Service, and Fleet surfaces",
      ],
      painPoints: {
        heading: "Heavy-duty shops lose time when every department has to recreate the repair.",
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
          { title: "Create", body: "Open the work order, capture the concern, and assign the technician." },
          { title: "Inspect", body: "Record findings and build recommendations from the technician workflow." },
          { title: "Quote & approve", body: "Carry parts and labor into advisor review and customer approval." },
          { title: "Complete", body: "Keep repair status, fulfillment, completion, and history connected." },
        ],
      },
      productProof: {
        heading: "Built around the people actually moving the job.",
        body:
          "ProFixIQ keeps role boundaries clear while preserving the same repair context across the operation.",
        items: [
          { title: "Technician is the source of truth", body: "Technician-authored findings, parts, and labor stay attached to the repair for review." },
          { title: "Parts stay tied to the work", body: "Parts requests and fulfillment remain connected to the repair instead of becoming a side conversation." },
          { title: "Customers and fleets get visibility", body: "Approval and maintenance-facing workflows can expose the information needed without opening the shop workspace." },
        ],
      },
      comparison: {
        heading: "Evaluate the workflow, not the feature checklist.",
        alternativeLabel: "Disconnected process",
        rows: [
          { capability: "Inspection to repair", profixiq: "Finding stays connected to the repair workflow", alternative: "Finding is re-entered or copied" },
          { capability: "Parts context", profixiq: "Request remains attached to the repair", alternative: "Separate message, note, or queue" },
          { capability: "Approval status", profixiq: "Approval is part of the repair lifecycle", alternative: "Status reconciled manually" },
          { capability: "Fleet visibility", profixiq: "Dedicated fleet-facing maintenance surface", alternative: "Shop-only view or manual updates" },
        ],
      },
      faqs: [],
      finalCta: commonFinalCta,
    },
    related: [],
  },
  dieselRepairShop: {
    seo: {
      title: "Diesel Repair Shop Software | ProFixIQ",
      description:
        "Diesel repair shop software for technician-led inspections, work orders, repair recommendations, parts, approvals, and heavy-duty service workflows.",
      path: "/diesel-repair-shop-software",
      keywords: ["diesel repair shop software", "diesel shop software", "truck repair software"],
      faqs: [
        { question: "What does ProFixIQ handle for a diesel repair shop?", answer: "ProFixIQ connects work orders, technician inspections, repair recommendations, parts activity, advisor review, customer approvals, field service, and repair history." },
        { question: "Can a diesel technician build the repair from the inspection?", answer: "Yes. Findings can carry technician-entered notes, parts, and labor into the repair workflow for advisor review." },
        { question: "Is ProFixIQ a heavy-truck labor time guide?", answer: "No. ProFixIQ focuses on shop operations and repair workflow rather than positioning itself as a heavy-truck book-time labor guide." },
      ],
    },
    config: {
      eyebrow: "Diesel repair shop software",
      title: "Give diesel technicians a faster path from finding the problem to building the repair.",
      lead: "Capture the finding once, keep technician-authored repair detail attached, and move parts, advisor review, approval, and completion through the same workflow.",
      proofPoints: ["Heavy-duty-first workflow", "Voice inspection support", "Technician-authored parts and labor"],
      painPoints: {
        heading: "The repair slows down when technician knowledge has to be translated repeatedly.",
        items: [
          { title: "The tech explains it twice", body: "A finding is documented, then repeated verbally or rewritten so another department can act on it." },
          { title: "Repair detail gets diluted", body: "Cause, recommendation, parts, and labor can lose context as they move between technician, advisor, and parts." },
          { title: "The bay waits on invisible blockers", body: "Parts, quote, approval, and status need to be visible without chasing another person for an update." },
        ],
      },
      workflow: {
        heading: "Let the technician build the repair, then let the shop review it.",
        steps: [
          { title: "Inspect", body: "Capture the concern and finding in the technician workflow." },
          { title: "Build", body: "Add the recommendation, required parts, and labor while the repair context is fresh." },
          { title: "Review", body: "Parts and advisor roles quote and review without replacing technician-authored detail." },
          { title: "Approve & repair", body: "Customer decisions and repair execution stay tied to the same line of work." },
        ],
      },
      productProof: {
        heading: "Designed for the way repair information is actually created.",
        items: [
          { title: "Free-form inspection capture", body: "Technicians can capture findings without forcing every diagnosis into a guided script." },
          { title: "Repair detail survives the handoff", body: "The shop reviews technician-authored information instead of recreating it." },
          { title: "Field work has its own surface", body: "Service-truck operations can use Field Service without exposing the full shop workspace." },
        ],
      },
      comparison: {
        heading: "A diesel shop system should reduce translation between roles.",
        alternativeLabel: "Typical handoff",
        rows: [
          { capability: "Technician finding", profixiq: "Captured in repair context", alternative: "Inspection note or verbal explanation" },
          { capability: "Parts and labor", profixiq: "Authored with the recommendation", alternative: "Added later by another role" },
          { capability: "Advisor review", profixiq: "Review the existing repair", alternative: "Rebuild the estimate from notes" },
          { capability: "Customer decision", profixiq: "Connected to the repair line", alternative: "Separate approval trail" },
        ],
      },
      faqs: [],
      finalCta: commonFinalCta,
    },
    related: [],
  },
  heavyDutyWorkOrder: {
    seo: {
      title: "Heavy-Duty Work Order Software | ProFixIQ",
      description:
        "Heavy-duty work order software that connects technician findings, repair lines, parts requests, estimates, approvals, communication, and completion.",
      path: "/heavy-duty-work-order-software",
      keywords: ["heavy duty work order software", "truck repair work order software", "diesel work order software"],
      faqs: [
        { question: "What stays connected to a ProFixIQ work order?", answer: "The work order workspace can keep repair lines, inspection context, parts, estimate and approval activity, communication, and timeline information together." },
        { question: "Can inspection recommendations become work order repairs?", answer: "Yes. Failed or recommended findings can carry technician-authored repair detail into the work order workflow for parts and advisor review." },
        { question: "Can different shop roles work from the same work order?", answer: "Yes. ProFixIQ uses one work order workspace with role and capability boundaries rather than separate copies of the job for each department." },
      ],
    },
    config: {
      eyebrow: "Heavy-duty work order software",
      title: "Make the work order the place the repair gets done—not just where it gets recorded.",
      lead: "Keep repair lines, inspection findings, technician detail, parts, approvals, communication, and job history in one operational workspace.",
      proofPoints: ["One work order workspace", "Role-aware access", "Inspection-to-repair continuity"],
      painPoints: {
        heading: "A work order becomes slow when it is only a container for information from other systems.",
        items: [
          { title: "Too many separate screens", body: "Technicians, advisors, and parts staff lose time finding the current version of the job." },
          { title: "Status is inferred instead of visible", body: "A shop should not need a conversation just to learn whether a repair is waiting on parts, quote, approval, or execution." },
          { title: "History loses the why", body: "Completed work is more useful when findings, decisions, parts, and repair context remain attached." },
        ],
      },
      workflow: {
        heading: "Queues find the work. The work order workspace does the work.",
        steps: [
          { title: "Open & assign", body: "Create the work order, define the concern, and assign the technician." },
          { title: "Build repair lines", body: "Carry inspection findings and technician recommendations into the workspace." },
          { title: "Move blockers", body: "Parts, quote, approval, and communication stay visible around the repair." },
          { title: "Complete & retain", body: "Finish the job with the repair context preserved for history." },
        ],
      },
      productProof: {
        heading: "One workspace, different capabilities.",
        items: [
          { title: "Technician context stays intact", body: "The person doing the diagnosis can author the repair detail that later roles review." },
          { title: "Advisor review stays deliberate", body: "Technician input does not automatically become a customer-facing promise without shop review." },
          { title: "Operational timeline remains visible", body: "The workspace keeps the job's movement and decisions in context rather than spreading them across disconnected records." },
        ],
      },
      comparison: {
        heading: "A work order should coordinate the repair, not just document it.",
        alternativeLabel: "Record-only WO",
        rows: [
          { capability: "Inspection findings", profixiq: "Flow into repair context", alternative: "Viewed separately" },
          { capability: "Parts requests", profixiq: "Connected to repair lines", alternative: "Handled outside the WO" },
          { capability: "Approval", profixiq: "Part of repair lifecycle", alternative: "Separate status or note" },
          { capability: "Role workflow", profixiq: "Shared workspace with capability boundaries", alternative: "Separate departmental screens" },
        ],
      },
      faqs: [],
      finalCta: commonFinalCta,
    },
    related: [],
  },
  heavyDutyInspection: {
    seo: {
      title: "Heavy-Duty Inspection Software | ProFixIQ",
      description:
        "Heavy-duty inspection software for technician findings, voice capture, failed and recommended items, repair recommendations, parts, labor, and work order follow-through.",
      path: "/heavy-duty-inspection-software",
      keywords: ["heavy duty inspection software", "diesel inspection software", "truck repair inspection software"],
      faqs: [
        { question: "Does ProFixIQ support voice inspections?", answer: "Yes. ProFixIQ supports voice-based technician inspection capture as part of its inspection workflow." },
        { question: "What happens when an inspection item fails or is recommended?", answer: "The finding can carry notes and technician-authored repair detail such as parts and labor forward for shop review and work order follow-through." },
        { question: "Can shops build inspection templates?", answer: "Yes. ProFixIQ includes inspection-template workflows and a master inspection list used across applicable shop, fleet, and field inspection scenarios." },
      ],
    },
    config: {
      eyebrow: "Heavy-duty inspection software",
      title: "Turn the inspection finding into usable repair work without typing it all over again.",
      lead: "Capture technician findings, fail or recommend items, add repair detail, and carry the result forward into the work order instead of leaving the inspection as a dead-end report.",
      proofPoints: ["Voice inspection capture", "Fail & recommend workflow", "Parts and labor can follow the finding"],
      painPoints: {
        heading: "An inspection has little operational value if the shop has to rebuild every failed item afterward.",
        items: [
          { title: "Findings stop at the report", body: "The inspection looks complete, but the advisor still has to reconstruct what should actually be sold or repaired." },
          { title: "Technician context disappears", body: "Notes, cause, recommendation, parts, and labor are most accurate while the technician is still in the inspection." },
          { title: "Recommended work gets lost", body: "Deferred or recommended items need durable context so the shop and customer can act on them later." },
        ],
      },
      workflow: {
        heading: "Capture once, then carry the finding forward.",
        steps: [
          { title: "Inspect", body: "Work through the inspection and capture findings, including voice where appropriate." },
          { title: "Fail or recommend", body: "Mark the item and document the condition and recommendation." },
          { title: "Build repair detail", body: "Add technician-authored parts and labor when the repair requires them." },
          { title: "Submit to workflow", body: "Carry the finding into work order, parts, advisor review, and approval flow." },
        ],
      },
      productProof: {
        heading: "The inspection is connected to the repair engine.",
        items: [
          { title: "Technician-authored findings persist", body: "Failed and recommended items retain the information entered by the technician." },
          { title: "No-parts-needed stays explicit", body: "A finding that does not require parts should not create an unnecessary parts request." },
          { title: "Templates can match the equipment", body: "Inspection templates can be built from the master list for different vehicle and equipment use cases." },
        ],
      },
      comparison: {
        heading: "The best inspection workflow ends in action, not another round of data entry.",
        alternativeLabel: "Standalone inspection",
        rows: [
          { capability: "Finding capture", profixiq: "Connected to repair workflow", alternative: "Report output" },
          { capability: "Recommendation", profixiq: "Can carry technician repair detail", alternative: "Free-text note" },
          { capability: "Parts and labor", profixiq: "Can be authored with finding", alternative: "Re-entered later" },
          { capability: "Work order follow-through", profixiq: "Finding moves into shop workflow", alternative: "Manual recreation" },
        ],
      },
      faqs: [],
      finalCta: commonFinalCta,
    },
    related: [],
  },
} satisfies Record<string, CoreSearchPageDefinition>;

const relatedPages = [
  { label: "Heavy-Duty Shop Management Software", href: "/heavy-duty-shop-management-software", description: "See the connected shop workflow across technicians, parts, advisors, approvals, and fleets." },
  { label: "Diesel Repair Shop Software", href: "/diesel-repair-shop-software", description: "See how ProFixIQ handles technician-led diesel repair operations." },
  { label: "Heavy-Duty Work Order Software", href: "/heavy-duty-work-order-software", description: "See the shared work order workspace and repair lifecycle." },
  { label: "Heavy-Duty Inspection Software", href: "/heavy-duty-inspection-software", description: "See how inspection findings flow into actionable repair work." },
];

function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#07111f]/95 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="ProFixIQ home">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5">
            <ProFixIQMark className="h-7 w-7" />
          </span>
          <ProFixIQWordmark className="block text-lg text-white" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/request-demo" className="hidden px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white sm:inline-flex">Request demo</Link>
          <Link href="/compare-plans" className="rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-bold text-[#07111f]">Start free trial</Link>
        </div>
      </div>
    </header>
  );
}

export function CoreSearchLandingPage({ definition }: { definition: CoreSearchPageDefinition }) {
  const config = { ...definition.config, faqs: definition.seo.faqs ?? [] };
  const related = relatedPages.filter((page) => page.href !== definition.seo.path);

  return (
    <div className="pfq-marketing min-h-screen bg-[color:var(--marketing-bg)] text-[color:var(--marketing-ink)]">
      <MarketingHeader />
      <main>
        <SearchHero config={config} />
        <SearchPainPoints section={config.painPoints} />
        <SearchWorkflow section={config.workflow} />
        <SearchProductProof section={config.productProof} />
        {config.comparison ? <SearchComparison section={config.comparison} /> : null}
        <section className="border-t border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)] py-16 sm:py-20">
          <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
            <div className="marketing-eyebrow">Related ProFixIQ workflows</div>
            <h2 className="marketing-heading mt-4">Explore the rest of the connected repair operation.</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {related.map((page) => (
                <Link key={page.href} href={page.href} className="rounded-2xl border border-[color:var(--marketing-border)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                  <h3 className="font-bold">{page.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--marketing-muted)]">{page.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <SearchFaq faqs={config.faqs} />
        <SearchFinalCta section={config.finalCta} />
      </main>
      <Footer />
    </div>
  );
}
