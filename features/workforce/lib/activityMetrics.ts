export function minutesBetween(start: string | null | undefined, end: string | null | undefined): number { if (!start || !end) return 0; const s = new Date(start).getTime(); const e = new Date(end).getTime(); if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0; return Math.round((e - s) / 60000); }
export function overlapMinutes(start: string, end: string | null, windowStart: string, windowEnd: string): number { const s = Math.max(new Date(start).getTime(), new Date(windowStart).getTime()); const e = Math.min(new Date(end ?? windowEnd).getTime(), new Date(windowEnd).getTime()); if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0; return Math.round((e - s) / 60000); }

export function sumPairedOverlapDurations(params: {
  events: Array<{
    shift_id?: string | null;
    event_type?: string | null;
    timestamp?: string | null;
  }>;
  startType: string;
  endType: string;
  windowStart: string;
  windowEnd: string;
}): number {
  const openByShift = new Map<string, string>();
  let total = 0;
  for (const event of [...params.events].sort((a, b) =>
    String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")),
  )) {
    if (!event.timestamp) continue;
    const shiftKey = event.shift_id ?? "unlinked";
    if (event.event_type === params.startType) {
      openByShift.set(shiftKey, event.timestamp);
      continue;
    }
    const openAt = openByShift.get(shiftKey);
    if (event.event_type === params.endType && openAt) {
      total += overlapMinutes(
        openAt,
        event.timestamp,
        params.windowStart,
        params.windowEnd,
      );
      openByShift.delete(shiftKey);
    }
  }
  for (const openAt of openByShift.values()) {
    total += overlapMinutes(
      openAt,
      null,
      params.windowStart,
      params.windowEnd,
    );
  }
  return Math.max(0, Math.round(total));
}

export function clampNonNegative(n: number): number { return Math.max(0, Math.round(Number.isFinite(n) ? n : 0)); }
export function sumPairedDurations(events: Array<{ event_type?: string | null; timestamp?: string | null }>, startType: string, endType: string, nowIso: string): number { let open: string | null = null; let total = 0; for (const e of [...events].sort((a,b)=>new Date(a.timestamp ?? 0).getTime()-new Date(b.timestamp ?? 0).getTime())) { if (!e.timestamp) continue; const t = String(e.event_type || "").toLowerCase(); if (t === startType) open = e.timestamp; if (t === endType && open) { total += minutesBetween(open, e.timestamp); open = null; } } if (open) total += minutesBetween(open, nowIso); return clampNonNegative(total); }
export function hasOverlaps(segments: Array<{ started_at: string; ended_at: string | null }>, windowEnd: string): boolean { const ranges = segments.map(s=>({s:new Date(s.started_at).getTime(), e:new Date(s.ended_at ?? windowEnd).getTime()})).sort((a,b)=>a.s-b.s); return ranges.some((r,i)=>i>0 && r.s < ranges[i-1].e); }
