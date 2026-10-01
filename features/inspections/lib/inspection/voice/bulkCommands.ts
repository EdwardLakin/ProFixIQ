// "All tire pressures 110", "front brake pads 8, rear brake pads 9",
// "all tread depths 7": one phrase that sets a whole group of tire-grid items.
//
// Pure on purpose — it works from the session's item labels and returns the
// exact (section, item) targets, so the screen applies each one with the same
// explicit-index commands the rest of voice control already uses.

export type BulkMetric = "pressure" | "tread" | "pad";
export type BulkScope = "all" | "front" | "rear";
export type BulkStatus = "ok" | "fail" | "recommend" | "na";

export type BulkTarget = {
  sectionIndex: number;
  itemIndex: number;
  label: string;
};

export type BulkCommand = {
  scope: BulkScope;
  metric: BulkMetric;
  /** Set when a number was spoken. */
  value?: number;
  unit?: string;
  /** Set when a status word was spoken instead of a number. */
  status?: BulkStatus;
  targets: BulkTarget[];
};

type SessionLike = {
  sections?: Array<{ items?: Array<{ item?: unknown; name?: unknown }> }>;
};

const NUM = "-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const UNIT = "(?:psi|kpa|mm|mil|mils|32nds?|thirty\\s*seconds?|inch|inches)";
const STATUS =
  "(?:ok|okay|pass|passed|good|fail|failed|recommend|recommended|rec|na|n\\/a|not\\s+applicable)";

const METRIC_ALTS = [
  "(?:tire|tyre)\\s+pressures?",
  "pressures?",
  "(?:tire\\s+)?tread(?:\\s+depths?)?",
  "(?:brake\\s+)?(?:pads?|linings?|shoes?)(?:\\s+thickness)?",
].join("|");

const BULK_RE = new RegExp(
  `\\b(all|every|front|rear)\\s+(?:the\\s+)?(${METRIC_ALTS})\\s+(?:(?:is|are|at|to|of)\\s+)?(?:(${NUM})(?:\\s*(${UNIT}))?|(${STATUS}))\\b`,
  "gi",
);

function normSpeech(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^\w\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metricOf(phrase: string): BulkMetric {
  if (/pressure/.test(phrase)) return "pressure";
  if (/tread/.test(phrase)) return "tread";
  return "pad";
}

function scopeOf(word: string): BulkScope {
  if (word === "front") return "front";
  if (word === "rear") return "rear";
  return "all";
}

function statusOf(word: string): BulkStatus {
  const w = word.replace(/\s+/g, " ");
  if (/^(ok|okay|pass|passed|good)$/.test(w)) return "ok";
  if (/^(fail|failed)$/.test(w)) return "fail";
  if (/^(recommend|recommended|rec)$/.test(w)) return "recommend";
  return "na";
}

function normLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tire-grid corner items carry a corner code or an axle + side prefix. */
function isGridCorner(l: string): boolean {
  return (
    /\b(lf|rf|lr|rr)\b/.test(l) ||
    /\b(left|right)\s+(front|rear)\b|\b(front|rear)\s+(left|right)\b/.test(l) ||
    /^(steer|drive|trailer|tag)\b.*\b(left|right)\b/.test(l)
  );
}

function matchesMetric(l: string, metric: BulkMetric): boolean {
  if (metric === "pressure") return /\bpressure\b/.test(l);
  if (metric === "tread") return /\btread\b/.test(l);
  return /\b(pad|lining|shoe)\b/.test(l) && !/\b(drum|rotor|condition)\b/.test(l);
}

function matchesScope(l: string, scope: BulkScope): boolean {
  if (scope === "all") return true;
  const front =
    /\b(lf|rf)\b|\bfront\b/.test(l) || /^steer\b/.test(l);
  const rear =
    /\b(lr|rr)\b|\brear\b/.test(l) || /^(drive|trailer|tag)\b/.test(l);
  return scope === "front" ? front && !rear : rear && !front;
}

function targetsFor(
  session: SessionLike,
  metric: BulkMetric,
  scope: BulkScope,
): BulkTarget[] {
  const out: BulkTarget[] = [];
  (session.sections ?? []).forEach((section, sectionIndex) => {
    (section.items ?? []).forEach((it, itemIndex) => {
      const label = String(it.item ?? it.name ?? "").trim();
      if (!label) return;
      const l = normLabel(label);
      if (!isGridCorner(l)) return;
      if (!matchesMetric(l, metric)) return;
      if (!matchesScope(l, scope)) return;
      out.push({ sectionIndex, itemIndex, label });
    });
  });
  return out;
}

export type BulkParse = {
  commands: BulkCommand[];
  /** The utterance with every recognised bulk phrase removed. */
  rest: string;
};

/**
 * Finds every bulk phrase in the utterance. Phrases that match no item in the
 * session (no grid of that kind) are left in `rest` rather than swallowed, so
 * they can still be interpreted the normal way.
 */
export function parseBulkCommands(speech: string, session: SessionLike): BulkParse {
  const text = normSpeech(speech);
  const commands: BulkCommand[] = [];
  let rest = text;

  for (const m of text.matchAll(BULK_RE)) {
    const scope = scopeOf(m[1]);
    const metric = metricOf(m[2]);
    const targets = targetsFor(session, metric, scope);
    if (targets.length === 0) continue;

    const cmd: BulkCommand = { scope, metric, targets };
    if (m[3] !== undefined) {
      const value = Number(m[3]);
      if (!Number.isFinite(value)) continue;
      cmd.value = value;
      if (m[4]) {
        const u = m[4].toLowerCase();
        cmd.unit = /psi|kpa/.test(u) ? u.replace("kpa", "kPa") : /mm/.test(u) ? "mm" : undefined;
      }
    } else if (m[5]) {
      cmd.status = statusOf(m[5].toLowerCase());
    } else {
      continue;
    }

    commands.push(cmd);
    rest = rest.replace(m[0], " ");
  }

  return { commands, rest: rest.replace(/\s+/g, " ").trim() };
}
