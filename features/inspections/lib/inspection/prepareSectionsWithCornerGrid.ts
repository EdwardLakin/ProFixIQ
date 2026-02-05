// features/inspections/lib/inspection/prepareSectionsWithCornerGrid.ts

export type CornerGridItem = { item: string; unit?: string | null };
export type CornerGridSection = { title: string; items: CornerGridItem[] };

const HYD_ITEM_RE = /^(LF|RF|LR|RR)\s+/i;
const AIR_ITEM_RE =
  /^(Steer\s*\d*|Drive\s*\d+|Rear\s*\d+|Tag|Trailer\s*\d+)\s+(Left|Right)\s+/i;

// Brake/corner-only signals (NOT tires)
function isBrakeCornerMetric(label: string): boolean {
  const l = (label || "").toLowerCase();
  return (
    l.includes("lining") ||
    l.includes("shoe") ||
    l.includes("pad") ||
    l.includes("rotor") ||
    l.includes("drum") ||
    l.includes("push rod") ||
    l.includes("pushrod") ||
    l.includes("wheel torque") ||
    l.includes("torque")
  );
}

// Tire-only signals (NOT brakes)
function isTireMetric(label: string): boolean {
  const l = (label || "").toLowerCase();
  return (
    l.includes("tire pressure") ||
    l.includes("tyre pressure") ||
    l.includes("pressure") ||
    l.includes("tread depth") ||
    /\btd\b/.test(l) ||
    l.includes("tread") ||
    l.includes("tire condition") ||
    l.includes("tyre condition") ||
    (l.includes("condition") && l.includes("tire")) ||
    l.includes("tire status") ||
    l.includes("tyre status") ||
    (l.includes("status") && l.includes("tire"))
  );
}

/**
 * IMPORTANT:
 * We must NOT treat "Tire Grid – Air Brake" as a "corner grid".
 * So this is intentionally strict and only matches true corner-grid sections.
 */
function looksLikeCornerTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return (
    t.includes("corner grid") ||
    t.includes("brake corner") ||
    t.includes("tires & brakes") ||
    t.includes("tires and brakes")
  );
}

function looksLikeTireGridTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return t.includes("tire grid") || (t.includes("tires") && t.includes("grid"));
}

function isBatteryTitle(title: string | undefined | null): boolean {
  if (!title) return false;
  return title.toLowerCase().includes("battery");
}

function isTireGridTitle(title: string | undefined | null): boolean {
  return looksLikeTireGridTitle(title);
}

function stripExistingCornerGrids<T extends CornerGridSection>(sections: T[]): T[] {
  return sections.filter((s) => {
    const items = s.items ?? [];

    // ✅ Never strip Tire Grid / Battery sections (title-based)
    if (looksLikeTireGridTitle(s.title)) return true;
    if (isBatteryTitle(s.title)) return true;

    // Strip only if it is clearly a BRAKE corner grid section
    const titleLooksCorner = looksLikeCornerTitle(s.title);
    const hasBrakeItems = items.some((it) => isBrakeCornerMetric(it.item || ""));

    // If the title indicates corner/brakes and it contains brake metrics, strip it
    if (titleLooksCorner && hasBrakeItems) return false;

    // If it matches injected grid (air/hyd patterns) AND contains brake metrics, strip it
    const looksHydBrake = items.some(
      (it) => HYD_ITEM_RE.test(it.item || "") && isBrakeCornerMetric(it.item || ""),
    );
    const looksAirBrake = items.some(
      (it) => AIR_ITEM_RE.test(it.item || "") && isBrakeCornerMetric(it.item || ""),
    );

    if (looksHydBrake || looksAirBrake) return false;

    // Otherwise keep it (preserves Tire Grid sections that use axle labels)
    return true;
  });
}

/**
 * IMPORTANT:
 * Corner grids are BRAKES/torque/push-rod ONLY (tires moved to Tire Grid).
 */
function buildHydraulicCornerSection(): CornerGridSection {
  const metrics: Array<{ label: string; unit: string | null }> = [
    { label: "Brake Pad", unit: "mm" },
    { label: "Rotor", unit: "mm" },
    { label: "Rotor Condition", unit: null },
    { label: "Rotor Thickness", unit: "mm" },
    { label: "Wheel Torque", unit: "ft·lb" },
  ];
  const corners = ["LF", "RF", "LR", "RR"] as const;

  const items: CornerGridItem[] = [];
  for (const c of corners) {
    for (const m of metrics) {
      items.push({ item: `${c} ${m.label}`, unit: m.unit });
    }
  }

  return { title: "Corner Grid (Hydraulic)", items };
}

/**
 * IMPORTANT:
 * Corner grids are BRAKES/torque/push-rod ONLY (tires moved to Tire Grid).
 * This helper injects a minimal “Steer 1 / Drive 1” set when needed.
 */
