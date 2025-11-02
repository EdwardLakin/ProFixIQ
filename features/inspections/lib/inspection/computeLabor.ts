// features/inspections/lib/inspection/computeLabor.ts
export function countAxlesFromSections(sections: Array<{ title?: string; items?: Array<{ item?: string; name?: string }> }>): number {
  const axlePrefix = /^(Steer\s+\d+|Drive\s+\d+|Tag|Trailer\s+\d+)\b/i;
  const set = new Set<string>();
  for (const s of sections ?? []) {
    for (const it of s.items ?? []) {
      const label = (it.item ?? it.name ?? "").trim();
      const m = label.match(axlePrefix);
      if (m) set.add(m[1].toLowerCase());
    }
  }
  return set.size || 1; // minimum 1 axle if we can’t tell
}

export function hasOilChange(sections: Array<{ title?: string }>): boolean {
  return (sections ?? []).some(s => (s.title ?? "").trim().toLowerCase() === "oil change");
}

export function computeDefaultLaborHours(opts: {
  vehicleType?: "car" | "truck" | "bus" | "trailer" | null;
  sections: Array<{ title?: string; items?: Array<{ item?: string; name?: string }> }>;
}): number {
  const vt = (opts.vehicleType ?? "").toLowerCase() as "car" | "truck" | "bus" | "trailer" | "";
  if (vt === "car") {
    return hasOilChange(opts.sections) ? 2.0 : 1.5;
  }
  // heavy-duty
  const axles = countAxlesFromSections(opts.sections);
  return Math.max(1, axles) * 1.0;
}
