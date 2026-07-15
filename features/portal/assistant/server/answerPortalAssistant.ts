import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

import type { PortalActor } from "@/features/portal/server/requirePortalActor";
import type {
  PortalAssistantAnswer,
  PortalAssistantContext,
  PortalAssistantMessage,
} from "../types";

type DB = Database;

const STOP_WORDS = new Set([
  "a", "about", "again", "completed", "did", "do", "for", "i", "is", "it",
  "last", "me", "my", "of", "on", "repair", "service", "the", "this", "time",
  "to", "vehicle", "was", "when", "you",
]);

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function portalServiceTerms(question: string): string[] {
  return Array.from(new Set(question.toLowerCase().replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/).filter((term) => term.length > 2 && !STOP_WORDS.has(term))));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "an unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "an unknown date"
    : new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

export function portalRequestedDate(question: string): string | null {
  const iso = question.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (iso && !Number.isNaN(new Date(`${iso}T12:00:00`).getTime())) return iso;
  const monthDate = question.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+20\d{2})?\b/i)?.[0];
  if (!monthDate) return null;
  const withYear = /20\d{2}/.test(monthDate) ? monthDate : `${monthDate}, ${new Date().getFullYear()}`;
  const parsed = new Date(withYear);
  if (Number.isNaN(parsed.getTime())) return null;
  const local = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

