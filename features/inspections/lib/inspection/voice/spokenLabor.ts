// Understands labor hours the way a technician actually says (and Realtime
// actually transcribes) them: "2 hours", ".5 labor", "point five hours",
// "one and a half hours", "half an hour", "labor two". Shared by the
// finding parsers so a spelled-out number can no longer drop the labor and
// leak its words into the part name.

const UNIT_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
};

const MAX_HOURS = 24;
const UNIT_TOKEN = /^(?:hours?|hrs?|h)$/;
const LABOR_TOKEN = /^(?:labou?r)$/;

function clean(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9.]/g, "").replace(/\.+$/, "");
}

function parseNumeral(token: string): number | null {
  if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) return Number(token);
  if (token in UNIT_WORDS) return UNIT_WORDS[token];
  return null;
}

function parseDigitWords(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  let out = "";
  for (const t of tokens) {
    if (/^\d+$/.test(t)) out += t;
    else if (t in DIGIT_WORDS) out += DIGIT_WORDS[t];
    else return null;
  }
  return out;
}

function parseNumberExpr(tokens: string[], allowArticle: boolean): number | null {
  const t = tokens;
  if (t.length === 0) return null;
  if (t.length === 1) {
    if (t[0] === "half") return 0.5;
    if (t[0] === "quarter") return 0.25;
    if (allowArticle && (t[0] === "a" || t[0] === "an")) return 1;
    return parseNumeral(t[0]);
  }
  if (
    (t[0] === "a" && t[1] === "half" && t.length === 2) ||
    (t[0] === "half" && (t[1] === "an" || t[1] === "a") && t.length === 2)
  ) {
    return 0.5;
  }
  if (t[0] === "point") {
    const frac = parseDigitWords(t.slice(1));
    return frac ? Number(`0.${frac}`) : null;
  }
  const pointAt = t.indexOf("point");
  if (pointAt > 0) {
    const whole = parseNumeral(t[pointAt - 1]);
    const frac = parseDigitWords(t.slice(pointAt + 1));
    if (whole === null || !frac || pointAt !== 1) return null;
    return Number(`${whole}.${frac}`);
  }
  if (t.length >= 3 && t[1] === "and") {
    const whole = parseNumeral(t[0]);
    const rest = t.slice(2);
    if (whole === null) return null;
    if (rest.length === 1 && rest[0] === "half") return whole + 0.5;
    if (rest.length === 2 && rest[0] === "a" && rest[1] === "half") return whole + 0.5;
  }
  return null;
}

function validHours(n: number | null): n is number {
  return n !== null && Number.isFinite(n) && n >= 0 && n <= MAX_HOURS;
}

function longestExprEndingAt(
  tokens: string[],
  end: number,
  allowArticle: boolean,
): { start: number; value: number } | null {
  for (let len = Math.min(5, end + 1); len >= 1; len -= 1) {
    const start = end - len + 1;
    const value = parseNumberExpr(tokens.slice(start, end + 1), allowArticle);
    if (validHours(value)) return { start, value };
  }
  return null;
}

function longestExprStartingAt(
  tokens: string[],
  start: number,
): { end: number; value: number } | null {
  for (let len = Math.min(5, tokens.length - start); len >= 1; len -= 1) {
    const end = start + len - 1;
    const value = parseNumberExpr(tokens.slice(start, end + 1), false);
    if (validHours(value)) return { end, value };
  }
  return null;
}

export type SpokenLabor = {
  hours: number | null;
  /** The input with the labor phrase removed; unchanged when none found. */
  rest: string;
};

export function extractSpokenLabor(input: string): SpokenLabor {
  const original = String(input ?? "");
  const tokens = original.split(/\s+/).filter(Boolean);
  const norm = tokens.map(clean);

  // "<number> hours" — the unit anchors the match.
  for (let i = 0; i < norm.length; i += 1) {
    if (!UNIT_TOKEN.test(norm[i])) continue;
    const hit = i > 0 ? longestExprEndingAt(norm, i - 1, true) : null;
    if (!hit) continue;
    let from = hit.start;
    // swallow an adjacent "labor" / "add" so they do not leak into notes
    while (from > 0 && /^(?:labou?r|add|and)$/.test(norm[from - 1])) from -= 1;
    let to = i;
    while (to + 1 < norm.length && LABOR_TOKEN.test(norm[to + 1])) to += 1;
    return {
      hours: hit.value,
      rest: [...tokens.slice(0, from), ...tokens.slice(to + 1)].join(" "),
    };
  }

  // "add .5 labor" / "labor .5" — no unit, so the word "labor" anchors it.
  for (let i = 0; i < norm.length; i += 1) {
    if (!LABOR_TOKEN.test(norm[i])) continue;
    const before = i > 0 ? longestExprEndingAt(norm, i - 1, false) : null;
    if (before) {
      let from = before.start;
      while (from > 0 && /^(?:add|and)$/.test(norm[from - 1])) from -= 1;
      return {
        hours: before.value,
        rest: [...tokens.slice(0, from), ...tokens.slice(i + 1)].join(" "),
      };
    }
    const after = longestExprStartingAt(norm, i + 1);
    if (after) {
      let from = i;
      while (from > 0 && /^(?:add|and)$/.test(norm[from - 1])) from -= 1;
      return {
        hours: after.value,
        rest: [...tokens.slice(0, from), ...tokens.slice(after.end + 1)].join(" "),
      };
    }
  }

  return { hours: null, rest: original };
}

/**
 * True when the whole utterance is just a labor line ("add .5 labor",
 * "labor one and a half hours") — safe to apply locally to the last item
 * without asking the model.
 */
export function parseStandaloneLabor(input: string): number | null {
  const { hours, rest } = extractSpokenLabor(input);
  if (hours === null) return null;
  const leftover = rest
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(?:add|and|also|of|for|to|it|this|that|the|a|more|another|extra|labou?r)$/.test(w));
  return leftover.length === 0 ? hours : null;
}
