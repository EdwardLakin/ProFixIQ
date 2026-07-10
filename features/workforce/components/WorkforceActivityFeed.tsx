"use client";
import type { WorkforceActivityFeedItem } from "../lib/activityTypes";
function format(v: string, timezone?: string | null) { return new Intl.DateTimeFormat(undefined,{ hour:"numeric", minute:"2-digit", timeZone: timezone || undefined }).format(new Date(v)); }
export function formatWorkforceActivityAction(action: string, workOrderNumber?: string | null): string {
  const normalized = action.toLowerCase().replaceAll("_", " ").trim();
  const wo = workOrderNumber ? ` Work Order ${workOrderNumber}` : " Work Order";
  if (normalized.includes("hold")) return `Placed${wo} on Hold`;
  if (normalized.includes("resume")) return `Resumed${wo}`;
  if (normalized.includes("complete")) return `Completed${wo}`;
  if (normalized.includes("start") && normalized.includes("job")) return `Started${wo}`;
  if (normalized.includes("break start") || normalized === "start break") return "Started Break";
  if (normalized.includes("break end") || normalized === "end break") return "Ended Break";
  if (normalized.includes("lunch start") || normalized === "start lunch") return "Started Lunch";
  if (normalized.includes("lunch end") || normalized === "end lunch") return "Ended Lunch";
  if (normalized.includes("clock in") || normalized.includes("start shift")) return "Clocked In";
  if (normalized.includes("clock out") || normalized.includes("end shift")) return "Clocked Out";
  return action;
}
export function WorkforceActivityFeed({ items, timezone }: { items: WorkforceActivityFeedItem[]; timezone?: string | null }) { return <div className="space-y-2">{items.length ? items.map(i=><div key={i.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm"><span className="text-white">{format(i.timestamp, timezone)}</span><span className="text-neutral-400"> — </span><span className="text-neutral-200">{i.employeeName} {formatWorkforceActivityAction(i.action, i.workOrderNumber)}</span>{i.lineDescription ? <span className="text-neutral-400"> · {i.lineDescription}</span> : null}</div>) : <p className="text-sm text-neutral-400">No operational events available.</p>}</div>; }
