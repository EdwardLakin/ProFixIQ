// Which unit system a form's own printed units use, so the inspection opens
// in it instead of always starting metric.

const IMPERIAL_RE = /(?:^|\b)(?:32nds?|\/\s*32|psi|in|inch(?:es)?|ft[\s·.-]*lbs?)(?:\b|$)|"$/i;
const METRIC_RE = /(?:^|\b)(?:mm|kpa|bar|n[\s·.-]*m|cm)(?:\b|$)/i;

type UnitItem = { unit?: string | null };

/**
 * "imperial" or "metric" by which the template's explicit units favour, null
 * when there are none or they tie (the default then stands).
 */
export function inferUnitSystem(
  sections: ReadonlyArray<{ items?: ReadonlyArray<UnitItem> | null }>,
): "metric" | "imperial" | null {
  let imperial = 0;
  let metric = 0;
  for (const section of sections) {
    for (const item of section.items ?? []) {
      const unit = String(item.unit ?? "").trim();
      if (!unit) continue;
      if (IMPERIAL_RE.test(unit)) imperial += 1;
      else if (METRIC_RE.test(unit)) metric += 1;
    }
  }
  // Mixed forms (32nds tread beside mm linings) follow the larger share.
  if (imperial > metric) return "imperial";
  if (metric > imperial) return "metric";
  return null;
}