function buildAirCornerSection(): CornerGridSection {
  const steer: CornerGridItem[] = [
    { item: "Steer 1 Left Lining/Shoe", unit: "mm" },
    { item: "Steer 1 Right Lining/Shoe", unit: "mm" },
    { item: "Steer 1 Left Drum/Rotor", unit: "mm" },
    { item: "Steer 1 Right Drum/Rotor", unit: "mm" },
    { item: "Steer 1 Left Push Rod Travel", unit: "in" },
    { item: "Steer 1 Right Push Rod Travel", unit: "in" },
    { item: "Steer 1 Left Wheel Torque Outer", unit: "ft·lb" },
    { item: "Steer 1 Right Wheel Torque Outer", unit: "ft·lb" },
    { item: "Steer 1 Left Wheel Torque Inner", unit: "ft·lb" },
    { item: "Steer 1 Right Wheel Torque Inner", unit: "ft·lb" },
  ];

  const drive: CornerGridItem[] = [
    { item: "Drive 1 Left Lining/Shoe", unit: "mm" },
    { item: "Drive 1 Right Lining/Shoe", unit: "mm" },
    { item: "Drive 1 Left Drum/Rotor", unit: "mm" },
    { item: "Drive 1 Right Drum/Rotor", unit: "mm" },
    { item: "Drive 1 Left Push Rod Travel", unit: "in" },
    { item: "Drive 1 Right Push Rod Travel", unit: "in" },
    { item: "Drive 1 Left Wheel Torque Outer", unit: "ft·lb" },
    { item: "Drive 1 Right Wheel Torque Outer", unit: "ft·lb" },
    { item: "Drive 1 Left Wheel Torque Inner", unit: "ft·lb" },
    { item: "Drive 1 Right Wheel Torque Inner", unit: "ft·lb" },
  ];

  return { title: "Corner Grid (Air)", items: [...steer, ...drive] };
}

// If someone mislabeled a tire section as “corner grid”, correct it.
function normalizeMisTitledCornerSections<T extends CornerGridSection>(sections: T[]): T[] {
  return sections.map((sec) => {
    const titleLooksCorner = looksLikeCornerTitle(sec.title);
    if (!titleLooksCorner) return sec;

    const items = sec.items ?? [];
    const hasBrake = items.some((it) => isBrakeCornerMetric(it.item || ""));
    if (hasBrake) return sec;

    const hasTire = items.some((it) => isTireMetric(it.item || ""));
    if (!hasTire) return sec;

    const hasAirAxleLabels = items.some((it) => AIR_ITEM_RE.test(it.item || ""));
    const hasHydCornerLabels = items.some((it) => HYD_ITEM_RE.test(it.item || ""));

    const nextTitle =
      hasAirAxleLabels ? "Tire Grid – Air Brake" : hasHydCornerLabels ? "Tire Grid – Hydraulic" : "Tire Grid";

    return { ...sec, title: nextTitle };
  });
}

export function prepareSectionsWithCornerGrid<T extends CornerGridSection>(
  sections: T[],
  vehicleType: string | null | undefined,
  gridParam: string | null,
): T[] {
  const s0 = Array.isArray(sections) ? sections : [];

  // ✅ Fix bad upstream titles BEFORE we do the early “has corner grid” check.
  const s = normalizeMisTitledCornerSections(s0);

  // ✅ Only skip normalization if a REAL corner grid exists:
  // title looks corner AND it actually contains brake metrics.
  const hasRealCornerByTitle = s.some((sec) => {
    if (!looksLikeCornerTitle(sec.title)) return false;
    const items = sec.items ?? [];
    return items.some((it) => isBrakeCornerMetric(it.item || ""));
  });
  if (hasRealCornerByTitle) return s;

  // Remove any previously injected/legacy brake corner grids, but preserve tire/battery grids
  const withoutGrids = stripExistingCornerGrids(s);

  const gridMode = (gridParam || "").toLowerCase(); // air | hyd | none | ""
  if (gridMode === "none") return withoutGrids;

  let injectAir: boolean;
  if (gridMode === "air" || gridMode === "hyd") {
    injectAir = gridMode === "air";
  } else {
    const vt = (vehicleType || "").toLowerCase();
    const isAirByVehicle =
      vt.includes("truck") ||
      vt.includes("bus") ||
      vt.includes("coach") ||
      vt.includes("trailer") ||
      vt.includes("heavy") ||
      vt.includes("medium-heavy") ||
      vt.includes("air");
    injectAir = isAirByVehicle;
  }

  const cornerSection = injectAir
    ? (buildAirCornerSection() as T)
    : (buildHydraulicCornerSection() as T);

  // If air mode, optionally drop any legacy "hydraulic brake" sections (title-based)
  // BUT do not touch tire/battery grids since those are preserved above.
  let pool = withoutGrids;
  if (injectAir) {
    pool = pool.filter((sec) => {
      const t = (sec.title || "").toLowerCase();
      if (!t.includes("hydraulic")) return true;
      const hasBrakeItems = (sec.items ?? []).some((it) =>
        isBrakeCornerMetric(it.item || ""),
      );
      return !hasBrakeItems;
    });
  }

  if (!pool.length) return [cornerSection];

  // Keep Tire Grid immediately under corner grid, then Battery, then remaining
  const tireSections = pool.filter((sec) => isTireGridTitle(sec.title));
  const batterySections = pool.filter((sec) => isBatteryTitle(sec.title));
  const remaining = pool.filter(
    (sec) => !isTireGridTitle(sec.title) && !isBatteryTitle(sec.title),
  );

  return [cornerSection, ...tireSections, ...batterySections, ...remaining];
}