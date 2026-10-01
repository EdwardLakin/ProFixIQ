// One continuous phrase for a failed / recommended item:
//
//   "right rear brake chamber leaking, add rear brake chamber, clevis pins
//    and 1.5 labor"
//
// becomes item = RR brake chamber, status = fail, note = "leaking",
// parts = [rear brake chamber, clevis pins], labor = 1.5 h. Without this the
// quick local status match claimed the utterance and silently dropped
// everything after the problem word.
//
// Pure: item lookup is injected so this has no dependency on the interpreter.

import { extractSpokenLabor } from "@/features/inspections/lib/inspection/voice/spokenLabor";

export type CompoundFinding = {
  type: "inspection_finding";
  item: string;
  status: "fail" | "recommend";
  note?: string;
  parts?: Array<{ description: string; qty: number }>;
  laborHours?: number | null;
  openPhotoCapture: boolean;
  /** The head of the phrase (item + problem), used to locate the item on apply
   * so part names later in the sentence can never steer it elsewhere. */
  speechHint: string;
};

const RECOMMEND_RE = /\b(recommend|recommended|rec|suggest|suggested|monitor|watch)\b/i;
const FAIL_RE =
  /\b(fail|failed|fails|bad|leak|leaks|leaking|leaky|broken|cracked|crack|worn|worn out|damaged|torn|cut|bent|missing|seized|seizing|bulging|bulge|loose|stuck|out of adjustment)\b/i;
const OK_RE = /\b(ok|okay|pass|passed|good|fine|all good|looks good)\b/i;

const PART_MARKER_RE = /\b(add|adding|parts?|needs?|replace|replacing|install|installing)\b/i;
const NOT_A_PART_RE =
  /^(?:replacing|replacement|replaced|attention|service|adjustment|repair|repairs|work|a|an|the|it|this|that|new|some)?$/i;

const FILLER_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "has", "have", "side", "and", "its", "on",
  "right", "left", "front", "rear", "lf", "rf", "lr", "rr",
]);

// Say nothing the status field does not already say.
const STATUS_ONLY_WORDS = new Set([
  "fail", "failed", "fails", "bad", "recommend", "recommended", "rec", "suggest", "suggested",
]);

const QTY_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10,
};

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function parseParts(text: string): Array<{ description: string; qty: number }> {
  const out: Array<{ description: string; qty: number }> = [];
  for (const rawPiece of text.split(/,|;|\band\b/i)) {
    let piece = rawPiece
      .replace(/^[\s.]+|[\s.]+$/g, "")
      .replace(/^(?:add|adding|also|and|plus|parts?|the)\s+/i, "")
      .trim();
    if (!piece || NOT_A_PART_RE.test(piece)) continue;

    let qty = 1;
    const q = piece.match(/^(\d+|a|an|one|two|three|four|five|six|eight|ten)\s+(.+)$/i);
    if (q) {
      const n = /^\d+$/.test(q[1]) ? Number(q[1]) : QTY_WORDS[q[1].toLowerCase()];
      if (n && n > 0 && n <= 1000 && !/^a$/i.test(q[1])) {
        qty = n;
        piece = q[2].trim();
      } else if (/^an?$/i.test(q[1])) {
        piece = q[2].trim();
      }
    }
    if (piece) out.push({ description: capitalize(piece), qty });
  }
  return out;
}

export function parseCompoundFinding(
  speech: string,
  resolveItem: (hint: string) => string | null,
): CompoundFinding | null {
  const original = String(speech ?? "").trim();
  if (!original) return null;

  // 1. Labor first — it is unambiguous and removing it keeps its numbers out
  //    of the part list.
  const { hours, rest } = extractSpokenLabor(original);

  // 2. Split the problem statement from the part list.
  const marker = PART_MARKER_RE.exec(rest);
  const head = (marker ? rest.slice(0, marker.index) : rest).trim();
  const partsText = marker ? rest.slice(marker.index + marker[0].length) : "";

  const parts = partsText ? parseParts(partsText) : [];
  const hasPayload = parts.length > 0 || hours !== null;
  if (!hasPayload) return null;

  // 3. Status: the problem language in the head. A phrase that sounds fine
  //    ("brake chamber ok add ...") is not a finding.
  const isFail = FAIL_RE.test(head);
  const isRec = RECOMMEND_RE.test(head);
  if (!isFail && !isRec) return null;
  if (OK_RE.test(head) && !isFail) return null;
  const status: "fail" | "recommend" = isRec && !isFail ? "recommend" : "fail";

  // 4. Item: whatever the head names, minus the problem words.
  const itemHint = head
    .replace(new RegExp(FAIL_RE.source, "gi"), " ")
    .replace(new RegExp(RECOMMEND_RE.source, "gi"), " ")
    .replace(/[,.;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const item = itemHint ? resolveItem(itemHint) : null;
  if (!item) return null;

  // 5. Note: the problem words themselves ("leaking"), not the item words.
  const itemWords = new Set(words(item));
  const itemHintWords = new Set(words(itemHint));
  const noteWords = words(head).filter(
    (w) =>
      !FILLER_WORDS.has(w) &&
      !STATUS_ONLY_WORDS.has(w) &&
      !itemWords.has(w) &&
      !itemHintWords.has(w),
  );
  const note = noteWords.length > 0 ? noteWords.join(" ") : undefined;

  return {
    type: "inspection_finding",
    item,
    status,
    note,
    parts: parts.length > 0 ? parts : undefined,
    laborHours: hours,
    openPhotoCapture: true,
    speechHint: head,
  };
}

/**
 * Splits an utterance into sentence-level chunks (then / also / ; / .) and
 * glues follow-on lines back onto the finding they belong to. A transcript
 * routinely puts a period between the problem and its parts ("...leaking. Add
 * rear brake chamber, clevis pins and 1.5 labor."), which must stay one
 * finding, while "...leaking add X. Left front shock leaking add Y" stays two.
 */
export function chunkFindings(speech: string): string[] {
  const rough = String(speech ?? "")
    .replace(/\b(?:then|also|next)\b/gi, "|")
    .replace(/[;]+/g, "|")
    .replace(/(?<!\d)\.(?!\d)/g, "|")
    .split("|")
    .map((c) => c.replace(/^[\s,]+|[\s,]+$/g, ""))
    .filter(Boolean);

  const out: string[] = [];
  for (const chunk of rough) {
    const hasProblem = FAIL_RE.test(chunk) || RECOMMEND_RE.test(chunk);
    const followOn =
      !hasProblem &&
      (/^(?:add|adding|parts?|replace|replacing|needs?|plus|and|labou?r)\b/i.test(chunk) ||
        extractSpokenLabor(chunk).hours !== null);
    if (followOn && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}, ${chunk}`;
    } else {
      out.push(chunk);
    }
  }
  return out;
}
