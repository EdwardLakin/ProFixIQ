import fs from "node:fs";
import path from "node:path";

const LEGAL_DOCS_DIR = path.join(process.cwd(), "docs", "legal");

export type LegalDocSlug =
  | "terms-of-service"
  | "privacy-policy"
  | "data-processing-addendum"
  | "acceptable-use-policy"
  | "subprocessor-list"
  | "ai-voice-data-policy";

export function loadLegalDoc(slug: LegalDocSlug): string {
  const filePath = path.join(LEGAL_DOCS_DIR, `${slug}.md`);
  return fs.readFileSync(filePath, "utf8");
}
