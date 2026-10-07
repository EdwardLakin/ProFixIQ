import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Coverage guard for spend governance. Every non-voice file that calls an AI
 * provider must go through budget governance: directly (`governAICall`), through
 * the usage-ledger wrapper (`ledgerOpenAICall`, which governs), through the
 * structured-JSON helper, or through the durable route-quota wrapper. A new call
 * site that skips all of them fails here instead of becoming ungoverned spend.
 */
const PROVIDER_CALL =
  /chat\.completions\.create|\.responses\.create|images\.generate|images\.edit|audio\.speech\.create|audio\.transcriptions\.create|embeddings\.create|api\.openai\.com\/v1\/(chat|responses|embeddings|images|audio)/;
const GOVERNED = /governAICall|ledgerOpenAICall|runOpenAIStructuredJson|withDurableAIQuota/;

/** Files that are intentionally outside shop budget governance, with the reason. */
const EXEMPT: Record<string, string> = {
  "features/shared/lib/server/naturalSpeech.ts":
    "Voice (text-to-speech). Voice spend ceilings and settlement are PR 4.",
  "features/ai/api/chatbot/route.ts":
    "Public marketing chatbot: no signed-in shop to charge. It has its own public route quota.",
  "scripts/backfill-intelligence-embeddings.mjs":
    "Operator script run by hand outside the app; it writes the usage ledger directly.",
};

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

describe("spend governance coverage", () => {
  const files = ["app", "features", "lib", "src", "scripts"].flatMap((dir) => {
    try {
      return walk(dir);
    } catch {
      return [];
    }
  });

  it("governs every non-voice provider call site", () => {
    const ungoverned = files.filter((file) => {
      if (file in EXEMPT) return false;
      const source = stripComments(readFileSync(file, "utf8"));
      return PROVIDER_CALL.test(source) && !GOVERNED.test(source);
    });
    expect(ungoverned).toEqual([]);
  });

  it("keeps the exemption list honest: every exempt file still calls a provider", () => {
    for (const file of Object.keys(EXEMPT)) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(PROVIDER_CALL.test(source), `${file} no longer calls a provider; remove its exemption`).toBe(true);
    }
  });

  it("never skips governance on a ledgered call without a stated reason", () => {
    const skipping = files.filter((file) => /skipGovernance\s*:\s*true/.test(stripComments(readFileSync(file, "utf8"))));
    expect(skipping).toEqual([]);
  });
});
