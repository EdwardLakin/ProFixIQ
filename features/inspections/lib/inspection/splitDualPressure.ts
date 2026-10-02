// A dual axle saved with one pressure per side (older templates and
// inspections) cannot record the inner tire. This renames that pressure to
// Outer and adds the matching Inner row, keeping any value already entered.

type PressureItem = { item?: string | null; unit?: string | null };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitDualPressureItems<T extends PressureItem>(
  items: readonly T[],
  axleLabel: string,
): Array<T | (PressureItem & { status: "na" })> {
  const axle = axleLabel.trim();
  const single = new RegExp(
    `^${escapeRegExp(axle)}\\s+(Left|Right)\\s+Tire Pressure$`,
    "i",
  );
  const labels = new Set(items.map((it) => String(it.item ?? "").trim().toLowerCase()));

  const out: Array<T | (PressureItem & { status: "na" })> = [];
  for (const it of items) {
    const hit = single.exec(String(it.item ?? "").trim());
    const side = hit?.[1];
    const inner = `${axle} ${side} Tire Pressure (Inner)`;
    if (!hit || labels.has(inner.toLowerCase())) {
      out.push(it);
      continue;
    }
    out.push({ ...it, item: `${axle} ${side} Tire Pressure (Outer)` });
    out.push({ item: inner, unit: it.unit ?? "psi", status: "na" });
  }
  return out;
}
