"use client";
import React, { useMemo, useState } from "react";

export type PlannerEvent =
  | { kind: "plan"; text: string; goal?: string }
  | { kind: "tool_call"; name: string; input: unknown }
  | { kind: "tool_result"; name: string; output: unknown }
  | { kind: "wo.created"; workOrderId: string; customerId: string; vehicleId: string }
  | { kind: "final"; text: string }
  | { kind: "error"; message?: string };

type Props = {
  events: PlannerEvent[];
  title?: string;
  /** Optional raw text stream to show in the toggle area */
  raw?: string;
};

const ICON: Record<string, string> = {
  plan: "🧭",
  tool_call: "🛠️",
  tool_result: "📦",
  "wo.created": "📄",
  final: "✅",
  error: "⚠️",
};

/** Detects large or HTML/code payloads for redaction */
function looksLikeBlob(x: unknown): boolean {
  if (!x) return false;
  const s = typeof x === "string" ? x : JSON.stringify(x);
  if (s.length > 1200) return true;
  if (/<(html|head|body)[\s>]/i.test(s)) return true; // HTML
  if (/```/.test(s)) return true; // fenced code
  return false;
}

/** Creates concise text summaries for tool events */
function summarizeTool(name: string, inputOrOutput: unknown, isResult: boolean): string | null {
  if (name === "create_work_order" && isResult) {
    const id = (inputOrOutput as any)?.workOrderId;
    return id ? `Created work order ${id.slice(0, 8)}…` : "Created work order.";
  }
  if (name === "add_work_order_line" && isResult) {
    const id = (inputOrOutput as any)?.lineId;
    return id ? `Added line ${id.slice(0, 8)}…` : "Added a work order line.";
  }
  if (name === "find_customer_vehicle") {
    const top = (inputOrOutput as any) ?? {};
    const c = top.customerId ? "customer ✓" : "customer ?";
    const v = top.vehicleId ? "vehicle ✓" : "vehicle ?";
    return `Matched ${c}, ${v}.`;
  }
  if (name === "generate_invoice_html") {
    return isResult ? "Generated invoice HTML." : "Generating invoice…";
  }
  if (name === "email_invoice") {
    return isResult ? "Emailed invoice." : "Emailing invoice…";
  }
  if (name === "create_customer" && isResult) return "Created customer.";
  if (name === "create_vehicle" && isResult) return "Created vehicle.";
  if (name === "attach_photo_to_work_order") {
    return isResult ? "Attached photo." : "Attaching photo…";
  }
  return isResult ? `Finished ${name}.` : `Calling ${name}…`;
}

/** Main user-friendly agent stream component */
export default function PlannerStream({ events, title = "Activity", raw }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  const bullets = useMemo(() => {
    const out: { icon: string; text: string }[] = [];

    for (const e of events ?? []) {
      switch (e.kind) {
        case "plan":
          out.push({ icon: ICON.plan, text: e.text || "Planning…" });
          break;

        case "tool_call": {
          const note = summarizeTool(e.name, e.input, false);
          if (note) out.push({ icon: ICON.tool_call, text: note });
          break;
        }

        case "tool_result": {
          const note = summarizeTool(e.name, e.output, true);
          if (note) out.push({ icon: ICON.tool_result, text: note });
          break;
        }

        case "wo.created":
          out.push({
            icon: ICON["wo.created"],
            text: `Work order created (WO ${e.workOrderId.slice(0, 8)}…).`,
          });
          break;

        case "final":
          out.push({ icon: ICON.final, text: e.text || "Done." });
          break;

        case "error":
          out.push({ icon: ICON.error, text: e.message || "Something went wrong." });
          break;
      }
    }

    // collapse consecutive duplicates
    const collapsed: { icon: string; text: string }[] = [];
    for (const b of out) {
      const prev = collapsed[collapsed.length - 1];
      if (prev && prev.text === b.text) continue;
      collapsed.push(b);
    }
    return collapsed;
  }, [events]);

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-200">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold">{title}</div>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs text-orange-400 hover:underline"
          aria-expanded={showRaw}
        >
          {showRaw ? "Hide raw log" : "Show raw log"}
        </button>
      </div>

      {/* Clean bullet list */}
      <ul className="space-y-1 pl-1">
        {bullets.length === 0 ? (
          <li className="text-neutral-400">No activity yet…</li>
        ) : (
          bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden>{b.icon}</span>
              <span>{b.text}</span>
            </li>
          ))
        )}
      </ul>

      {/* Toggleable raw log */}
      {showRaw && (
        <pre className="mt-3 max-h-64 overflow-auto rounded bg-black/40 p-2 text-[11px] leading-snug">
          {raw && raw.trim()
            ? raw
            : JSON.stringify(
                events,
                (_k, v) => (looksLikeBlob(v) ? "[hidden payload]" : v),
                2
              )}
        </pre>
      )}
    </div>
  );
}