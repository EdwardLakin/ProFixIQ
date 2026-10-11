import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  "features/ops/components/OpsBlogManager.tsx",
  "utf8",
);

describe("Ops blog image placement and preview", () => {
  it("makes hero and inline alt text explicit", () => {
    expect(editor).toContain("Hero image alt text");
    expect(editor).toContain("Inline image alt text");
    expect(editor).toContain("Add hero image alt text before uploading.");
    expect(editor).toContain("Add inline image alt text before uploading.");
  });

  it("remembers the article caret and inserts inline images at that position", () => {
    expect(editor).toContain("bodySelectionRef");
    expect(editor).toContain("rememberBodySelection");
    expect(editor).toContain("Current insertion point: line {selectionLine}");
    expect(editor).toContain("Add image at cursor");
    expect(editor).toContain('insertRawMarkdown(`\\n\\n![${alt}](${payload.url})\\n\\n`)');
    expect(editor).toContain("onBlur={rememberBodySelection}");
  });

  it("provides an explicit live preview using public marketing article styling", () => {
    expect(editor).toContain('type EditorView = "write" | "preview"');
    expect(editor).toContain("Live article preview — updates from the unsaved editor");
    expect(editor).toContain("<ArticlePreview article={editor} />");
    expect(editor).toContain("pfq-marketing");
    expect(editor).toContain("prose prose-slate");
    expect(editor).toContain("<ReactMarkdown remarkPlugins={[remarkGfm]}");
  });
});
