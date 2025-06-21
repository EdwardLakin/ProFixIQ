type ParsedCommand =
  | { type: "add"; text: string }
  | { type: "measurement"; text: string }
  | { type: "recommend"; text: string }
  | { type: "na"; section: string }
  | { type: "undo" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "complete" }
  | { type: "unknown"; original: string };

const synonyms = {
  add: ["add", "replace", "install", "failed", "broken"],
  measurement: ["measurement", "measure", "size", "depth", "reading"],
  recommend: ["recommend", "watch", "monitor", "future"],
  na: ["n/a", "not applicable", "skip section"],
  undo: ["undo", "go back", "remove"],
  pause: ["pause", "stop for now"],
  resume: ["resume", "continue"],
  complete: ["complete", "done", "finish"],
};

export function parseCommand(input: string): ParsedCommand {
  const lower = input.toLowerCase().trim();

  if (matchAny(lower, synonyms.undo)) return { type: "undo" };
  if (matchAny(lower, synonyms.pause)) return { type: "pause" };
  if (matchAny(lower, synonyms.resume)) return { type: "resume" };
  if (matchAny(lower, synonyms.complete)) return { type: "complete" };

  if (matchAny(lower, synonyms.add)) return { type: "add", text: input };
  if (matchAny(lower, synonyms.measurement)) return { type: "measurement", text: input };
  if (matchAny(lower, synonyms.recommend)) return { type: "recommend", text: input };

  if (matchAny(lower, synonyms.na)) {
    const sectionMatch = input.match(/section (\w+)/i);
    const section = sectionMatch ? sectionMatch[1] : "unknown";
    return { type: "na", section };
  }

  return { type: "unknown", original: input };
}

function matchAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}