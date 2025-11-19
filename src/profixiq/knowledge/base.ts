/**
 * Lightweight, hard-coded knowledge base for the ProFixIQ agent.
 *
 * This is intentionally simple and file-based so we can:
 *  - keep core concepts/versioning in git
 *  - hydrate vector search or prompt scaffolding for the agent
 *
 * Later we can replace/augment this with DB-backed content.
 */

export type KnowledgeTag =
  | "ai"
  | "architecture"
  | "work_orders"
  | "inspections"
  | "payments"
  | "integrations"
  | "support"
  | "pricing";

export interface KnowledgeItem {
  id: string;
  title: string;
  body: string;
  tags: KnowledgeTag[];
  /**
   * Optional link back into the app (e.g. settings page, report, etc.)
   * so the agent can point users to the right screen.
   */
  appPath?: string;
}

/**
 * Seed knowledge items. Keep these high-level and durable; ephemeral,
 * shop-specific stuff belongs in the DB, not here.
 */
export const ProFixIQKnowledgeBase: KnowledgeItem[] = [
  {
    id: "ai-overview",
    title: "ProFixIQ AI overview",
    body: [
      "ProFixIQ uses AI to assist with inspections, quotes, and work orders.",
      "Key AI features include:",
      "- AI quote suggestions based on menu items and past work.",
      "- Inspection-to-quote automation, turning failed items into jobs.",
      "- Work-order and invoice review to highlight inconsistencies.",
      "- Future TechBot / InspectionBot style chat helpers for technicians.",
      "",
      "AI should never silently override user choices. Human edits, approvals,",
      "and overrides are always the source of truth and are used as training data.",
    ].join(" "),
    tags: ["ai", "architecture"],
    appPath: "/ai",
  },
  {
    id: "work-orders-core",
    title: "Work orders & job lines",
    body: [
      "A work order represents a single visit/RO. Individual jobs are tracked",
      "as work_order_lines, which may be created manually, from inspections,",
      "or from saved menu items. Approval state and technician assignment live",
      "on the line, not the work order.",
    ].join(" "),
    tags: ["work_orders", "architecture"],
    appPath: "/work-orders",
  },
  {
    id: "inspections-core",
    title: "Inspections & results",
    body: [
      "Inspections are built from configurable templates. Each template has",
      "sections and items with statuses like ok, fail, recommend, and na.",
      "Inspection results can be converted into quote/work-order lines by",
      "mapping failed items to saved menu items or ad-hoc jobs.",
    ].join(" "),
    tags: ["inspections", "ai"],
    appPath: "/inspections",
  },
  {
    id: "payments-core",
    title: "Stripe subscriptions & payments",
    body: [
      "ProFixIQ uses Stripe for subscription billing and card payments.",
      "Each shop has a Stripe customer record tied to its ProFixIQ account.",
      "Invoices and receipts are generated in Stripe but surfaced inside the app.",
    ].join(" "),
    tags: ["payments", "integrations"],
    appPath: "/settings/billing",
  },
];