function lineScore(line: { description?: string | null; complaint?: string | null; cause?: string | null; correction?: string | null }, terms: string[]): number {
  const text = [line.description, line.complaint, line.cause, line.correction].filter(Boolean).join(" ").toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

export async function answerPortalAssistant(args: {
  supabase: SupabaseClient<DB>;
  actor: PortalActor;
  question: string;
  context?: PortalAssistantContext;
  messages?: PortalAssistantMessage[];
}): Promise<PortalAssistantAnswer> {
  const question = args.question.trim();
  const previousUserQuestion = (args.messages ?? [])
    .filter((message) => message.role === "user" && message.content.trim() !== question)
    .at(-1)?.content ?? "";
  const shortFollowUp = question.split(/\s+/).length <= 4 &&
    includesAny(question.toLowerCase(), ["it", "that", "this", "why", "when", "what about"]);
  const q = `${shortFollowUp ? previousUserQuestion : ""} ${question}`.toLowerCase();
  const customerId = args.actor.customer.id;
  const shopId = args.actor.customer.shop_id;

  if (includesAny(q, ["appointment", "book", "schedule", "available time", "come in"])) {
    const date = portalRequestedDate(question);
    let shopSlug: string | null = null;
    if (shopId) {
      const { data, error } = await args.supabase.from("shops").select("slug")
        .eq("id", shopId).maybeSingle();
      if (error) throw new Error(error.message);
      shopSlug = data?.slug ?? null;
    }
    const params = new URLSearchParams();
    if (shopSlug) params.set("shop", shopSlug);
    if (date) params.set("requestedDate", date);
    const href = `/portal/booking${params.size > 0 ? `?${params.toString()}` : ""}`;
    return {
      intent: "appointment",
      summary: date
        ? `I can help you request an appointment for ${formatDate(date)}. Choose an available time on the next screen, then confirm it.`
        : "I can help you request an appointment. Choose a date and an available time on the booking screen, then confirm it.",
      bullets: [
        "The assistant will not submit or change an appointment until you choose the exact available time.",
        "The shop will show the request status in your portal after submission.",
      ],
      actions: [{ label: date ? "Choose a time for this date" : "Choose a date and time", href }],
    };
  }

  const wantsStatus = includesAny(q, ["status", "where is my", "ready", "progress", "done yet"]);
  const wantsExplanation = includesAny(q, ["explain", "what does", "why does", "why is", "repair mean", "quote mean"]);
  const wantsHistory = includesAny(q, ["last time", "history", "previous", "when was", "done before"]);
  if (!wantsHistory && (wantsStatus || wantsExplanation || args.context?.workOrderId)) {
    let workOrdersQuery = args.supabase.from("work_orders").select(
      "id,custom_id,status,updated_at,vehicle_id,work_order_lines(id,description,complaint,cause,correction,status,price_estimate)",
    ).eq("customer_id", customerId).order("updated_at", { ascending: false }).limit(10);
    if (shopId) workOrdersQuery = workOrdersQuery.eq("shop_id", shopId);
    if (args.context?.workOrderId) workOrdersQuery = workOrdersQuery.eq("id", args.context.workOrderId);
    const { data, error } = await workOrdersQuery;
    if (error) throw new Error(error.message);
    const workOrders = (data ?? []) as Array<{
      id: string;
      custom_id: string | null;
      status: string | null;
      updated_at: string | null;
      work_order_lines?: Array<{
        id: string;
        description: string | null;
        complaint: string | null;
        cause: string | null;
        correction: string | null;
        status: string | null;
        price_estimate: number | null;
      }> | null;
    }>;
    const workOrder = workOrders[0];
    if (!workOrder) {
      return {
        intent: wantsStatus ? "status" : "repair_explanation",
        summary: "I could not find a matching repair record in your portal account.",
        bullets: ["Try opening the work order or quote first, then ask again from that page."],
        actions: [{ label: "View my service records", href: "/portal/history" }],
      };
    }

    if (wantsStatus && !wantsExplanation) {
      return {
        intent: "status",
        summary: `Work order ${workOrder.custom_id ? `#${workOrder.custom_id}` : workOrder.id.slice(0, 8)} is currently ${workOrder.status?.replaceAll("_", " ") ?? "being reviewed"}.`,
        bullets: [
          `Last updated ${formatDate(workOrder.updated_at)}.`,
          "Approvals, invoices, and pickup readiness shown in the portal are the authoritative next steps.",
        ],
        actions: [{ label: "Open live repair status", href: "/portal/status" }],
      };
    }

    const terms = portalServiceTerms(question);
    const lines = [...(workOrder.work_order_lines ?? [])]
      .sort((left, right) => lineScore(right, terms) - lineScore(left, terms));
    const line = lines[0];
    if (!line) {
      return {
        intent: "repair_explanation",
        summary: "The shop has not added enough repair-line detail for me to explain this accurately yet.",
        bullets: ["I will not invent a diagnosis or repair that is not in your shop record."],
        actions: [{ label: "View approvals", href: "/portal/approvals" }],
      };
    }
    return {
      intent: "repair_explanation",
      summary: line.description ?? line.correction ?? line.complaint ?? "This repair line is still being documented.",
      bullets: [
        line.complaint ? `Why it came in: ${line.complaint}` : null,
        line.cause ? `What the shop found: ${line.cause}` : null,
        line.correction ? `What the proposed or completed repair does: ${line.correction}` : null,
        `Recorded status: ${line.status?.replaceAll("_", " ") ?? "not recorded"}.`,
      ].filter((value): value is string => Boolean(value)),
      actions: [
        { label: "Review approvals", href: "/portal/approvals" },
        { label: "View service history", href: "/portal/history" },
      ],
    };
  }

  if (wantsHistory) {
    const { data, error } = await args.supabase.from("history")
      .select("id,service_date,created_at,description,notes,vehicle_id")
      .eq("customer_id", customerId)
      .order("service_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const terms = portalServiceTerms(question);
    const matching = terms.length === 0 ? rows : rows.filter((row) => {
      const text = `${row.description ?? ""} ${row.notes ?? ""}`.toLowerCase();
      return terms.some((term) => text.includes(term));
    });
    const latest = matching[0];
    if (!latest) {
      return {
        intent: "service_history",
        summary: terms.length > 0
          ? "I could not find that service in the history connected to your portal account."
          : "There is no completed service history connected to your portal account yet.",
        bullets: ["The assistant searches only records that belong to your signed-in customer account."],
        actions: [{ label: "View all service history", href: "/portal/history" }],
      };
    }
    return {
      intent: "service_history",
      summary: `${latest.description?.trim() || "The matching service"} was last recorded on ${formatDate(latest.service_date ?? latest.created_at)}.`,
      bullets: latest.notes ? [latest.notes.slice(0, 500)] : [],
      actions: [{ label: "View all service history", href: "/portal/history" }],
    };
  }

  return {
    intent: "help",
    summary: "I can help with your own service history, explain a recorded repair, check repair status, or start an appointment request.",
    bullets: [
      "Try: “When was my last oil service?”",
      "Try: “Explain this repair to me.”",
      "Try: “Book me an appointment for 2026-08-12.”",
    ],
    actions: [],
  };
}
