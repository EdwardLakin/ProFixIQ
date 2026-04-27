/**
 * Client-safe deterministic part-name inference.
 *
 * IMPORTANT:
 * This file is imported by React components/pages, so it must not import
 * server-only OpenAI helpers, even dynamically.
 *
 * If true AI inference is needed later, expose it through an API route or
 * server action and call that from the UI.
 */
export async function inferPartName(description: string): Promise<string> {
  const text = String(description ?? "").toLowerCase();

  const rules: Array<[RegExp, string]> = [
    [/\b(brake|pads?|rotors?|calipers?)\b/, "Brake component"],
    [/\b(battery|charging|alternator|starter)\b/, "Electrical component"],
    [/\b(tire|wheel|rim|tpms)\b/, "Wheel/tire component"],
    [/\b(oil|filter|lube)\b/, "Oil filter"],
    [/\b(coolant|radiator|thermostat|water pump|overheat)\b/, "Cooling system component"],
    [/\b(spark plug|ignition|coil|misfire)\b/, "Ignition component"],
    [/\b(suspension|strut|shock|control arm|ball joint|tie rod)\b/, "Suspension/steering component"],
    [/\b(exhaust|muffler|converter|oxygen sensor|o2 sensor)\b/, "Exhaust component"],
    [/\b(transmission|clutch|torque converter)\b/, "Transmission component"],
    [/\b(fuel|injector|pump)\b/, "Fuel system component"],
  ];

  for (const [pattern, partName] of rules) {
    if (pattern.test(text)) return partName;
  }

  const cleaned = String(description ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s\-./]/g, "")
    .trim();

  return cleaned ? cleaned.slice(0, 80) : "Unknown part";
}
